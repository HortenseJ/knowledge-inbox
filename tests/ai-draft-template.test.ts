import { describe, expect, it } from "vitest";
import { AI_DRAFT_START, upsertAiDraft } from "../src/templates/ai-draft-template";

const firstArtifact = {
	title: "第一次整理",
	categoryId: "memo",
	contentMarkdown: "## 正文\n\n保留事实。",
	todos: ["确认术语"],
	uncertainties: ["产品名称"],
};

describe("upsertAiDraft", () => {
	it("appends a managed draft without changing the raw source", () => {
		const original = "# 原稿\n\n## 原始文本\n\n用户原文。";
		const result = upsertAiDraft(original, firstArtifact);

		expect(result).toContain(original);
		expect(result).toContain(AI_DRAFT_START);
		expect(result).toContain("- [ ] 确认术语");
		expect(result).toContain("- 产品名称");
	});

	it("replaces the previous managed draft instead of duplicating it", () => {
		const original = "# 原稿\n\n用户原文。";
		const first = upsertAiDraft(original, firstArtifact);
		const second = upsertAiDraft(first, {
			...firstArtifact,
			title: "第二次整理",
			contentMarkdown: "新的整理正文。",
		});

		expect(second.match(new RegExp(AI_DRAFT_START, "g"))).toHaveLength(1);
		expect(second).not.toContain("第一次整理");
		expect(second).toContain("第二次整理");
		expect(second).toContain("用户原文。");
	});
});
