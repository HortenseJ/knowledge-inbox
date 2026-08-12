import type { CategoryRoute } from "../domain/vault-profile";

/**
 * Parses AI-extracted categories into safe route candidates.
 */
export function parseCategoryImport(response: string): CategoryRoute[] {
	const cleaned = response.trim().replace(/^```(?:json)?\s*|\s*```$/gi, "");
	let parsed: unknown;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		throw new Error("AI 未返回有效的分类 JSON");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("分类导入结果不是有效对象");
	}
	const categories = (parsed as Record<string, unknown>).categories;
	if (!Array.isArray(categories) || categories.length === 0) {
		throw new Error("没有从提示词中提取到分类");
	}

	const seen = new Set<string>();
	return categories.map((item, index) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) {
			throw new Error(`第 ${index + 1} 个分类无效`);
		}
		const value = item as Record<string, unknown>;
		const name = typeof value.name === "string" ? value.name.trim() : "";
		if (!name || !/^[A-Za-z0-9_\-\u3400-\u9FFF]+$/.test(name)) {
			throw new Error(`分类名称无效：${name || index + 1}`);
		}
		if (seen.has(name)) throw new Error(`分类名称重复：${name}`);
		seen.add(name);

		const description = typeof value.description === "string"
			? value.description.trim()
			: "";
		const suggestedFolder = typeof value.targetFolder === "string"
			? value.targetFolder.trim().replace(/\\/g, "/")
			: `wiki/${name}`;
		if (
			!suggestedFolder
			|| suggestedFolder.startsWith("/")
			|| /^[A-Za-z]:\//.test(suggestedFolder)
			|| suggestedFolder.split("/").includes("..")
		) {
			throw new Error(`分类 ${name} 的建议目录无效`);
		}

		return {
			id: name,
			label: name,
			description,
			targetFolder: suggestedFolder.replace(/^\.\/|\/$/g, ""),
			outputTemplatePath: "",
			fileNamePattern: "{{date:YYYY-MM-DD}} {{title}}",
		};
	});
}
