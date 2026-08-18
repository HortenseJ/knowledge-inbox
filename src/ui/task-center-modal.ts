import { App, Modal } from "obsidian";
import type { ProcessingJob } from "../domain/processing-job";

export interface TaskCenterActions {
	getJobs: () => ProcessingJob[];
	retry: (id: string) => void;
	cancel: (id: string) => void;
	review: (id: string) => Promise<void>;
	openPath: (path: string) => Promise<void>;
}

const STATUS_LABELS: Record<ProcessingJob["status"], string> = {
	pending: "等待处理",
	running: "处理中",
	"waiting-review": "等待确认",
	paused: "已暂停",
	failed: "失败",
	completed: "已完成",
	cancelled: "已取消",
};

/**
 * Lightweight persistent task center for recovery and review.
 */
export class TaskCenterModal extends Modal {
	private refreshTimer: number | null = null;

	constructor(app: App, private readonly actions: TaskCenterActions) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("knowledge-inbox-task-center-shell");
		this.render();
		this.refreshTimer = window.setInterval(() => this.render(), 2000);
	}

	onClose(): void {
		if (this.refreshTimer !== null) window.clearInterval(this.refreshTimer);
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("knowledge-inbox-task-center");
		this.contentEl.createEl("h2", { text: "Knowledge Inbox 处理任务" });
		const jobs = this.actions.getJobs()
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		if (jobs.length === 0) {
			this.contentEl.createEl("p", { text: "暂无处理任务。" });
			return;
		}

		for (const job of jobs) {
			const card = this.contentEl.createDiv({ cls: "knowledge-inbox-task-card" });
			const header = card.createDiv({ cls: "knowledge-inbox-task-header" });
			header.createEl("strong", {
				text: job.kind === "audio" ? "录音任务" : "文本任务",
			});
			header.createSpan({
				text: STATUS_LABELS[job.status],
				cls: `knowledge-inbox-task-status is-${job.status}`,
			});
			card.createEl("p", {
				text: job.error || `阶段：${job.stage}`,
				cls: "setting-item-description",
			});
			if (job.sourcePath) card.createEl("code", { text: job.sourcePath });

			const actions = card.createDiv({ cls: "knowledge-inbox-task-actions" });
			if (job.status === "waiting-review") {
				this.addAction(actions, "确认并写入", () => void this.actions.review(job.id), true);
			}
			if (job.status === "failed" || job.status === "paused") {
				this.addAction(actions, "重试", () => this.actions.retry(job.id), true);
			}
			if (job.rawPath) {
				this.addAction(actions, "打开 raw", () => void this.actions.openPath(job.rawPath!));
			}
			if (job.wikiPath) {
				this.addAction(actions, "打开 wiki", () => void this.actions.openPath(job.wikiPath!));
			}
			if (
				!["completed", "cancelled"].includes(job.status)
				&& job.stage !== "writing"
			) {
				this.addAction(actions, "取消", () => this.actions.cancel(job.id));
			}
		}
	}

	private addAction(
		container: HTMLElement,
		label: string,
		callback: () => void,
		primary = false,
	): void {
		const button = container.createEl("button", {
			text: label,
			cls: primary ? "mod-cta" : "",
		});
		button.addEventListener("click", callback);
	}
}
