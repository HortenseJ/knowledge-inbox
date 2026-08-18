export interface UniquePathOptions {
	directory: string;
	stem: string;
	suffix: string;
	exists: (path: string) => Promise<boolean>;
}

/**
 * Removes control characters (0x00-0x1F, 0x7F) without a regex literal,
 * so the pattern stays compatible with the Obsidian plugin lint rules.
 */
function stripControlCharacters(input: string): string {
	let result = "";
	for (let i = 0; i < input.length; i++) {
		const code = input.charCodeAt(i);
		if (code >= 32 && code !== 127) result += input.charAt(i);
	}
	return result;
}

/**
 * Removes characters that are unsafe in Obsidian note names and Wikilinks.
 */
export function sanitizeFileNamePart(input: string, maxLength = 80): string {
	return stripControlCharacters(input)
		.replace(/\[\[|\]\]|%%/g, "")
		.replace(/[\\/:*?"<>|#^]/g, "")
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
