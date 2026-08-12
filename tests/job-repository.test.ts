import { describe, expect, it } from "vitest";
import type { ProcessingJob } from "../src/domain/processing-job";
import { JobRepository, type LocalJobStorage } from "../src/storage/job-repository";

class MemoryStorage implements LocalJobStorage {
	private values = new Map<string, unknown>();

	loadLocalStorage(key: string): unknown | null {
		return this.values.get(key) ?? null;
	}

	saveLocalStorage(key: string, data: unknown | null): void {
		this.values.set(key, data);
	}
}

function createJob(overrides: Partial<ProcessingJob> = {}): ProcessingJob {
	return {
		id: "job-1",
		kind: "audio",
		stage: "transcribing",
		status: "running",
		writeMode: "preview",
		sourcePath: "raw/audio/test.webm",
		sourceType: "external-transcript",
		attempts: 1,
		createdAt: "2026-08-12T12:00:00.000Z",
		updatedAt: "2026-08-12T12:00:00.000Z",
		...overrides,
	};
}

describe("JobRepository", () => {
	it("persists and updates a job", () => {
		const repository = new JobRepository(new MemoryStorage());
		repository.upsert(createJob());
		repository.update("job-1", { stage: "organizing", status: "pending" });

		expect(repository.get("job-1")).toMatchObject({
			stage: "organizing",
			status: "pending",
		});
	});

	it("recovers running jobs after restart", () => {
		const repository = new JobRepository(new MemoryStorage());
		repository.upsert(createJob());

		expect(repository.recoverInterrupted()).toBe(1);
		expect(repository.get("job-1")).toMatchObject({
			status: "pending",
			error: "上次处理被中断，已准备恢复",
		});
	});

	it("limits cancelled terminal jobs and removes large payloads", () => {
		const repository = new JobRepository(new MemoryStorage());
		for (let index = 0; index < 15; index += 1) {
			repository.upsert(createJob({
				id: `cancelled-${index}`,
				status: "cancelled",
				sourceText: "large source text",
				artifact: {
					title: "draft",
					categoryId: "memo",
					contentMarkdown: "content",
					todos: [],
					uncertainties: [],
				},
				updatedAt: `2026-08-12T12:00:${index.toString().padStart(2, "0")}.000Z`,
			}));
		}

		const cancelled = repository.list().filter((job) => job.status === "cancelled");
		expect(cancelled).toHaveLength(10);
		expect(cancelled.every((job) => !job.sourceText && !job.artifact)).toBe(true);
	});
});
