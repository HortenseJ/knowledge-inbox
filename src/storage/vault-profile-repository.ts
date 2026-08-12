import { App, normalizePath, TFile } from "obsidian";
import { DEFAULT_VAULT_PROFILE, type VaultProfile } from "../domain/vault-profile";
import { parseVaultProfile } from "../parsing/parse-vault-profile";

/**
 * Loads and creates the non-sensitive profile stored inside the vault.
 */
export class VaultProfileRepository {
	constructor(private readonly app: App) {}

	/**
	 * Loads the configured profile or returns an in-memory default.
	 */
	async load(profilePath: string): Promise<VaultProfile> {
		const normalizedPath = this.normalizeProfilePath(profilePath);
		const abstractFile = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (!abstractFile) {
			return JSON.parse(JSON.stringify(DEFAULT_VAULT_PROFILE)) as VaultProfile;
		}
		if (!(abstractFile instanceof TFile)) {
			throw new Error(`Knowledge Inbox 配置路径不是文件：${normalizedPath}`);
		}
		return parseVaultProfile(await this.app.vault.read(abstractFile));
	}

	/**
	 * Validates and saves a profile, creating its file when necessary.
	 */
	async save(profilePath: string, profile: VaultProfile): Promise<string> {
		const normalizedPath = this.normalizeProfilePath(profilePath);
		const validated = parseVaultProfile(JSON.stringify(profile));
		const content = `${JSON.stringify(validated, null, 2)}\n`;
		const abstractFile = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (abstractFile && !(abstractFile instanceof TFile)) {
			throw new Error(`Knowledge Inbox 配置路径不是文件：${normalizedPath}`);
		}
		if (abstractFile instanceof TFile) {
			await this.app.vault.modify(abstractFile, content);
		} else {
			await this.ensureParentFolder(normalizedPath);
			await this.app.vault.create(normalizedPath, content);
		}
		return normalizedPath;
	}

	/**
	 * Creates profile parent folders one level at a time for mobile support.
	 */
	private async ensureParentFolder(filePath: string): Promise<void> {
		const segments = filePath.split("/");
		segments.pop();
		let current = "";
		for (const segment of segments.filter(Boolean)) {
			current = current ? `${current}/${segment}` : segment;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				await this.app.vault.createFolder(current);
			}
		}
	}

	/**
	 * Restricts the profile itself to a vault-relative JSON path.
	 */
	private normalizeProfilePath(profilePath: string): string {
		const trimmed = profilePath.trim().replace(/\\/g, "/");
		if (!trimmed) throw new Error("Vault profile 路径不能为空");
		if (trimmed.startsWith("/") || /^[A-Za-z]:\//.test(trimmed)) {
			throw new Error("Vault profile 必须使用 vault 相对路径");
		}
		if (trimmed.split("/").includes("..")) {
			throw new Error("Vault profile 路径不能包含 ..");
		}
		const normalized = normalizePath(trimmed);
		if (!normalized.toLowerCase().endsWith(".json")) {
			throw new Error("Vault profile 必须是 .json 文件");
		}
		return normalized;
	}
}
