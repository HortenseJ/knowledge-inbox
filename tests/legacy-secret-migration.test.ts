import { describe, expect, it } from "vitest";
import { extractLegacySecrets } from "../src/settings/legacy-secret-migration";

describe("extractLegacySecrets", () => {
	it("removes plaintext keys while preserving normal settings", () => {
		const result = extractLegacySecrets({
			sttApiKey: "  stt-secret  ",
			aiApiKey: "ai-secret",
			sttModel: "SenseVoice",
		});

		expect(result.legacySecrets).toEqual({
			sttApiKey: "stt-secret",
			aiApiKey: "ai-secret",
		});
		expect(result.sanitizedSettings).toEqual({
			sttModel: "SenseVoice",
		});
		expect(result.hadLegacySecrets).toBe(true);
	});

	it("does not treat empty legacy fields as secrets", () => {
		const result = extractLegacySecrets({
			sttApiKey: " ",
			aiApiKey: "",
			outputFolder: "wiki",
		});

		expect(result.hadLegacySecrets).toBe(false);
		expect(result.sanitizedSettings).toEqual({
			outputFolder: "wiki",
		});
	});
});
