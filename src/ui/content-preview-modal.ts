import { App, Modal } from "obsidian";

/**
 * Displays built-in prompts or templates in a read-only scrollable modal.
 */
export class ContentPreviewModal extends Modal {
	constructor(
		app: App,
		private readonly title: string,
		private readonly content: string,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("knowledge-inbox-content-preview-shell");
		this.contentEl.empty();
		this.contentEl.addClass("knowledge-inbox-content-preview");
		this.contentEl.createEl("h2", { text: this.title });
		const textarea = this.contentEl.createEl("textarea", {
			attr: { readonly: "true" },
		});
		textarea.value = this.content;
		const actions = this.contentEl.createDiv({ cls: "knowledge-inbox-capture-actions" });
		const closeButton = actions.createEl("button", {
			text: "关闭",
			cls: "mod-cta",
		});
		closeButton.addEventListener("click", () => this.close());
	}
}
