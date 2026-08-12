import { App, FuzzySuggestModal, TFile } from "obsidian";

/**
 * Lets users select a Markdown template from the current vault.
 */
export class VaultMarkdownFileSuggest extends FuzzySuggestModal<TFile> {
	private readonly onChoose: (file: TFile) => void;

	constructor(app: App, onChoose: (file: TFile) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder("选择 vault 中的 Markdown 模板");
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onChoose(file);
	}
}
