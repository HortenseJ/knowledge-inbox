import { App, Modal, Notice, Setting } from "obsidian";
import type {
	CategoryRoute,
	PromptMode,
	VaultProfile,
	WriteMode,
} from "../domain/vault-profile";
import { parseVaultProfile } from "../parsing/parse-vault-profile";
import { getBuiltinSourcePrompt } from "../prompts/default-processing-prompts";
import { VaultFolderSuggest } from "./vault-folder-suggest";
import { VaultMarkdownFileSuggest } from "./vault-markdown-file-suggest";
import { ContentPreviewModal } from "./content-preview-modal";
import { renderDefaultWikiTemplate } from "../templates/default-wiki-template";
import { CategoryImportPreviewModal } from "./category-import-preview-modal";

type PromptKey = keyof VaultProfile["prompts"];
type MetadataKey = keyof VaultProfile["metadataFields"];

/**
 * Cross-platform graphical editor for the syncable Knowledge Inbox profile.
 */
export class ProfileSettingsModal extends Modal {
	private readonly draft: VaultProfile;
	private routesEl: HTMLElement | null = null;
	private saving = false;

	constructor(
		app: App,
		profile: VaultProfile,
		private readonly onSave: (profile: VaultProfile) => Promise<void>,
		private readonly onImportCategories: (promptText: string) => Promise<CategoryRoute[]>,
	) {
		super(app);
		this.draft = JSON.parse(JSON.stringify(profile)) as VaultProfile;
	}

	onOpen(): void {
		this.modalEl.addClass("knowledge-inbox-profile-shell");
		this.render();
	}

	/**
	 * Renders every profile section and route card.
	 */
	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("knowledge-inbox-profile-modal");
		this.contentEl.createEl("h2", { text: "Knowledge Inbox 设置向导" });
		this.contentEl.createEl("p", {
			text: "这里的非敏感配置保存在 vault profile 中，可随同步工具跨设备同步。API Key 不会写入该文件。",
			cls: "setting-item-description",
		});

		new Setting(this.contentEl)
			.setName("默认写入方式")
			.setDesc("每次采集时仍可临时切换。")
			.addDropdown(dropdown => dropdown
				.addOption("preview", "先预览确认")
				.addOption("auto", "自动写入")
				.setValue(this.draft.writeMode)
				.onChange(value => {
					this.draft.writeMode = value as WriteMode;
				}));

		new Setting(this.contentEl).setName("AI 整理规则").setHeading();
		this.addPromptSetting("书面文本整理规则", "written");
		this.addPromptSetting("语音转写整理规则", "transcript");

		new Setting(this.contentEl).setName("高级：笔记属性字段").setHeading();
		this.contentEl.createEl("p", {
			text: "一般无需修改。这里控制插件写入 Obsidian 笔记顶部属性栏时使用的字段名称。",
			cls: "setting-item-description",
		});
		this.addMetadataSetting("标记原稿是否已整理", "processed");
		this.addMetadataSetting("在原稿中记录最终 wiki 位置", "target");
		this.addMetadataSetting("在 wiki 中记录原稿位置", "source");

		new Setting(this.contentEl).setName("笔记分类").setHeading();
		this.contentEl.createEl("p", {
			text: "AI 会根据每个分类的判断规则选择分类。分类名称和目标目录都可以使用中文；目标目录也可以输入尚未创建的新路径。",
			cls: "setting-item-description",
		});
		new Setting(this.contentEl)
			.setName("从现有提示词导入分类")
			.setDesc("一次性读取 vault 中的一篇提示词笔记，AI 提取分类卡片供你确认。导入后只使用卡片，不会继续同时发送原提示词。")
			.addButton(button => button
				.setButtonText("选择提示词并提取")
				.onClick(() => this.importCategories(button.buttonEl)));
		this.routesEl = this.contentEl.createDiv({ cls: "knowledge-inbox-routes" });
		this.renderRoutes();

		const addRouteButton = this.contentEl.createEl("button", {
			text: "新增分类",
		});
		addRouteButton.addEventListener("click", () => {
			this.draft.routes.push(this.createRoute());
			this.renderRoutes();
		});

		const actions = this.contentEl.createDiv({ cls: "knowledge-inbox-capture-actions" });
		const cancelButton = actions.createEl("button", { text: "取消" });
		const saveButton = actions.createEl("button", {
			text: "保存配置",
			cls: "mod-cta",
		});
		cancelButton.addEventListener("click", () => this.close());
		saveButton.addEventListener("click", () => {
			void this.save(saveButton);
		});
	}

	/**
	 * Extracts route candidates from a selected vault prompt and previews them.
	 */
	private importCategories(button: HTMLButtonElement): void {
		new VaultMarkdownFileSuggest(this.app, async (file) => {
			const originalText = button.textContent || "选择提示词并提取";
			button.disabled = true;
			button.setText("正在提取…");
			try {
				const promptText = await this.app.vault.cachedRead(file);
				const proposedRoutes = await this.onImportCategories(promptText);
				new CategoryImportPreviewModal(
					this.app,
					this.draft.routes,
					proposedRoutes,
					() => {
						this.draft.routes = proposedRoutes;
						this.render();
					},
				).open();
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				new Notice(`分类提取失败：${message}`, 8000);
			} finally {
				button.disabled = false;
				button.setText(originalText);
			}
		}).open();
	}

	/**
	 * Adds a built-in, inline, or vault-file prompt source.
	 */
	private addPromptSetting(label: string, key: PromptKey): void {
		const source = this.draft.prompts[key];
		const group = this.contentEl.createDiv({ cls: "knowledge-inbox-prompt-card" });
		new Setting(group)
			.setName(label)
			.setDesc("选择插件内置规则、直接输入提示词，或引用 vault 中的一篇提示词笔记。")
			.addDropdown(dropdown => dropdown
				.addOption("builtin", "使用插件内置规则")
				.addOption("inline", "在这里手动输入")
				.addOption("file", "使用 vault 中的提示词文件")
				.setValue(source.mode)
				.onChange(value => {
					source.mode = value as PromptMode;
					this.render();
				}));

		if (source.mode === "builtin") {
			const preview = group.createEl("textarea", {
				cls: "knowledge-inbox-builtin-prompt",
				attr: { readonly: "true", rows: "8" },
			});
			preview.value = this.getBuiltinPrompt(key);
			return;
		}
		if (source.mode === "inline") {
			new Setting(group)
				.setName("手动提示词")
				.setDesc("这里输入的内容会替代对应的插件内置规则。")
				.addTextArea(textarea => {
					textarea.setValue(source.inlineText);
					textarea.inputEl.rows = 8;
					textarea.onChange(value => {
						source.inlineText = value;
					});
				});
			return;
		}

		const fileSetting = new Setting(group)
			.setName("提示词文件")
			.setDesc("选择 vault 中的一篇 Markdown 笔记，插件每次都会读取它的最新内容。");
		fileSetting.addText(text => text
			.setValue(source.filePath)
			.onChange(value => {
				source.filePath = value;
			}));
		fileSetting.addButton(button => button.setButtonText("选择文件").onClick(() => {
			new VaultMarkdownFileSuggest(this.app, (file) => {
				source.filePath = file.path;
				const input = fileSetting.controlEl.querySelector("input");
				if (input) input.value = file.path;
			}).open();
		}));
	}

	/**
	 * Returns the visible built-in rule for a prompt section.
	 */
	private getBuiltinPrompt(key: PromptKey): string {
		if (key === "written") return getBuiltinSourcePrompt("written");
		return getBuiltinSourcePrompt("external-transcript");
	}

	/**
	 * Adds a configurable frontmatter field name.
	 */
	private addMetadataSetting(label: string, key: MetadataKey): void {
		new Setting(this.contentEl)
			.setName(label)
			.setDesc("留空可禁用该字段。")
			.addText(text => text
				.setValue(this.draft.metadataFields[key])
				.onChange(value => {
					this.draft.metadataFields[key] = value;
				}));
	}

	/**
	 * Re-renders route cards after additions or removals.
	 */
	private renderRoutes(): void {
		if (!this.routesEl) return;
		this.routesEl.empty();
		this.draft.routes.forEach((route, index) => {
			this.renderRouteCard(route, index);
		});
	}

	/**
	 * Renders a single editable category route.
	 */
	private renderRouteCard(route: CategoryRoute, index: number): void {
		if (!this.routesEl) return;
		const card = this.routesEl.createDiv({ cls: "knowledge-inbox-route-card" });
		const header = card.createDiv({ cls: "knowledge-inbox-route-header" });
		const titleEl = header.createEl("strong", {
			text: route.label || route.id || `分类 ${index + 1}`,
		});
		const removeButton = header.createEl("button", { text: "删除" });
		removeButton.disabled = this.draft.routes.length <= 1;
		removeButton.addEventListener("click", () => {
			this.draft.routes.splice(index, 1);
			this.renderRoutes();
		});

		new Setting(card)
			.setName("分类名称")
			.setDesc("可以使用中文、英文或数字。该名称会提供给 AI 进行分类。")
			.addText(text =>
			text.setValue(route.label).onChange(value => {
				route.label = value;
				route.id = value;
				titleEl.setText(value || `分类 ${index + 1}`);
			}));
		new Setting(card)
			.setName("什么时候使用这个分类？")
			.setDesc("这就是该分类的判断规则，会发送给 AI。例如：培训知识、产品资料和项目复盘进入此分类。")
			.addTextArea(text => {
			text.setValue(route.description);
			text.inputEl.rows = 3;
			text.onChange(value => {
				route.description = value;
			});
		});

		const folderSetting = new Setting(card)
			.setName("保存到哪个文件夹？")
			.setDesc("可以选择已有文件夹，也可以直接输入中文或英文的新路径。");
		folderSetting.addText(text => text.setValue(route.targetFolder).onChange(value => {
			route.targetFolder = value;
		}));
		folderSetting.addButton(button => button.setButtonText("选择").onClick(() => {
			new VaultFolderSuggest(this.app, (folder) => {
				route.targetFolder = folder.path;
				const input = folderSetting.controlEl.querySelector("input");
				if (input) input.value = folder.path;
			}).open();
		}));

		const templateSetting = new Setting(card)
			.setName("输出笔记样式")
			.setDesc("留空时使用系统默认样式。选择自定义模板后，正文会插入 {{content}} 所在位置；模板没有该标记时会自动追加到末尾。");
		templateSetting.addText(text => text
			.setValue(route.outputTemplatePath)
			.onChange(value => {
				route.outputTemplatePath = value;
			}));
		templateSetting.addButton(button => button.setButtonText("选择模板").onClick(() => {
			new VaultMarkdownFileSuggest(this.app, (file) => {
				route.outputTemplatePath = file.path;
				const input = templateSetting.controlEl.querySelector("input");
				if (input) input.value = file.path;
			}).open();
		}));
		templateSetting.addButton(button => button.setButtonText("查看默认样式").onClick(() => {
			this.showDefaultWikiTemplate(route);
		}));

		const knownPattern = route.fileNamePattern === "{{date:YYYY-MM-DD}} {{title}}"
			? "date-title"
			: route.fileNamePattern === "{{title}}"
				? "title"
				: "custom";
		const fileNameSetting = new Setting(card)
			.setName("文件如何命名？")
			.setDesc("推荐使用“日期 + 标题”，方便按时间排序。");
		fileNameSetting.addDropdown(dropdown => dropdown
			.addOption("date-title", "日期 + 标题")
			.addOption("title", "仅标题")
			.addOption("custom", "高级自定义")
			.setValue(knownPattern)
			.onChange(value => {
				if (value === "date-title") route.fileNamePattern = "{{date:YYYY-MM-DD}} {{title}}";
				else if (value === "title") route.fileNamePattern = "{{title}}";
				else if (knownPattern !== "custom") route.fileNamePattern = "{{date:YYYY-MM-DD}}-{{title}}";
				this.renderRoutes();
			}));
		if (knownPattern === "custom") {
			fileNameSetting.addText(text => text
				.setPlaceholder("例如：{{date:YYYY-MM-DD}}-{{title}}")
				.setValue(route.fileNamePattern)
				.onChange(value => {
					route.fileNamePattern = value;
				}));
		}
	}

	/**
	 * Shows the generic final wiki layout with sample content.
	 */
	private showDefaultWikiTemplate(route: CategoryRoute): void {
		const preview = renderDefaultWikiTemplate({
			artifact: {
				title: "示例标题",
				categoryId: route.id,
				contentMarkdown: "## 整理正文\n\n这里会放入 AI 整理后的内容。",
				todos: ["示例待办"],
				uncertainties: ["示例待核实内容"],
			},
			route,
			profile: this.draft,
			createdAt: new Date(),
			sourceRawPath: "raw/示例原稿.md",
		});
		new ContentPreviewModal(this.app, "系统默认 wiki 样式", preview).open();
	}

	/**
	 * Creates a unique starter route for the add action.
	 */
	private createRoute(): CategoryRoute {
		let index = this.draft.routes.length + 1;
		let id = `分类${index}`;
		while (this.draft.routes.some((route) => route.id === id)) {
			index += 1;
			id = `分类${index}`;
		}
		return {
			id,
			label: id,
			description: "",
			targetFolder: `wiki/${id}`,
			outputTemplatePath: "",
			fileNamePattern: "{{date:YYYY-MM-DD}} {{title}}",
		};
	}

	/**
	 * Validates and persists the edited profile.
	 */
	private async save(button: HTMLButtonElement): Promise<void> {
		if (this.saving) return;
		this.saving = true;
		button.disabled = true;
		try {
			const validated = parseVaultProfile(JSON.stringify(this.draft));
			await this.onSave(validated);
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`配置未保存：${message}`, 8000);
		} finally {
			this.saving = false;
			button.disabled = false;
		}
	}
}
