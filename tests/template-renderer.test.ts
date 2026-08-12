import { describe, expect, it } from "vitest";
import { renderDefaultTranscriptionTemplate } from "../src/templates/default-transcription-template";
import { renderTemplate } from "../src/templates/template-renderer";

describe("renderTemplate", () => {
	it("renders Obsidian date, time, title, and plugin variables", () => {
		const result = renderTemplate(
			"# {{title}}\n{{date:YYYY/MM/DD}} {{time:HH:mm:ss}}\n{{transcript}}\n{{sourceAudio}}",
			{
				title: "测试转写",
				createdAt: new Date(2026, 7, 11, 22, 30, 5),
				variables: {
					transcript: "原始转写",
					sourceAudio: "![[raw/audio/test.m4a]]",
				},
			},
		);

		expect(result).toBe(
			"# 测试转写\n2026/08/11 22:30:05\n原始转写\n![[raw/audio/test.m4a]]",
		);
	});

	it("keeps unknown variables visible", () => {
		const result = renderTemplate("{{unknown}}", {
			title: "测试",
			createdAt: new Date(2026, 7, 11),
			variables: {},
		});

		expect(result).toBe("{{unknown}}");
	});
});

describe("renderDefaultTranscriptionTemplate", () => {
	it("preserves the transcript and links the source audio", () => {
		const result = renderDefaultTranscriptionTemplate({
			createdAt: new Date("2026-08-11T14:30:00.000Z"),
			title: "2026-08-11 转写-22-30-00",
			audioPath: "raw/audio/录音.m4a",
			transcript: "第一句。\n第二句。",
		});

		expect(result).toContain('source-audio: "[[raw/audio/录音.m4a]]"');
		expect(result).toContain("processed: false");
		expect(result.endsWith("第一句。\n第二句。\n")).toBe(true);
	});
});
