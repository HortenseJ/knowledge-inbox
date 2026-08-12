import { describe, expect, it } from "vitest";
import { shouldDeleteSource } from "../src/pipeline/source-retention";

describe("shouldDeleteSource", () => {
	it("keeps the source when automatic deletion is disabled", () => {
		expect(shouldDeleteSource({
			deleteEnabled: false,
			expectedOutputs: 1,
			committedOutputs: 1,
		})).toBe(false);
	});

	it("keeps the source when the AI produced no writable output", () => {
		expect(shouldDeleteSource({
			deleteEnabled: true,
			expectedOutputs: 0,
			committedOutputs: 0,
		})).toBe(false);
	});

	it("keeps the source after a partial write", () => {
		expect(shouldDeleteSource({
			deleteEnabled: true,
			expectedOutputs: 2,
			committedOutputs: 1,
		})).toBe(false);
	});

	it("allows deletion only after every output is committed", () => {
		expect(shouldDeleteSource({
			deleteEnabled: true,
			expectedOutputs: 2,
			committedOutputs: 2,
		})).toBe(true);
	});
});
