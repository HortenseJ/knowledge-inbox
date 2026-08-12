import { describe, expect, it } from "vitest";
import { parseKnowledgeArtifact } from "../src/parsing/parse-knowledge-artifact";
import { buildProcessingPrompt } from "../src/prompts/default-processing-prompts";
import { DEFAULT_VAULT_PROFILE } from "../src/domain/vault-profile";

describe("parseKnowledgeArtifact", () => {
	it("parses a valid fenced JSON response", () => {
		const result = parseKnowledgeArtifact(`\`\`\`json
{
  "title": "项目复盘",
  "categoryId": "work",
  "contentMarkdown": "## 结论\\n\\n保留原始事实。",
  "todos": ["补充数据"],
  "uncertainties": ["产品代号待确认"]
}
\`\`\``);

		expect(result).toEqual({
			title: "项目复盘",
			categoryId: "work",
			contentMarkdown: "## 结论\n\n保留原始事实。",
			todos: ["补充数据"],
			uncertainties: ["产品代号待确认"],
		});
	});

	it("rejects missing organized content", () => {
		expect(() => parseKnowledgeArtifact(JSON.stringify({
			title: "空结果",
			categoryId: null,
			contentMarkdown: "",
		}))).toThrow("AI 结果缺少整理正文");
	});

	it("rejects arbitrary path-like category IDs", () => {
		expect(() => parseKnowledgeArtifact(JSON.stringify({
			title: "非法分类",
			categoryId: "../../private",
			contentMarkdown: "正文",
		}))).toThrow("AI 返回了无效分类 ID");
	});

	it("accepts a configured-style Chinese category ID", () => {
		const result = parseKnowledgeArtifact(JSON.stringify({
			title: "工作复盘",
			categoryId: "工作记录",
			contentMarkdown: "正文",
			todos: [],
			uncertainties: [],
		}));

		expect(result.categoryId).toBe("工作记录");
	});
});

describe("buildProcessingPrompt", () => {
	it("keeps written text wording within the original fact boundary", () => {
		const prompt = buildProcessingPrompt({
			sourceType: "written",
			routes: DEFAULT_VAULT_PROFILE.routes,
		});
		expect(prompt).toContain("书面文本");
		expect(prompt).toContain("不添加原文没有的信息");
		expect(prompt).toContain("work（工作）");
	});

	it("enables STT correction only for external transcripts", () => {
		const prompt = buildProcessingPrompt({
			sourceType: "external-transcript",
			routes: DEFAULT_VAULT_PROFILE.routes,
		});
		expect(prompt).toContain("同音字");
		expect(prompt).toContain("语气词");
		expect(prompt).toContain("work（工作）");
	});

	it("allows a manual source prompt to replace built-in organization rules", () => {
		const prompt = buildProcessingPrompt({
			sourceType: "external-transcript",
			routes: DEFAULT_VAULT_PROFILE.routes,
			sourcePrompt: "冻结专有名词 Kooky",
		});
		expect(prompt).toContain("冻结专有名词 Kooky");
		expect(prompt).not.toContain("语气词");
	});
});
