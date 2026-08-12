import type { TextSourceType } from "./capture";
import type { KnowledgeArtifact } from "./knowledge-artifact";
import type { WriteMode } from "./vault-profile";

export type JobKind = "audio" | "text";
export type JobStage =
	| "queued"
	| "transcribing"
	| "organizing"
	| "waiting-review"
	| "writing"
	| "completed";
export type JobStatus =
	| "pending"
	| "running"
	| "waiting-review"
	| "paused"
	| "failed"
	| "completed"
	| "cancelled";

export interface ProcessingJob {
	id: string;
	kind: JobKind;
	stage: JobStage;
	status: JobStatus;
	writeMode: WriteMode;
	sourcePath?: string;
	sourceText?: string;
	sourceType: TextSourceType;
	mimeType?: string;
	rawPath?: string;
	plannedRawPath?: string;
	artifact?: KnowledgeArtifact;
	wikiPath?: string;
	plannedWikiPath?: string;
	error?: string;
	attempts: number;
	createdAt: string;
	updatedAt: string;
}
