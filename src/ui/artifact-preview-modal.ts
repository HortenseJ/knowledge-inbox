import { App, Modal, Notice } from "obsidian";
import type { KnowledgeArtifact } from "../domain/knowledge-artifact";
import type { CategoryRoute } from "../domain/vault-profile";

export interface ArtifactPreviewDecision {
	artifact: KnowledgeArtifact;
	routeId: string;
}

/**
 * Previews an organized artifact and lets the user choose its trusted route.
 */
export class ArtifactPreviewModal extends Modal {
	private settled = false;

	constructor(
		app: App,
		private readonly artifact: KnowledgeArtifact,
		private readonly routes: CategoryRoute[],
		private readonly resolveDecision: (decision: ArtifactPreviewDecision | null) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("knowledge-inbox-preview-shell");
		this.contentEl.empty();
		this.contentEl.addClass("knowledge-inbox-preview-modal");
		this.contentEl.createEl("h2", { text: "确认整理结果" });

		this.contentEl.createEl("label", {
			text: "标题",
			cls: "knowledge-inbox-field-label",
		});
		const titleInput = this.contentEl.createEl("input", {
			attr: { type: "text" },
		});
		titleInput.value = this.artifact.title;

		this.contentEl.createEl("label", {
			text: "目标分类",
			cls: "knowledge-inbox-field-label",
		});
		const routeSelect = this.contentEl.createEl("select", {
			cls: "dropdown",
		}) as HTMLSelectElement;
		routeSelect.createEl("option", { text: "请选择分类", attr: { value: "" } });
		for (const route of this.routes) {
			routeSelect.createEl("option", {
				text: `${route.label} → ${route.targetFolder}`,
				attr: { value: route.id },
			});
		}
		routeSelect.value = this.artifact.categoryId ?? "";

		this.contentEl.createEl("label", {
			text: "整理正文",
			cls: "knowledge-inbox-field-label",
		});
		const contentInput = this.contentEl.createEl("textarea", {
			cls: "knowledge-inbox-preview-content",
			attr: { rows: "16" },
		});
		contentInput.value = this.artifact.contentMarkdown;

		if (this.artifact.todos.length > 0) {
			this.contentEl.createEl("p", {
				text: `待办：${this.artifact.todos.length} 项`,
				cls: "setting-item-description",
			});
		}
		if (this.artifact.uncertainties.length > 0) {
			this.contentEl.createEl("p", {
				text: `待核实：${this.artifact.uncertainties.join("；")}`,
				cls: "setting-item-description",
			});
		}

		const actions = this.contentEl.createDiv({ cls: "knowledge-inbox-capture-actions" });
		const cancelButton = actions.createEl("button", { text: "仅保留 raw 草稿" });
		const confirmButton = actions.createEl("button", {
			text: "写入 wiki",
			cls: "mod-cta",
		});
		cancelButton.addEventListener("click", () => this.settle(null));
		confirmButton.addEventListener("click", () => {
			const title = titleInput.value.trim();
			const contentMarkdown = contentInput.value.trim();
			const routeId = routeSelect.value;
			if (!title || !contentMarkdown || !routeId) {
				new Notice("请填写标题、正文并选择目标分类");
				return;
			}
			this.settle({
				routeId,
				artifact: {
					...this.artifact,
					title,
					categoryId: routeId,
					contentMarkdown,
				},
			});
		});
	}

	onClose(): void {
		if (!this.settled) this.settle(null);
	}

	/**
	 * Resolves the preview once and closes the modal.
	 */
	private settle(decision: ArtifactPreviewDecision | null): void {
		if (this.settled) return;
		this.settled = true;
		this.resolveDecision(decision);
		this.close();
	}
}
