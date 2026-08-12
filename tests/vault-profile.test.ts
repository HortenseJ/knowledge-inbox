import { describe, expect, it } from "vitest";
import { DEFAULT_VAULT_PROFILE } from "../src/domain/vault-profile";
import { parseVaultProfile } from "../src/parsing/parse-vault-profile";
import { resolveRoute } from "../src/routing/route-resolver";

describe("parseVaultProfile", () => {
	it("parses the default profile", () => {
		const profile = parseVaultProfile(JSON.stringify(DEFAULT_VAULT_PROFILE));
		expect(profile.writeMode).toBe("preview");
		expect(profile.routes.map((route) => route.id)).toEqual([
			"study",
			"work",
			"todo",
			"memo",
			"life",
		]);
	});

	it("rejects target folders that escape the vault", () => {
		const profile = {
			...DEFAULT_VAULT_PROFILE,
			routes: [{
				...DEFAULT_VAULT_PROFILE.routes[0],
				targetFolder: "../../private",
			}],
		};

		expect(() => parseVaultProfile(JSON.stringify(profile)))
			.toThrow("不能包含 ..");
	});

	it("rejects duplicate category IDs", () => {
		const profile = {
			...DEFAULT_VAULT_PROFILE,
			routes: [
				DEFAULT_VAULT_PROFILE.routes[0],
				DEFAULT_VAULT_PROFILE.routes[0],
			],
		};

		expect(() => parseVaultProfile(JSON.stringify(profile)))
			.toThrow("分类 ID 重复");
	});

	it("migrates legacy prompt file settings to prompt sources", () => {
		const legacy = {
			...DEFAULT_VAULT_PROFILE,
			schemaVersion: 1,
			promptFiles: {
				written: "prompts/written.md",
				transcript: "",
				classification: "prompts/classify.md",
			},
		};
		delete (legacy as Partial<typeof legacy>).prompts;

		const profile = parseVaultProfile(JSON.stringify(legacy));
		expect(profile.schemaVersion).toBe(3);
		expect(profile.prompts.written).toEqual({
			mode: "file",
			inlineText: "",
			filePath: "prompts/written.md",
		});
		expect(profile.prompts.transcript.mode).toBe("builtin");
	});

	it("accepts Chinese category names", () => {
		const profile = {
			...DEFAULT_VAULT_PROFILE,
			routes: [{
				...DEFAULT_VAULT_PROFILE.routes[0],
				id: "工作记录",
				label: "工作记录",
				targetFolder: "wiki/工作记录",
			}],
		};

		expect(parseVaultProfile(JSON.stringify(profile)).routes[0].id)
			.toBe("工作记录");
	});
});

describe("resolveRoute", () => {
	it("resolves only an exact configured category", () => {
		expect(resolveRoute(DEFAULT_VAULT_PROFILE, "work")?.targetFolder).toBe("wiki/work");
		expect(resolveRoute(DEFAULT_VAULT_PROFILE, "../../private")).toBeNull();
		expect(resolveRoute(DEFAULT_VAULT_PROFILE, null)).toBeNull();
	});
});
