import type {
	CategoryRoute,
	PromptSource,
	VaultProfile,
	WriteMode,
} from "../domain/vault-profile";

/**
 * Validates an optional frontmatter property name.
 */
function validatePropertyName(value: unknown, label: string, fallback: string): string {
	const name = typeof value === "string" ? value.trim() : fallback;
	if (name && !/^[A-Za-z0-9_-]+$/.test(name)) {
		throw new Error(`${label}包含无效字符`);
	}
	return name;
}

/**
 * Validates that a configured vault path is relative and cannot escape.
 */
function validateVaultPath(path: string, label: string, allowEmpty: boolean): string {
	const trimmed = path.trim().replace(/\\/g, "/").replace(/\/+/g, "/");
	if (!trimmed && allowEmpty) return "";
	if (!trimmed) throw new Error(`${label}不能为空`);
	if (trimmed.startsWith("/") || /^[A-Za-z]:\//.test(trimmed)) {
		throw new Error(`${label}必须是 vault 相对路径`);
	}
	if (trimmed.split("/").includes("..")) {
		throw new Error(`${label}不能包含 ..`);
	}
	return trimmed.replace(/^\.\/|\/$/g, "");
}

/**
 * Parses a prompt source and migrates a legacy prompt file path.
 */
function parsePromptSource(
	value: unknown,
	legacyPath: unknown,
	label: string,
): PromptSource {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		const source = value as Record<string, unknown>;
		const mode = source.mode === "inline" || source.mode === "file"
			? source.mode
			: "builtin";
		return {
			mode,
			inlineText: typeof source.inlineText === "string" ? source.inlineText : "",
			filePath: validateVaultPath(
				typeof source.filePath === "string" ? source.filePath : "",
				`${label}文件路径`,
				true,
			),
		};
	}

	const migratedPath = validateVaultPath(
		typeof legacyPath === "string" ? legacyPath : "",
		`${label}文件路径`,
		true,
	);
	return {
		mode: migratedPath ? "file" : "builtin",
		inlineText: "",
		filePath: migratedPath,
	};
}

/**
 * Parses and validates a user-editable Knowledge Inbox vault profile.
 */
export function parseVaultProfile(json: string): VaultProfile {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error("Knowledge Inbox 配置不是有效 JSON");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("Knowledge Inbox 配置必须是对象");
	}

	const value = parsed as Record<string, unknown>;
	if (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3) {
		throw new Error("不支持的配置版本");
	}
	const writeMode: WriteMode = value.writeMode === "auto" ? "auto" : "preview";
	const metadataValue = value.metadataFields && typeof value.metadataFields === "object"
		? value.metadataFields as Record<string, unknown>
		: {};
	const promptValue = value.promptFiles && typeof value.promptFiles === "object"
		? value.promptFiles as Record<string, unknown>
		: {};
	const promptSources = value.prompts && typeof value.prompts === "object"
		? value.prompts as Record<string, unknown>
		: {};
	const routesValue = Array.isArray(value.routes) ? value.routes : [];
	if (routesValue.length === 0) throw new Error("至少需要一个分类路由");

	const seenIds = new Set<string>();
	const routes: CategoryRoute[] = routesValue.map((routeValue, index) => {
		if (!routeValue || typeof routeValue !== "object" || Array.isArray(routeValue)) {
			throw new Error(`第 ${index + 1} 个分类路由无效`);
		}
		const route = routeValue as Record<string, unknown>;
		const id = typeof route.id === "string" ? route.id.trim() : "";
		if (!/^[A-Za-z0-9_\-\u3400-\u9FFF]+$/.test(id)) {
			throw new Error(`分类名称无效：${id || index + 1}`);
		}
		if (seenIds.has(id)) throw new Error(`分类 ID 重复：${id}`);
		seenIds.add(id);

		return {
			id,
			label: typeof route.label === "string" && route.label.trim()
				? route.label.trim()
				: id,
			description: typeof route.description === "string" ? route.description.trim() : "",
			targetFolder: validateVaultPath(
				typeof route.targetFolder === "string" ? route.targetFolder : "",
				`分类 ${id} 的目标目录`,
				false,
			),
			outputTemplatePath: validateVaultPath(
				typeof route.outputTemplatePath === "string" ? route.outputTemplatePath : "",
				`分类 ${id} 的模板路径`,
				true,
			),
			fileNamePattern: typeof route.fileNamePattern === "string" && route.fileNamePattern.trim()
				? route.fileNamePattern.trim()
				: "{{date:YYYY-MM-DD}} {{title}}",
		};
	});

	return {
		schemaVersion: 3,
		writeMode,
		metadataFields: {
			processed: validatePropertyName(
				metadataValue.processed,
				"处理状态字段",
				"processed",
			),
			target: validatePropertyName(
				metadataValue.target,
				"目标链接字段",
				"wiki-target",
			),
			source: validatePropertyName(
				metadataValue.source,
				"来源链接字段",
				"source-raw",
			),
		},
		prompts: {
			written: parsePromptSource(
				promptSources.written,
				promptValue.written,
				"书面文本提示词",
			),
			transcript: parsePromptSource(
				promptSources.transcript,
				promptValue.transcript,
				"语音转写提示词",
			),
		},
		routes,
	};
}
