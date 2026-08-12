import { describe, expect, it } from "vitest";
import { DEFAULT_VAULT_PROFILE } from "../src/domain/vault-profile";
import { renderDefaultWikiTemplate } from "../src/templates/default-wiki-template";

describe("renderDefaultWikiTemplate", () => {
	it("renders generic metadata, source link, content, todos, and uncertainties", () => {
		const route = DEFAULT_VAULT_PROFILE.routes.find((item) => item.id === "work");
		if (!route) throw new Error("missing work route");

		const result = renderDefaultWikiTemplate({
			artifact: {
				title: "项目复盘",
				categoryId: "work",
				contentMarkdown: "## 结论\n\n保留事实。",
				todos: ["补充数据"],
				uncertainties: ["项目代号"],
			},
			route,
			profile: DEFAULT_VAULT_PROFILE,
			createdAt: new Date("2026-08-11T14:30:00.000Z"),
			sourceRawPath: "raw/text/2026-08-11 原稿.md",
		});

		expect(result).toContain("category: work");
		expect(result).toContain('source-raw: "[[raw/text/2026-08-11 原稿]]"');
		expect(result).toContain("## 结论");
		expect(result).toContain("- [ ] 补充数据");
		expect(result).toContain("- 项目代号");
	});
});
