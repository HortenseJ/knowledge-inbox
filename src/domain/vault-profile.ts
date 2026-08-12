export type WriteMode = "preview" | "auto";
export type PromptMode = "builtin" | "inline" | "file";

export interface PromptSource {
	mode: PromptMode;
	inlineText: string;
	filePath: string;
}

export interface CategoryRoute {
	id: string;
	label: string;
	description: string;
	targetFolder: string;
	outputTemplatePath: string;
	fileNamePattern: string;
}

export interface VaultProfile {
	schemaVersion: 3;
	writeMode: WriteMode;
	metadataFields: {
		processed: string;
		target: string;
		source: string;
	};
	prompts: {
		written: PromptSource;
		transcript: PromptSource;
	};
	routes: CategoryRoute[];
}

export const DEFAULT_VAULT_PROFILE: VaultProfile = {
	schemaVersion: 3,
	writeMode: "preview",
	metadataFields: {
		processed: "processed",
		target: "wiki-target",
		source: "source-raw",
	},
	prompts: {
		written: { mode: "builtin", inlineText: "", filePath: "" },
		transcript: { mode: "builtin", inlineText: "", filePath: "" },
	},
	routes: [
		{
			id: "study",
			label: "学习",
			description: "学习材料、知识点、课程和阅读整理",
			targetFolder: "wiki/study",
			outputTemplatePath: "",
			fileNamePattern: "{{date:YYYY-MM-DD}} {{title}}",
		},
		{
			id: "work",
			label: "工作",
			description: "工作记录、业务内容、会议和项目复盘",
			targetFolder: "wiki/work",
			outputTemplatePath: "",
			fileNamePattern: "{{date:YYYY-MM-DD}} {{title}}",
		},
		{
			id: "todo",
			label: "待办",
			description: "以行动项、提醒和时间约定为主的内容",
			targetFolder: "wiki/todo",
			outputTemplatePath: "",
			fileNamePattern: "{{date:YYYY-MM-DD}} {{title}}",
		},
		{
			id: "memo",
			label: "备忘",
			description: "暂时记录的信息、灵感和一般备忘",
			targetFolder: "wiki/memo",
			outputTemplatePath: "",
			fileNamePattern: "{{date:YYYY-MM-DD}} {{title}}",
		},
		{
			id: "life",
			label: "生活",
			description: "日常生活、个人安排和非工作记录",
			targetFolder: "wiki/life",
			outputTemplatePath: "",
			fileNamePattern: "{{date:YYYY-MM-DD}} {{title}}",
		},
	],
};
