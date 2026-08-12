export type ContentType = "reminder" | "memo" | "mixed" | "unknown";

export interface ParsedAiResponse {
	type: ContentType;
	todos: string[];
	memo: string;
	summary: string;
	title: string;
}

type Section = "type" | "title" | "summary" | "todos" | "memo";

interface ParsedHeader {
	section: Section;
	inlineContent: string;
}

/**
 * Parses a Markdown heading used by the legacy Audio Inbox response format.
 *
 * Emoji before a heading label are ignored so both `## 总结` and
 * `## 📋 总结` remain compatible.
 */
function parseHeader(line: string): ParsedHeader | null {
	if (!/^#{2,3}\s*/.test(line)) return null;

	const body = line
		.replace(/^#{2,3}\s*/, "")
		.replace(/^[^A-Za-z0-9\u3400-\u9FFF]+/, "")
		.trim();
	const match = body.match(/^(标题|类型|总结|待办(?:事项)?|备忘(?:内容)?)(?:[:：\s]*(.*))?$/i);
	if (!match) return null;

	const labels: Record<string, Section> = {
		"标题": "title",
		"类型": "type",
		"总结": "summary",
		"待办": "todos",
		"待办事项": "todos",
		"备忘": "memo",
		"备忘内容": "memo",
	};

	return {
		section: labels[match[1]],
		inlineContent: (match[2] ?? "").trim(),
	};
}

/**
 * Parses the legacy AI Markdown response into a structured domain object.
 *
 * This parser remains as a compatibility layer while Knowledge Inbox moves
 * toward validated JSON responses.
 */
export function parseAiResponse(text: string): ParsedAiResponse {
	const lines = text.split("\n");
	let type: ContentType = "unknown";
	const todos: string[] = [];
	let memo = "";
	let summary = "";
	let title = "";
	let currentSection: Section | null = null;

	for (const line of lines) {
		const trimmed = line.trim();
		const header = parseHeader(trimmed);
		if (header) {
			currentSection = header.section;
			if (header.section === "title" && header.inlineContent && !title) {
				title = header.inlineContent.substring(0, 10);
			}
			continue;
		}

		if (currentSection === "title" && trimmed && !title) {
			title = trimmed.substring(0, 10);
		} else if (currentSection === "type" && trimmed) {
			if (trimmed.includes("提醒")) type = "reminder";
			else if (trimmed.includes("备忘")) type = "memo";
			else if (trimmed.includes("混合")) type = "mixed";
		} else if (currentSection === "summary" && trimmed) {
			summary += `${line}\n`;
		} else if (currentSection === "todos") {
			if (/^\s*-\s*\[ \]\s*\S/.test(line)) {
				todos.push(line.trim());
			}
		} else if (currentSection === "memo" && trimmed) {
			memo += `${line}\n`;
		}
	}

	if (type === "unknown") {
		const hasRealTodos = todos.some((todo) => !todo.includes("无"));
		const hasMemo = memo.trim().length > 0;
		const hasSummary = summary.trim().length > 0;

		if (hasMemo && hasRealTodos) type = "mixed";
		else if (hasMemo) type = "memo";
		else if (hasRealTodos) type = "reminder";
		else if (hasSummary) {
			if (/待办|任务|提醒|记得要去|要买|要完成|开会|提交|约定|^\d{1,2}/.test(summary)) {
				type = "reminder";
			} else {
				type = "memo";
				memo = summary;
			}
		}
	}

	if ((type === "memo" || type === "mixed") && !memo.trim() && summary.trim()) {
		memo = summary;
	}

	return {
		type,
		todos,
		memo: memo.trim(),
		summary: summary.trim(),
		title,
	};
}
