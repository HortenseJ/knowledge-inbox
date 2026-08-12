import { App, Modal } from "obsidian";
import type { CategoryRoute } from "../domain/vault-profile";

/**
 * Confirms a one-time replacement of category cards extracted from a prompt.
 */
export class CategoryImportPreviewModal extends Modal {
	constructor(
		app: App,
		private readonly currentRoutes: CategoryRoute[],
		private readonly proposedRoutes: CategoryRoute[],
		private readonly onApply: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("knowledge-inbox-category-import-shell");
		this.contentEl.empty();
		this.contentEl.addClass("knowledge-inbox-category-import");
		this.contentEl.createEl("h2", { text: "确认导入分类" });
		this.contentEl.createEl("p", {
			text: `当前 ${this.currentRoutes.length} 个分类，将替换为以下 ${this.proposedRoutes.length} 个分类。这里只更新设置向导中的草稿，点击“保存配置”后才会真正生效。`,
			cls: "setting-item-description",
		});

		const list = this.contentEl.createDiv({ cls: "knowledge-inbox-import-list" });
		for (const route of this.proposedRoutes) {
			const item = list.createDiv({ cls: "knowledge-inbox-import-item" });
			item.createEl("strong", { text: route.label });
			item.createEl("p", { text: route.description || "未提取到判断规则" });
			item.createEl("code", { text: route.targetFolder });
		}

		const actions = this.contentEl.createDiv({ cls: "knowledge-inbox-capture-actions" });
		const cancel = actions.createEl("button", { text: "取消" });
		const apply = actions.createEl("button", {
			text: "导入到设置向导",
			cls: "mod-cta",
		});
		cancel.addEventListener("click", () => this.close());
		apply.addEventListener("click", () => {
			this.onApply();
			this.close();
		});
	}
}
