export interface TranscriptionTemplateInput {
	createdAt: Date;
	title: string;
	audioPath: string;
	transcript: string;
}

/**
 * Renders the fallback transcription note when no vault template is selected.
 */
export function renderDefaultTranscriptionTemplate(input: TranscriptionTemplateInput): string {
	return [
		"---",
		`created: ${input.createdAt.toISOString()}`,
		"type: transcription",
		"category: Inbox",
		"source: audio",
		`source-audio: "[[${input.audioPath}]]"`,
		"processed: false",
		"---",
		"",
		`# ${input.title}`,
		"",
		"## 原始转写",
		"",
		input.transcript,
		"",
	].join("\n");
}
