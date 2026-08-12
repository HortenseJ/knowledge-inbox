import type { TextSourceType } from "../domain/capture";
import type { CategoryRoute } from "../domain/vault-profile";

/**
 * Builds the JSON output contract from trusted configured route IDs.
 */
function buildOutputContract(routes: CategoryRoute[]): string {
	const categoryOptions = routes.map((route) => route.id).join(" | ");
	return `
只返回一个 JSON 对象，不要使用 Markdown 代码围栏，不要补充解释：
{
  "title": "简洁标题",
  "categoryId": "${categoryOptions} 中最合适的一项，无法判断时为 null",
  "contentMarkdown": "整理后的 Markdown 正文",
  "todos": ["待办文本，不带复选框"],
  "uncertainties": ["无法可靠确认的词语或事实"]
}`.trim();
}

const WRITTEN_TEXT_RULES = `
你是一名知识整理助手。输入是用户输入或复制的书面文本。

规则：
1. 严格以原文为事实边界，不添加原文没有的信息。
2. 保留作者的关键措辞、观点、数字、专有名词和引用。
3. 不以“润色”为由改写观点或删减细节。
4. 可以调整标题层级、分段、列表和 Markdown 格式，使内容条分缕析。
5. 明确的行动项可提取到 todos；正文中仍保留必要上下文。
6. 无法判断的内容放入 uncertainties，不要猜测。
`;

const EXTERNAL_TRANSCRIPT_RULES = `
你是一名智能语音笔记助手。输入由语音识别生成，可能包含错别字、同音字、漏字和断句错误。

规则：
1. 对明显不通顺、不合逻辑的词语，根据上下文修正；证据不足时保留并放入 uncertainties。
2. 对明显断裂的句子结合前后文补全；不能可靠补全时不要脑补。
3. 删除语气词、口头禅和无意义重复，合并重复表达。
4. 严格保留事实、评价、数字、专有名词和可能重要的细节，宁可保留，不随意删减。
5. 将正文整理为标题、分节、列表等清晰 Markdown，而不是逐字照抄。
6. 明确的行动项提取到 todos。
`;

/**
 * Returns the visible built-in organization rules for a source type.
 */
export function getBuiltinSourcePrompt(sourceType: TextSourceType): string {
	return (sourceType === "written" ? WRITTEN_TEXT_RULES : EXTERNAL_TRANSCRIPT_RULES).trim();
}

/**
 * Returns a plain-language explanation of built-in route classification.
 */
export function getBuiltinClassificationPrompt(routes: CategoryRoute[]): string {
	return [
		"系统会阅读每个分类的“什么时候使用这个分类”，并从以下分类中选择最合适的一项：",
		...routes.map((route) =>
			`- ${route.id}（${route.label}）：${route.description || "未填写判断规则"}`),
		"无法可靠判断时返回 null，并交给用户手动选择。",
	].join("\n");
}

export interface ProcessingPromptOptions {
	sourceType: TextSourceType;
	routes: CategoryRoute[];
	sourcePrompt?: string;
}

/**
 * Builds the full processing prompt from defaults, vault prompt files, and
 * configured route descriptions.
 */
export function buildProcessingPrompt(options: ProcessingPromptOptions): string {
	const { sourceType, routes, sourcePrompt } = options;
	const rules = sourcePrompt?.trim() || getBuiltinSourcePrompt(sourceType);
	const routeDescriptions = routes
		.map((route) => `- ${route.id}（${route.label}）：${route.description || "无补充说明"}`)
		.join("\n");
	return [
		rules.trim(),
		"## 可选分类",
		routeDescriptions,
		buildOutputContract(routes),
	].filter(Boolean).join("\n\n");
}
