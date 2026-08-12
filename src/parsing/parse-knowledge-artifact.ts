import type { KnowledgeArtifact } from "../domain/knowledge-artifact";

/**
 * Removes an optional Markdown code fence around a JSON response.
 */
function stripJsonFence(response: string): string {
	const trimmed = response.trim();
	const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	return match ? match[1].trim() : trimmed;
}

/**
 * Validates an LLM JSON response before it can be written to the vault.
 */
export function parseKnowledgeArtifact(response: string): KnowledgeArtifact {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stripJsonFence(response));
	} catch {
		throw new Error("AI 未返回有效 JSON");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("AI 结果不是有效对象");
	}

	const value = parsed as Record<string, unknown>;
	const title = typeof value.title === "string" ? value.title.trim() : "";
	const contentMarkdown = typeof value.contentMarkdown === "string"
		? value.contentMarkdown.trim()
		: "";
	const categoryId = value.categoryId === null || value.categoryId === undefined
		? null
		: typeof value.categoryId === "string"
			? value.categoryId.trim()
			: null;
	const todos = Array.isArray(value.todos)
		? value.todos.filter((item): item is string => typeof item === "string")
			.map((item) => item.trim())
			.filter(Boolean)
		: [];
	const uncertainties = Array.isArray(value.uncertainties)
		? value.uncertainties.filter((item): item is string => typeof item === "string")
			.map((item) => item.trim())
			.filter(Boolean)
		: [];

	if (!title) throw new Error("AI 结果缺少标题");
	if (!contentMarkdown) throw new Error("AI 结果缺少整理正文");
	if (categoryId && !/^[A-Za-z0-9_\-\u3400-\u9FFF]+$/.test(categoryId)) {
		throw new Error("AI 返回了无效分类 ID");
	}

	return {
		title,
		categoryId,
		contentMarkdown,
		todos,
		uncertainties,
	};
}
