import { App, normalizePath, TFile } from "obsidian";
import type { TextSourceType } from "../domain/capture";
import type { PromptSource, VaultProfile } from "../domain/vault-profile";
import { buildProcessingPrompt } from "./default-processing-prompts";

/**
 * Reads prompt files from the vault and composes the final LLM prompt.
 */
export class PromptResolver {
	constructor(private readonly app: App) {}

	async resolve(profile: VaultProfile, sourceType: TextSourceType): Promise<string> {
		const source = sourceType === "written"
			? profile.prompts.written
			: profile.prompts.transcript;
		const sourcePrompt = await this.resolveSource(source);

		return buildProcessingPrompt({
			sourceType,
			routes: profile.routes,
			sourcePrompt,
		});
	}

	/**
	 * Resolves a built-in, inline, or vault-file prompt source.
	 */
	private async resolveSource(source: PromptSource): Promise<string> {
		if (source.mode === "inline") return source.inlineText.trim();
		if (source.mode === "file") return this.readOptional(source.filePath);
		return "";
	}

	/**
	 * Reads an optional Markdown prompt from the vault.
	 */
	private async readOptional(path: string): Promise<string> {
		if (!path) return "";
		const normalizedPath = normalizePath(path);
		const file = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (!(file instanceof TFile)) throw new Error(`提示词文件不存在：${normalizedPath}`);
		return this.app.vault.cachedRead(file);
	}
}
