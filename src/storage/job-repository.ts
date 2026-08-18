import type { ProcessingJob } from "../domain/processing-job";

const JOB_STORAGE_KEY = "knowledge-inbox-processing-jobs-v1";
const MAX_COMPLETED_JOBS = 20;
const MAX_FAILED_JOBS = 30;
const MAX_CANCELLED_JOBS = 10;
const MAX_PAUSED_JOBS = 30;

export interface LocalJobStorage {
	loadLocalStorage(key: string): unknown;
	saveLocalStorage(key: string, data: unknown): void;
}

/**
 * Stores per-device processing jobs outside the synced vault files.
 */
export class JobRepository {
	constructor(private readonly storage: LocalJobStorage) {}

	list(): ProcessingJob[] {
		const loaded = this.storage.loadLocalStorage(JOB_STORAGE_KEY);
		if (!Array.isArray(loaded)) return [];
		return (loaded as unknown[]).filter((item): item is ProcessingJob =>
			typeof item === "object" && item !== null && "id" in item && typeof item.id === "string");
	}

	get(id: string): ProcessingJob | null {
		return this.list().find((job) => job.id === id) ?? null;
	}

	upsert(job: ProcessingJob): void {
		const jobs = this.list();
		const index = jobs.findIndex((item) => item.id === job.id);
		if (index >= 0) jobs[index] = job;
		else jobs.push(job);
		this.persist(this.prune(jobs));
	}

	update(id: string, patch: Partial<ProcessingJob>): ProcessingJob | null {
		const job = this.get(id);
		if (!job) return null;
		const updated: ProcessingJob = {
			...job,
			...patch,
			updatedAt: new Date().toISOString(),
		};
		this.upsert(updated);
		return updated;
	}

	/**
	 * Converts jobs interrupted by an app shutdown back to pending.
	 */
	recoverInterrupted(): number {
		const jobs = this.list();
		let recovered = 0;
		for (const job of jobs) {
			if (job.status === "running") {
				job.status = "pending";
				job.error = "上次处理被中断，已准备恢复";
				job.updatedAt = new Date().toISOString();
				recovered += 1;
			}
		}
		if (recovered > 0) this.persist(jobs);
		return recovered;
	}

	private persist(jobs: ProcessingJob[]): void {
		this.storage.saveLocalStorage(JOB_STORAGE_KEY, jobs);
	}

	private prune(jobs: ProcessingJob[]): ProcessingJob[] {
		const active = jobs.filter((job) =>
			["pending", "running", "waiting-review"].includes(job.status));
		const paused = jobs
			.filter((job) => job.status === "paused")
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, MAX_PAUSED_JOBS);
		const failed = jobs
			.filter((job) => job.status === "failed")
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, MAX_FAILED_JOBS);
		const completed = jobs
			.filter((job) => job.status === "completed")
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, MAX_COMPLETED_JOBS)
			.map((job) => ({ ...job, sourceText: undefined, artifact: undefined }));
		const cancelled = jobs
			.filter((job) => job.status === "cancelled")
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, MAX_CANCELLED_JOBS)
			.map((job) => ({ ...job, sourceText: undefined, artifact: undefined }));
		return [...active, ...paused, ...failed, ...completed, ...cancelled];
	}
}
