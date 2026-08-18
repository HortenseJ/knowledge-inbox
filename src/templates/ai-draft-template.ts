import type { KnowledgeArtifact } from "../domain/knowledge-artifact";

export const AI_DRAFT_START = "<!-- knowledge-inbox:ai-draft:start -->";
export const AI_DRAFT_END = "<!-- knowledge-inbox:ai-draft:end -->";

/**
 * Renders a managed AI draft block without changing the raw source section.
 */
export function renderAiDraft(artifact: KnowledgeArtifact): string {
	const lines = [
		AI_DRAFT_START,
		"## AI 整理草稿",
		"",
		`> [!info] 建议标题：${artifact.title}`,
		`> 建议分类：${artifact.categoryId ?? "待选择"}`,
		"",
		artifact.contentMarkdown,
	];

	if (artifact.todos.length > 0) {
		lines.push("", "### 待办", "");
		for (const todo of artifact.todos) lines.push(`- [ ] ${todo}`);
	}
	if (artifact.uncertainties.length > 0) {
		lines.push("", "### 待核实", "");
		for (const uncertainty of artifact.uncertainties) lines.push(`- ${uncertainty}`);
	}
	lines.push(AI_DRAFT_END);
	return lines.join("\n");
}

/**
 * Appends or replaces the managed draft while preserving all other content.
 */
export function upsertAiDraft(note: string, artifact: KnowledgeArtifact): string {
	const draft = renderAiDraft(artifact);
	const start = note.indexOf(AI_DRAFT_START);
	const end = note.indexOf(AI_DRAFT_END);
	if (start >= 0 && end >= start) {
		const afterEnd = end + AI_DRAFT_END.length;
		return `${note.slice(0, start).replace(/\s+$/, "")}\n\n${draft}${note.slice(afterEnd)}`;
	}
	return `${note.replace(/\s+$/, "")}\n\n${draft}\n`;
}
