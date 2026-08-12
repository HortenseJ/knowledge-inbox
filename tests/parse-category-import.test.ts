import { describe, expect, it } from "vitest";
import { parseCategoryImport } from "../src/parsing/parse-category-import";

describe("parseCategoryImport", () => {
	it("parses Chinese categories and suggested folders", () => {
		const routes = parseCategoryImport(JSON.stringify({
			categories: [{
				name: "工作记录",
				description: "项目、会议和业务复盘",
				targetFolder: "wiki/工作记录",
			}],
		}));

		expect(routes[0]).toMatchObject({
			id: "工作记录",
			label: "工作记录",
			targetFolder: "wiki/工作记录",
		});
	});

	it("rejects an unsafe suggested folder", () => {
		expect(() => parseCategoryImport(JSON.stringify({
			categories: [{
				name: "私密",
				description: "测试",
				targetFolder: "../../private",
			}],
		}))).toThrow("建议目录无效");
	});
});
