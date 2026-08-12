import { describe, expect, it } from "vitest";
import {
	buildNoteStem,
	resolveUniqueMarkdownPath,
	sanitizeFileNamePart,
} from "../src/storage/filename-policy";

describe("sanitizeFileNamePart", () => {
	it("removes unsafe filename and Wikilink characters", () => {
		expect(sanitizeFileNamePart('  [[项目]]: 复盘 #1 | "草稿" ^ %%  '))
			.toBe("项目 复盘 1 草稿");
	});

	it("removes control characters and limits length", () => {
		expect(sanitizeFileNamePart("abc\u0000def", 5)).toBe("abcde");
	});
});

describe("buildNoteStem", () => {
	it("uses only the prefix when the title is empty", () => {
		expect(buildNoteStem("备忘", "")).toBe("备忘");
	});

	it("joins a safe prefix and title", () => {
		expect(buildNoteStem("备忘", "项目/复盘")).toBe("备忘-项目复盘");
	});
});

describe("resolveUniqueMarkdownPath", () => {
	it("returns the base path when it is available", async () => {
		const path = await resolveUniqueMarkdownPath({
			directory: "wiki/memo",
			stem: "备忘-项目复盘",
			suffix: "2210",
			exists: async () => false,
		});

		expect(path).toBe("wiki/memo/备忘-项目复盘.md");
	});

	it("increments a suffix until a path is available", async () => {
		const occupied = new Set([
			"wiki/memo/备忘-项目复盘.md",
			"wiki/memo/备忘-项目复盘-2210.md",
			"wiki/memo/备忘-项目复盘-2210-2.md",
		]);
		const path = await resolveUniqueMarkdownPath({
			directory: "wiki/memo",
			stem: "备忘-项目复盘",
			suffix: "2210",
			exists: async (candidate) => occupied.has(candidate),
		});

		expect(path).toBe("wiki/memo/备忘-项目复盘-2210-3.md");
	});
});
