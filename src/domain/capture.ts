import type { WriteMode } from "./vault-profile";

export type CaptureMode = "audio" | "text";

export type TextSourceType = "written" | "external-transcript";

export type CaptureSubmission =
	| {
		kind: "audio";
		blob: Blob;
		mimeType: string;
		writeMode: WriteMode;
	}
	| {
		kind: "text";
		text: string;
		sourceType: TextSourceType;
		processWithAi: boolean;
		writeMode: WriteMode;
	};
