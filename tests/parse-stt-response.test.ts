import { describe, expect, it } from "vitest";
import { parseSttResponse } from "../src/parsing/parse-stt-response";

describe("parseSttResponse", () => {
	it("extracts text from the parsed SiliconFlow JSON response", () => {
		expect(parseSttResponse({ text: "转写正文" }, '{"text":"转写正文"}'))
			.toBe("转写正文");
	});

	it("extracts text when JSON is available only as response text", () => {
		expect(parseSttResponse(null, '{"text":"转写正文"}')).toBe("转写正文");
	});

	it("preserves a plain-text provider response", () => {
		expect(parseSttResponse(null, "  纯文本转写  ")).toBe("纯文本转写");
	});
});
