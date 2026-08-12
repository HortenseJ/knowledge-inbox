export interface UniquePathOptions {
	directory: string;
	stem: string;
	suffix: string;
	exists: (path: string) => Promise<boolean>;
}

/**
 * Removes characters that are unsafe in Obsidian note names and Wikilinks.
 */
export function sanitizeFileNamePart(input: string, maxLength = 80): string {
	return input
		.replace(/\[\[|\]\]|%%/g, "")
		.replace(/[\\/:*?"<>|#^]/g, "")
		.replace(/[\u0000-\u001F\u007F]/g, "")
		.replace(/\s+/g, " ")
		.replace(/^[.\s]+|[.\s]+$/g, "")
		.substring(0, maxLength)
		.trim();
}

/**
 * Builds a note stem from a localized prefix and an optional title.
 */
export function buildNoteStem(prefix: string, title: string): string {
	const safePrefix = sanitizeFileNamePart(prefix);
	const safeTitle = sanitizeFileNamePart(title);
	return safeTitle ? `${safePrefix}-${safeTitle}` : safePrefix;
}

/**
 * Resolves a unique Markdown path without overwriting an existing note.
 */
export async function resolveUniqueMarkdownPath(options: UniquePathOptions): Promise<string> {
	const directory = options.directory.replace(/\/+$/g, "");
	const basePath = `${directory}/${options.stem}.md`;
	if (!await options.exists(basePath)) return basePath;

	const suffixedPath = `${directory}/${options.stem}-${options.suffix}.md`;
	if (!await options.exists(suffixedPath)) return suffixedPath;

	let attempt = 2;
	while (await options.exists(`${directory}/${options.stem}-${options.suffix}-${attempt}.md`)) {
		attempt += 1;
	}
	return `${directory}/${options.stem}-${options.suffix}-${attempt}.md`;
}
