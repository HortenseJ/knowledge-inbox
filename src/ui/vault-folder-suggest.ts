import { App, FuzzySuggestModal, TFolder } from "obsidian";

/**
 * Lets users select an existing folder from the current vault.
 */
export class VaultFolderSuggest extends FuzzySuggestModal<TFolder> {
	private readonly onChoose: (folder: TFolder) => void;

	constructor(app: App, onChoose: (folder: TFolder) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder("选择 vault 目录");
	}

	getItems(): TFolder[] {
		const folders: TFolder[] = [];
		const visit = (folder: TFolder): void => {
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					folders.push(child);
					visit(child);
				}
			}
		};
		visit(this.app.vault.getRoot());
		return folders;
	}

	getItemText(folder: TFolder): string {
		return folder.path;
	}

	onChooseItem(folder: TFolder): void {
		this.onChoose(folder);
	}
}
