export interface TemplateRenderContext {
	title: string;
	createdAt: Date;
	variables: Record<string, string>;
}

/**
 * Formats the common Moment-style tokens supported by Obsidian Templates.
 */
export function formatTemplateDate(date: Date, format: string): string {
	const tokens: Record<string, string> = {
		YYYY: date.getFullYear().toString(),
		MM: (date.getMonth() + 1).toString().padStart(2, "0"),
		DD: date.getDate().toString().padStart(2, "0"),
		HH: date.getHours().toString().padStart(2, "0"),
		mm: date.getMinutes().toString().padStart(2, "0"),
		ss: date.getSeconds().toString().padStart(2, "0"),
	};

	return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => tokens[token]);
}

/**
 * Renders an Obsidian-style template plus Knowledge Inbox variables.
 *
 * Unknown variables remain unchanged so users can detect unsupported syntax
 * instead of silently losing template content.
 */
export function renderTemplate(template: string, context: TemplateRenderContext): string {
	return template.replace(/\{\{([^{}]+)\}\}/g, (placeholder, expression: string) => {
		const trimmed = expression.trim();
		if (trimmed === "title") return context.title;
		if (trimmed === "date") return formatTemplateDate(context.createdAt, "YYYY-MM-DD");
		if (trimmed === "time") return formatTemplateDate(context.createdAt, "HH:mm");
		if (trimmed.startsWith("date:")) {
			return formatTemplateDate(context.createdAt, trimmed.slice("date:".length));
		}
		if (trimmed.startsWith("time:")) {
			return formatTemplateDate(context.createdAt, trimmed.slice("time:".length));
		}
		if (Object.prototype.hasOwnProperty.call(context.variables, trimmed)) {
			return context.variables[trimmed];
		}
		return placeholder;
	});
}
