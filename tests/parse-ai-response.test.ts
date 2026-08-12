import { describe, expect, it } from "vitest";
import { parseAiResponse } from "../src/parsing/parse-ai-response";

describe("parseAiResponse", () => {
	it("parses a memo with an inline title", () => {
		const result = parseAiResponse(`
### 标题：一元线性回归笔记
### 类型
备忘
### 备忘内容
这是整理后的正文。
		`);

		expect(result).toEqual({
			type: "memo",
			todos: [],
			memo: "这是整理后的正文。",
			summary: "",
			title: "一元线性回归笔记",
		});
	});

	it("parses emoji-prefixed legacy headings", () => {
		const result = parseAiResponse(`
## 📋 总结
明天下午三点开会。
## ✅ 待办事项
- [ ] 准备会议材料
		`);

		expect(result.type).toBe("reminder");
		expect(result.summary).toBe("明天下午三点开会。");
		expect(result.todos).toEqual(["- [ ] 准备会议材料"]);
	});

	it("infers mixed content from memo text and real todos", () => {
		const result = parseAiResponse(`
### 备忘内容
记录项目背景。
### 待办
- [ ] 提交方案
		`);

		expect(result.type).toBe("mixed");
		expect(result.memo).toBe("记录项目背景。");
		expect(result.todos).toEqual(["- [ ] 提交方案"]);
	});

	it("treats a summary without action language as a memo", () => {
		const result = parseAiResponse(`
### 总结
这是一个关于学习方法的想法。
		`);

		expect(result.type).toBe("memo");
		expect(result.memo).toBe("这是一个关于学习方法的想法。");
	});
});
