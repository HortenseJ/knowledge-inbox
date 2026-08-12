import type { TextSourceType } from "../domain/capture";

export interface RawTextTemplateInput {
	createdAt: Date;
	title: string;
	sourceType: TextSourceType;
	text: string;
}

/**
 * Renders the fallback raw text note when no vault template is configured.
 */
export function renderDefaultRawTextTemplate(input: RawTextTemplateInput): string {
	return [
		"---",
		`created: ${input.createdAt.toISOString()}`,
		"type: raw-text",
		"category: Inbox",
		`source: ${input.sourceType}`,
		"processed: false",
		"---",
		"",
		`# ${input.title}`,
		"",
		"## 原始文本",
		"",
		input.text,
		"",
	].join("\n");
}
