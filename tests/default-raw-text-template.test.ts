import { describe, expect, it } from "vitest";
import { renderDefaultRawTextTemplate } from "../src/templates/default-raw-text-template";

describe("renderDefaultRawTextTemplate", () => {
	it("preserves written text exactly in the raw body", () => {
		const originalText = "第一段原文。\n\n- 不应被改写";
		const result = renderDefaultRawTextTemplate({
			createdAt: new Date("2026-08-11T14:00:00.000Z"),
			title: "2026-08-11 文本-22-00-00",
			sourceType: "written",
			text: originalText,
		});

		expect(result).toContain("source: written");
		expect(result).toContain("processed: false");
		expect(result.endsWith(`${originalText}\n`)).toBe(true);
	});

	it("marks pasted speech-to-text as an external transcript", () => {
		const result = renderDefaultRawTextTemplate({
			createdAt: new Date("2026-08-11T14:00:00.000Z"),
			title: "2026-08-11 文本-22-00-00",
			sourceType: "external-transcript",
			text: "外部转写文本",
		});

		expect(result).toContain("source: external-transcript");
	});
});
