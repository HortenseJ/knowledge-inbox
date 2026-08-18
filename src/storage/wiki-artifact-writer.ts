import { App, normalizePath, TFile } from "obsidian";
import type { KnowledgeArtifact } from "../domain/knowledge-artifact";
import type { CategoryRoute, VaultProfile } from "../domain/vault-profile";
import {
	resolveUniqueMarkdownPath,
	sanitizeFileNamePart,
} from "./filename-policy";
import { renderDefaultWikiTemplate } from "../templates/default-wiki-template";
import { renderTemplate } from "../templates/template-renderer";

export interface WikiWriteInput {
	artifact: KnowledgeArtifact;
	route: CategoryRoute;
	profile: VaultProfile;
	sourceRawPath: string;
	createdAt: Date;
}

/**
 * Writes validated artifacts to trusted routes and updates source metadata.
 */
export class WikiArtifactWriter {
	constructor(private readonly app: App) {}

	async planPath(input: WikiWriteInput): Promise<string> {
		const directory = normalizePath(input.route.targetFolder);
		await this.ensureFolder(directory);
		const renderedStem = renderTemplate(input.route.fileNamePattern, {
			title: input.artifact.title,
			createdAt: input.createdAt,
			variables: {
				categoryId: input.route.id,
				categoryLabel: input.route.label,
			},
		}).replace(/\.md$/i, "");
		const stem = sanitizeFileNamePart(renderedStem)
			|| sanitizeFileNamePart(input.artifact.title)
			|| "未命名笔记";
		return normalizePath(await resolveUniqueMarkdownPath({
			directory,
			stem,
			suffix: input.createdAt.getTime().toString(),
			exists: async (candidate) => this.app.vault.getAbstractFileByPath(candidate) !== null,
		}));
	}

	async write(input: WikiWriteInput, plannedPath?: string): Promise<string> {
		const path = plannedPath ?? await this.planPath(input);
		const content = await this.renderContent(input);
		const existing = this.app.vault.getAbstractFileByPath(path);
		const finalFile = existing instanceof TFile
			? existing
			: await this.app.vault.create(path, content);

		if (input.profile.metadataFields.source) {
			await this.app.fileManager.processFrontMatter(finalFile, (frontmatter) => {
				const fm = frontmatter as Record<string, unknown>;
				fm[input.profile.metadataFields.source] =
					`[[${input.sourceRawPath.replace(/\.md$/i, "")}]]`;
			});
		}

		const rawFile = this.app.vault.getAbstractFileByPath(input.sourceRawPath);
		if (!(rawFile instanceof TFile)) {
			throw new Error(`原稿不存在：${input.sourceRawPath}`);
		}
		await this.app.fileManager.processFrontMatter(rawFile, (frontmatter) => {
			const fm = frontmatter as Record<string, unknown>;
			if (input.profile.metadataFields.processed) {
				fm[input.profile.metadataFields.processed] = true;
			}
			if (input.profile.metadataFields.target) {
				fm[input.profile.metadataFields.target] = path.replace(/\.md$/i, "");
			}
		});
		return path;
	}

	/**
	 * Renders either a route template from the vault or the generic fallback.
	 */
	private async renderContent(input: WikiWriteInput): Promise<string> {
		const fallback = renderDefaultWikiTemplate(input);
		if (!input.route.outputTemplatePath) return fallback;

		const templateFile = this.app.vault.getAbstractFileByPath(
			normalizePath(input.route.outputTemplatePath),
		);
		if (!(templateFile instanceof TFile)) {
			throw new Error(`wiki 模板不存在：${input.route.outputTemplatePath}`);
		}
		const template = await this.app.vault.cachedRead(templateFile);
		const sourceRaw = `[[${input.sourceRawPath.replace(/\.md$/i, "")}]]`;
		const rendered = renderTemplate(template, {
			title: input.artifact.title,
			createdAt: input.createdAt,
			variables: {
				content: input.artifact.contentMarkdown,
				todos: input.artifact.todos.map((todo) => `- [ ] ${todo}`).join("\n"),
				uncertainties: input.artifact.uncertainties.map((item) => `- ${item}`).join("\n"),
				sourceRaw,
				sourceRawPath: input.sourceRawPath,
				categoryId: input.route.id,
				categoryLabel: input.route.label,
			},
		});
		if (template.includes("{{content}}")) return rendered;
		return `${rendered.replace(/\s+$/, "")}\n\n${this.renderArtifactBody(input.artifact)}\n`;
	}

	/**
	 * Renders a complete body when a custom template has no content marker.
	 */
	private renderArtifactBody(artifact: KnowledgeArtifact): string {
		const lines = [artifact.contentMarkdown];
		if (artifact.todos.length > 0) {
			lines.push("", "## 待办", "");
			for (const todo of artifact.todos) lines.push(`- [ ] ${todo}`);
		}
		if (artifact.uncertainties.length > 0) {
			lines.push("", "## 待核实", "");
			for (const item of artifact.uncertainties) lines.push(`- ${item}`);
		}
		return lines.join("\n");
	}

	/**
	 * Creates route folders one level at a time for mobile support.
	 */
	private async ensureFolder(directory: string): Promise<void> {
		const segments = directory.split("/").filter(Boolean);
		let current = "";
		for (const segment of segments) {
			current = current ? `${current}/${segment}` : segment;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				await this.app.vault.createFolder(current);
			}
		}
	}
}
