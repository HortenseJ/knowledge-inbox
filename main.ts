import { Plugin, Notice, PluginSettingTab, App, Setting, requestUrl, normalizePath, TFile, Platform, SecretComponent } from "obsidian";
import {
	resolveUniqueMarkdownPath,
	sanitizeFileNamePart,
} from "./src/storage/filename-policy";
import { shouldDeleteSource } from "./src/pipeline/source-retention";
import { CaptureModal } from "./src/ui/capture-modal";
import type { CaptureMode, CaptureSubmission, TextSourceType } from "./src/domain/capture";
import { renderDefaultRawTextTemplate } from "./src/templates/default-raw-text-template";
import { renderDefaultTranscriptionTemplate } from "./src/templates/default-transcription-template";
import { renderTemplate } from "./src/templates/template-renderer";
import { VaultMarkdownFileSuggest } from "./src/ui/vault-markdown-file-suggest";
import { extractLegacySecrets } from "./src/settings/legacy-secret-migration";
import type { KnowledgeArtifact } from "./src/domain/knowledge-artifact";
import { parseKnowledgeArtifact } from "./src/parsing/parse-knowledge-artifact";
import { parseSttResponse } from "./src/parsing/parse-stt-response";
import { parseCategoryImport } from "./src/parsing/parse-category-import";
import { upsertAiDraft } from "./src/templates/ai-draft-template";
import { VaultProfileRepository } from "./src/storage/vault-profile-repository";
import { PromptResolver } from "./src/prompts/prompt-resolver";
import type { VaultProfile } from "./src/domain/vault-profile";
import { resolveRoute } from "./src/routing/route-resolver";
import { WikiArtifactWriter } from "./src/storage/wiki-artifact-writer";
import {
	ArtifactPreviewModal,
	type ArtifactPreviewDecision,
} from "./src/ui/artifact-preview-modal";
import { ProfileSettingsModal } from "./src/ui/profile-settings-modal";
import { ContentPreviewModal } from "./src/ui/content-preview-modal";
import { CATEGORY_IMPORT_PROMPT } from "./src/prompts/category-import-prompt";
import type { CategoryRoute } from "./src/domain/vault-profile";
import type { ProcessingJob } from "./src/domain/processing-job";
import { JobRepository } from "./src/storage/job-repository";
import { TaskCenterModal } from "./src/ui/task-center-modal";

// ==================== TYPES ====================

interface KnowledgeInboxSettings {
	inboxFolder: string;
	textInputFolder: string;
	transcriptionFolder: string;
	textTemplatePath: string;
	transcriptionTemplatePath: string;
	profilePath: string;
	sttApiUrl: string;
	sttSecretId: string;
	sttModel: string;
	sttLanguage: string;
	aiApiUrl: string;
	aiSecretId: string;
	aiModel: string;
	autoProcessText: boolean;
	deleteAfterProcess: boolean;
}

const DEFAULT_STT_SECRET_ID = "knowledge-inbox-stt-api-key";
const DEFAULT_AI_SECRET_ID = "knowledge-inbox-llm-api-key";

const DEFAULTS: KnowledgeInboxSettings = {
	inboxFolder: "raw/audio",
	textInputFolder: "raw/text",
	transcriptionFolder: "raw/transcription",
	textTemplatePath: "",
	transcriptionTemplatePath: "",
	profilePath: ".knowledge-inbox/profile.json",
	sttApiUrl: "https://api.siliconflow.cn/v1/audio/transcriptions",
	sttSecretId: DEFAULT_STT_SECRET_ID,
	sttModel: "FunAudioLLM/SenseVoiceSmall",
	sttLanguage: "zh",
	aiApiUrl: "https://api.deepseek.com/v1/chat/completions",
	aiSecretId: DEFAULT_AI_SECRET_ID,
	aiModel: "deepseek-chat",
	autoProcessText: true,
	deleteAfterProcess: false,
};

// ==================== MAIN PLUGIN ====================

/** Knowledge Inbox Obsidian plugin entry point. */
export default class KnowledgeInboxPlugin extends Plugin {
	settings: KnowledgeInboxSettings;
	private captureOpen = false;
	private workerRunning = false;
	private reviewingJobs = new Set<string>();
	private fabEl: HTMLElement | null = null;
	private profileRepository!: VaultProfileRepository;
	private promptResolver!: PromptResolver;
	private wikiArtifactWriter!: WikiArtifactWriter;
	private jobRepository!: JobRepository;

	async onload() {
		this.profileRepository = new VaultProfileRepository(this.app);
		this.promptResolver = new PromptResolver(this.app);
		this.wikiArtifactWriter = new WikiArtifactWriter(this.app);
		this.jobRepository = new JobRepository(this.app);
		await this.loadSettings();
		const recoveredJobs = this.jobRepository.recoverInterrupted();
		if (recoveredJobs > 0) {
			new Notice(`Knowledge Inbox 已恢复 ${recoveredJobs} 个未完成任务`, 8000);
		}

		// Ribbon — unified capture window
		this.addRibbonIcon("inbox", "打开 Knowledge Inbox", () => this.openCaptureFlow("audio"));
		this.addRibbonIcon("list-checks", "打开 Knowledge Inbox 处理任务", () => this.openTaskCenter());

		// Commands — unified capture window
		this.addCommand({ id: "open-capture", name: "打开采集窗口", callback: () => this.openCaptureFlow("audio") });
		this.addCommand({ id: "capture-audio", name: "采集：录音", callback: () => this.openCaptureFlow("audio") });
		this.addCommand({ id: "capture-text", name: "采集：文本", callback: () => this.openCaptureFlow("text") });
		this.addCommand({ id: "open-task-center", name: "打开处理任务", callback: () => this.openTaskCenter() });
		this.addCommand({
			id: "organize-selected-text",
			name: "整理选中文本",
			editorCheckCallback: (checking, editor, view) => {
				const selectedText = editor.getSelection().trim();
				if (!selectedText || !view.file) return false;
				if (!checking) void this.processSelectedText(selectedText, view.file);
				return true;
			},
		});

		// Command — process inbox files
		this.addCommand({ id: "process-inbox", name: "处理录音文件夹", callback: () => this.processInbox() });

		// Settings
		this.addSettingTab(new KnowledgeInboxSettingTab(this.app, this));

		// Floating button for mobile (big and hard to miss)
		this.addFab();
		window.setTimeout(() => void this.pumpJobs(), 0);
	}

	private addFab() {
		if (!Platform.isMobileApp) return;

		const fab = activeDocument.body.createDiv({ cls: "ai-fab" });
		const svgns = "http://www.w3.org/2000/svg";
		const svg = activeDocument.createElementNS(svgns, "svg");
		svg.setAttribute("width", "40"); svg.setAttribute("height", "40");
		svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("fill", "none");
		svg.setAttribute("stroke", "#fff"); svg.setAttribute("stroke-width", "1.5");
		svg.setAttribute("stroke-linecap", "round");
		[4, 7, 10].forEach((r, i) => {
			const c = activeDocument.createElementNS(svgns, "circle");
			c.setAttribute("cx", "12"); c.setAttribute("cy", "12");
			c.setAttribute("r", String(r));
			c.setAttribute("opacity", String([0.55, 0.35, 0.18][i]));
			svg.appendChild(c);
		});
		const dot = activeDocument.createElementNS(svgns, "circle");
		dot.setAttribute("cx", "12"); dot.setAttribute("cy", "12");
		dot.setAttribute("r", "3"); dot.setAttribute("fill", "#fff");
		dot.setAttribute("stroke", "none"); svg.appendChild(dot);
		fab.appendChild(svg);
		this.fabEl = fab;

		let dragging = false;
		let moved = false;
		let sx = 0, sy = 0, sl = 0, st = 0;

		// Only attach move/end to document DURING a drag
		const addListeners = () => {
			activeDocument.addEventListener("touchmove", onMove, { passive: false });
			activeDocument.addEventListener("touchend", onEnd);
			activeDocument.addEventListener("mousemove", onMove);
			activeDocument.addEventListener("mouseup", onEnd);
		};
		const removeListeners = () => {
			activeDocument.removeEventListener("touchmove", onMove);
			activeDocument.removeEventListener("touchend", onEnd);
			activeDocument.removeEventListener("mousemove", onMove);
			activeDocument.removeEventListener("mouseup", onEnd);
		};

		const onStart = (e: TouchEvent | MouseEvent) => {
			moved = false;
			const t = "touches" in e ? e.touches[0] : e;
			sx = t.clientX; sy = t.clientY;
			const r = fab.getBoundingClientRect();
			sl = r.left; st = r.top;
			addListeners();
		};

		const onMove = (e: TouchEvent | MouseEvent) => {
			const t = "touches" in e ? e.touches[0] : e;
			const dx = t.clientX - sx, dy = t.clientY - sy;
			if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved = true;
			if (!moved) return;
			e.preventDefault();
			dragging = true;
			fab.style.setProperty("left", `${sl + dx}px`);
			fab.style.setProperty("top", `${st + dy}px`);
			fab.addClass("ai-fab-dragged");
		};

		const onEnd = () => {
			removeListeners();
			window.setTimeout(() => { dragging = false; moved = false; }, 50);
		};

		fab.addEventListener("touchstart", onStart, { passive: false });
		fab.addEventListener("mousedown", onStart);

		fab.addEventListener("click", () => {
			if (dragging || moved) return;
			if (this.captureOpen) { new Notice("采集窗口已经打开"); return; }
			void this.openCaptureFlow("audio");
		});

		// Re-inject if Obsidian mobile re-renders
		this.registerInterval(window.setInterval(() => {
			if (!activeDocument.body.contains(fab)) {
				activeDocument.body.appendChild(fab);
			}
		}, 3000));
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData() ?? {}) as Record<string, unknown>;
		const extraction = extractLegacySecrets(loaded);
		this.settings = {
			...DEFAULTS,
			...extraction.sanitizedSettings,
		};
		let settingsChanged = extraction.hadLegacySecrets;

		if (extraction.legacySecrets.sttApiKey) {
			this.migrateLegacySecret(this.settings.sttSecretId, extraction.legacySecrets.sttApiKey);
		}
		if (extraction.legacySecrets.aiApiKey) {
			this.migrateLegacySecret(this.settings.aiSecretId, extraction.legacySecrets.aiApiKey);
		}

		// Auto-migrate: Knowledge Inbox keeps source audio by default.
		if (loaded.deleteAfterProcess === undefined) {
			this.settings.deleteAfterProcess = false;
			settingsChanged = true;
		}
		if (settingsChanged) {
			await this.saveSettings();
		}
		if (extraction.hadLegacySecrets) {
			new Notice("Knowledge Inbox 已将旧 API Key 移出 data.json；请在设置中确认 Secret 选择。", 8000);
		}
	}
	async saveSettings() { await this.saveData(this.settings); }

	/**
	 * Moves a legacy plaintext key into SecretStorage without overwriting an
	 * existing secret selected by the user.
	 */
	private migrateLegacySecret(secretId: string, legacyValue: string): void {
		if (!this.app.secretStorage.getSecret(secretId)) {
			this.app.secretStorage.setSecret(secretId, legacyValue);
		}
	}

	/**
	 * Reads the currently selected STT API key from SecretStorage.
	 */
	private getSttApiKey(): string {
		return this.app.secretStorage.getSecret(this.settings.sttSecretId) ?? "";
	}

	/**
	 * Reads the currently selected LLM API key from SecretStorage.
	 */
	private getAiApiKey(): string {
		return this.app.secretStorage.getSecret(this.settings.aiSecretId) ?? "";
	}

	// ===== MAIN FLOW: Capture → Persist → Process =====

	/**
	 * Opens the unified capture window, persists input, and enqueues processing.
	 */
	async openCaptureFlow(initialMode: CaptureMode): Promise<void> {
		if (this.captureOpen) {
			new Notice("采集窗口已经打开");
			return;
		}
		this.captureOpen = true;
		try {
			const profile = await this.profileRepository.load(this.settings.profilePath);
			const submission = await new Promise<CaptureSubmission | null>((resolve) => {
				new CaptureModal(
					this.app,
					initialMode,
					this.settings.autoProcessText,
					profile.writeMode,
					resolve,
				).open();
			});
			if (!submission) return;

			if (submission.kind === "text") {
				const textPath = await this.saveTextCapture(submission.text, submission.sourceType);
				if (!submission.processWithAi) {
					new Notice(`✅ 文本原稿已保存\n📄 ${textPath}`, 6000);
					return;
				}
				this.enqueueJob({
					kind: "text",
					stage: "organizing",
					writeMode: submission.writeMode,
					sourceText: submission.text,
					sourceType: submission.sourceType,
					rawPath: textPath,
				});
				new Notice("文本已保存并加入处理队列，可以离开当前页面", 6000);
				return;
			}

			const audioPath = await this.saveAudio(submission.blob, submission.mimeType);
			this.enqueueJob({
				kind: "audio",
				stage: "transcribing",
				writeMode: submission.writeMode,
				sourcePath: audioPath,
				sourceType: "external-transcript",
				mimeType: submission.mimeType,
			});
			new Notice("录音已保存并加入处理队列，可以离开当前页面", 6000);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`❌ ${message}`, 8000);
			console.error(error);
		} finally {
			this.captureOpen = false;
		}
	}

	/**
	 * Organizes an editor selection and appends a managed draft to its note.
	 */
	private async processSelectedText(text: string, file: TFile): Promise<void> {
		try {
			const source: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.source;
			const sourceType: TextSourceType = source === "external-transcript"
				? "external-transcript"
				: "written";
			const profile = await this.profileRepository.load(this.settings.profilePath);
			this.enqueueJob({
				kind: "text",
				stage: "organizing",
				writeMode: profile.writeMode,
				sourceText: text,
				sourceType,
				rawPath: file.path,
			});
			new Notice("选中文本已加入处理队列，可以离开当前页面", 6000);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`❌ ${message}`, 8000);
		}
	}

	/**
	 * Persists a new job and starts the single-device worker.
	 */
	private enqueueJob(
		input: Pick<
			ProcessingJob,
			"kind" | "stage" | "writeMode" | "sourceType"
			| "sourcePath" | "sourceText" | "mimeType" | "rawPath"
		>,
	): ProcessingJob {
		const now = new Date().toISOString();
		const id = typeof crypto.randomUUID === "function"
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const job: ProcessingJob = {
			id,
			kind: input.kind,
			stage: input.stage,
			status: "pending",
			writeMode: input.writeMode,
			sourcePath: input.sourcePath,
			sourceText: input.sourceText,
			sourceType: input.sourceType,
			mimeType: input.mimeType,
			rawPath: input.rawPath,
			attempts: 0,
			createdAt: now,
			updatedAt: now,
		};
		this.jobRepository.upsert(job);
		void this.pumpJobs();
		return job;
	}

	/**
	 * Runs pending jobs sequentially and summarizes user-visible outcomes.
	 */
	private async pumpJobs(): Promise<void> {
		if (this.workerRunning) return;
		this.workerRunning = true;
		let completed = 0;
		let paused = 0;
		let failed = 0;
		let waitingReview = 0;
		try {
			while (true) {
				const next = this.jobRepository.list()
					.filter((job) => job.status === "pending")
					.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
				if (!next) break;
				const outcome = await this.runJob(next);
				if (outcome === "completed") completed += 1;
				else if (outcome === "paused") paused += 1;
				else if (outcome === "failed") failed += 1;
				else if (outcome === "waiting-review") waitingReview += 1;
			}
		} finally {
			this.workerRunning = false;
		}
		if (completed > 0) new Notice(`Knowledge Inbox 已完成 ${completed} 个任务`, 6000);
		if (waitingReview > 0) new Notice(`${waitingReview} 个任务等待确认，请打开处理任务`, 8000);
		if (paused > 0) new Notice(`${paused} 个任务已暂停，请检查 Key、网络或配置`, 8000);
		if (failed > 0) new Notice(`${failed} 个任务处理失败，可在处理任务中重试`, 8000);
	}

	/**
	 * Executes one job from its last persisted stage.
	 */
	private async runJob(
		initialJob: ProcessingJob,
	): Promise<"completed" | "paused" | "failed" | "waiting-review" | "cancelled"> {
		let job = this.jobRepository.update(initialJob.id, {
			status: "running",
			attempts: initialJob.attempts + 1,
			error: undefined,
		}) ?? initialJob;
		const statusEl = this.addStatusBarItem();

		try {
			if (job.kind === "audio" && ["queued", "transcribing"].includes(job.stage)) {
				if (!this.getSttApiKey()) {
					this.jobRepository.update(job.id, {
						status: "paused",
						error: "缺少语音转文字服务密钥",
					});
					return "paused";
				}
				if (!job.sourcePath) throw new Error("录音任务缺少源文件路径");
				const sourcePath = job.sourcePath;
				statusEl.setText("🎧 队列：语音转写...");
				if (!job.plannedRawPath) {
					const plannedRawPath = await this.planTranscriptionPath(new Date(job.createdAt));
					job = this.jobRepository.update(job.id, { plannedRawPath }) ?? job;
				}
				const audioBlob = await this.readAudioBlob(sourcePath, job.mimeType);
				const transcript = await this.callSTT(audioBlob);
				if (this.jobRepository.get(job.id)?.status === "cancelled") return "cancelled";
				if (!transcript || transcript.trim().length < 2) {
					throw new Error("未识别到语音内容");
				}
				const rawPath = await this.saveTranscription(
					transcript,
					sourcePath,
					job.plannedRawPath,
					new Date(job.createdAt),
				);
				if (this.jobRepository.get(job.id)?.status === "cancelled") return "cancelled";
				job = this.jobRepository.update(job.id, {
					stage: "organizing",
					status: "running",
					sourceText: transcript,
					rawPath,
				}) ?? job;
			}

			if (job.stage === "organizing") {
				if (!this.getAiApiKey()) {
					this.jobRepository.update(job.id, {
						status: "paused",
						error: "缺少 LLM API Secret",
					});
					return "paused";
				}
				if (!job.sourceText || !job.rawPath) {
					throw new Error("整理任务缺少原文或 raw 文件");
				}
				statusEl.setText("📝 队列：AI 整理...");
				const profile = await this.profileRepository.load(this.settings.profilePath);
				const artifact = await this.callStructuredAi(
					job.sourceText,
					job.sourceType,
					profile,
				);
				if (this.jobRepository.get(job.id)?.status === "cancelled") return "cancelled";
				await this.saveAiDraft(job.rawPath, artifact);
				if (this.jobRepository.get(job.id)?.status === "cancelled") return "cancelled";
				const route = resolveRoute(profile, artifact.categoryId);
				if (job.writeMode === "preview" || !route) {
					this.jobRepository.update(job.id, {
						stage: "waiting-review",
						status: "waiting-review",
						artifact,
						error: undefined,
					});
					return "waiting-review";
				}
				job = this.jobRepository.update(job.id, {
					stage: "writing",
					status: "running",
					artifact,
				}) ?? job;
			}

			if (job.stage === "writing") {
				if (this.jobRepository.get(job.id)?.status === "cancelled") return "cancelled";
				if (!job.rawPath || !job.artifact) {
					throw new Error("写入任务缺少 raw 文件或整理结果");
				}
				statusEl.setText("📚 队列：写入 wiki...");
				const profile = await this.profileRepository.load(this.settings.profilePath);
				const route = resolveRoute(profile, job.artifact.categoryId);
				if (!route) {
					this.jobRepository.update(job.id, {
						stage: "waiting-review",
						status: "waiting-review",
						error: "需要手动选择分类",
					});
					return "waiting-review";
				}
				const writeInput = {
					artifact: job.artifact,
					route,
					profile,
					sourceRawPath: job.rawPath,
					createdAt: new Date(job.createdAt),
				};
				if (!job.plannedWikiPath) {
					const plannedWikiPath = await this.wikiArtifactWriter.planPath(writeInput);
					job = this.jobRepository.update(job.id, { plannedWikiPath }) ?? job;
				}
				const wikiPath = await this.wikiArtifactWriter.write(
					writeInput,
					job.plannedWikiPath,
				);
				if (this.jobRepository.get(job.id)?.status === "cancelled") {
					this.jobRepository.update(job.id, { wikiPath });
					return "cancelled";
				}
				await this.maybeDeleteJobAudio(job, true);
				this.jobRepository.update(job.id, {
					stage: "completed",
					status: "completed",
					wikiPath,
					error: undefined,
				});
				return "completed";
			}

			throw new Error(`无法继续任务阶段：${job.stage}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.jobRepository.update(job.id, {
				status: "failed",
				error: message,
			});
			console.error("KnowledgeInbox job failed", error);
			return "failed";
		} finally {
			statusEl.remove();
		}
	}

	/**
	 * Reads an audio source from the vault for a queued STT request.
	 */
	private async readAudioBlob(sourcePath: string, mimeType?: string): Promise<Blob> {
		const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(sourceFile instanceof TFile)) throw new Error(`录音文件不存在：${sourcePath}`);
		const data = await this.app.vault.readBinary(sourceFile);
		return new Blob([data], { type: mimeType || this.mimeTypeForPath(sourcePath) });
	}

	/**
	 * Infers a browser MIME type from a vault audio path.
	 */
	private mimeTypeForPath(path: string): string {
		const extension = path.split(".").pop()?.toLowerCase();
		if (extension === "m4a" || extension === "mp4") return "audio/mp4";
		if (extension === "mp3") return "audio/mpeg";
		if (extension === "wav") return "audio/wav";
		if (extension === "ogg") return "audio/ogg";
		if (extension === "aac") return "audio/aac";
		if (extension === "flac") return "audio/flac";
		return "audio/webm";
	}

	/**
	 * Deletes source audio only after the final wiki artifact is committed.
	 */
	private async maybeDeleteJobAudio(job: ProcessingJob, committed: boolean): Promise<void> {
		if (
			job.kind !== "audio"
			|| !job.sourcePath
			|| !shouldDeleteSource({
				deleteEnabled: this.settings.deleteAfterProcess,
				expectedOutputs: 1,
				committedOutputs: committed ? 1 : 0,
			})
		) return;
		const file = this.app.vault.getAbstractFileByPath(job.sourcePath);
		if (file instanceof TFile) await this.app.fileManager.trashFile(file);
	}

	// ===== PROCESS INBOX (pre-recorded files) =====

	async processInbox(): Promise<void> {
		const folder = normalizePath(this.settings.inboxFolder);
		if (!(await this.app.vault.adapter.exists(folder))) {
			new Notice(`📂 文件夹「${this.settings.inboxFolder}」不存在\n💡 用 Obsidian 内置录音功能录一段试试`);
			return;
		}

		const list = await this.app.vault.adapter.list(folder);
		const files = list.files.filter(f => /\.(m4a|mp3|wav|ogg|webm|aac|flac)$/i.test(f));

		if (files.length === 0) {
			new Notice("📭 没有待处理的音频文件");
			return;
		}

		const profile = await this.profileRepository.load(this.settings.profilePath);
		const activeSources = new Set(
			this.jobRepository.list()
				.filter((job) => !["completed", "cancelled"].includes(job.status))
				.map((job) => job.sourcePath)
				.filter(Boolean),
		);
		let queued = 0;
		for (const sourcePath of files) {
			if (activeSources.has(sourcePath)) continue;
			this.enqueueJob({
				kind: "audio",
				stage: "transcribing",
				writeMode: profile.writeMode,
				sourcePath,
				sourceType: "external-transcript",
				mimeType: this.mimeTypeForPath(sourcePath),
			});
			queued += 1;
		}
		new Notice(
			queued > 0
				? `已将 ${queued} 个录音加入处理队列，可以离开当前页面`
				: "这些录音已经在处理队列中",
			6000,
		);
	}

	/**
	 * Opens the persistent task center.
	 */
	openTaskCenter(): void {
		new TaskCenterModal(this.app, {
			getJobs: () => this.jobRepository.list(),
			retry: (id) => this.retryJob(id),
			cancel: (id) => this.cancelJob(id),
			review: (id) => this.reviewJob(id),
			openPath: (path) => this.openVaultPath(path),
		}).open();
	}

	/**
	 * Requeues a paused or failed task from its last persisted stage.
	 */
	private retryJob(id: string): void {
		const current = this.jobRepository.get(id);
		if (!current) return;
		const returnToReview = current.stage === "waiting-review" && Boolean(current.artifact);
		const updated = this.jobRepository.update(id, {
			status: returnToReview ? "waiting-review" : "pending",
			error: undefined,
		});
		if (updated) {
			new Notice(returnToReview ? "任务已恢复为等待确认" : "任务已重新加入队列");
			if (!returnToReview) void this.pumpJobs();
		}
	}

	/**
	 * Cancels future work without deleting raw material.
	 */
	private cancelJob(id: string): void {
		const current = this.jobRepository.get(id);
		if (current?.stage === "writing") {
			new Notice("任务正在提交 wiki，当前阶段不能取消");
			return;
		}
		if (this.jobRepository.update(id, {
			status: "cancelled",
			error: "用户已取消；源文件和 raw 保留",
		})) {
			new Notice("任务已取消，源文件和 raw 已保留");
		}
	}

	/**
	 * Opens review for a persisted artifact and completes the job on approval.
	 */
	private async reviewJob(id: string): Promise<void> {
		if (this.reviewingJobs.has(id)) {
			new Notice("该任务的确认窗口已经打开");
			return;
		}
		const job = this.jobRepository.get(id);
		if (!job?.artifact || !job.rawPath) {
			new Notice("任务缺少可确认的整理结果");
			return;
		}
		this.reviewingJobs.add(id);
		try {
			const profile = await this.profileRepository.load(this.settings.profilePath);
			const decision = await new Promise<ArtifactPreviewDecision | null>((resolve) => {
				new ArtifactPreviewModal(this.app, job.artifact!, profile.routes, resolve).open();
			});
			if (!decision) return;
			const route = resolveRoute(profile, decision.routeId);
			if (!route) throw new Error("未找到有效的目标分类");
			let claimedJob = this.jobRepository.update(id, {
				stage: "writing",
				status: "running",
				artifact: decision.artifact,
				error: undefined,
			}) ?? job;
			const writeInput = {
				artifact: decision.artifact,
				route,
				profile,
				sourceRawPath: job.rawPath,
				createdAt: new Date(job.createdAt),
			};
			if (!claimedJob.plannedWikiPath) {
				const plannedWikiPath = await this.wikiArtifactWriter.planPath(writeInput);
				claimedJob = this.jobRepository.update(id, { plannedWikiPath }) ?? claimedJob;
			}
			const wikiPath = await this.wikiArtifactWriter.write(
				writeInput,
				claimedJob.plannedWikiPath,
			);
			if (this.jobRepository.get(id)?.status === "cancelled") {
				this.jobRepository.update(id, { wikiPath });
				return;
			}
			await this.maybeDeleteJobAudio(claimedJob, true);
			this.jobRepository.update(id, {
				stage: "completed",
				status: "completed",
				wikiPath,
				error: undefined,
			});
			const wikiFile = this.app.vault.getAbstractFileByPath(wikiPath);
			if (wikiFile instanceof TFile) {
				await this.app.workspace.getLeaf(false).openFile(wikiFile);
			}
			new Notice(`✅ 已写入 wiki\n📄 ${wikiPath}`, 6000);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.jobRepository.update(id, {
				status: "failed",
				error: message,
			});
			new Notice(`写入失败：${message}`, 8000);
		} finally {
			this.reviewingJobs.delete(id);
		}
	}

	/**
	 * Opens a persisted source, raw note, or final wiki file.
	 */
	private async openVaultPath(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice(`文件不存在：${path}`);
			return;
		}
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	// ===== API CALLS =====

	private async ensureFolder(dir: string): Promise<void> {
		// Split path and create each level to work around mobile recursive folder issues
		const parts = dir.split("/").filter(p => p.length > 0);
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!(await this.app.vault.adapter.exists(current))) {
				await this.app.vault.createFolder(current);
			}
		}
	}

	/**
	 * Saves a text capture before any future AI processing.
	 */
	private async saveTextCapture(text: string, sourceType: TextSourceType): Promise<string> {
		const directory = normalizePath(this.settings.textInputFolder);
		await this.ensureFolder(directory);
		const now = new Date();
		const stem = sanitizeFileNamePart(`${fmtDate(now)} 文本-${fmtTime(now)}`);
		const adapter = this.app.vault.adapter;
		const path = normalizePath(await resolveUniqueMarkdownPath({
			directory,
			stem,
			suffix: now.getTime().toString(),
			exists: (candidate) => adapter.exists(candidate),
		}));
		const fallbackContent = renderDefaultRawTextTemplate({
			createdAt: now,
			title: stem,
			sourceType,
			text,
		});
		const content = await this.renderSelectedTemplate(
			this.settings.textTemplatePath,
			["{{rawText}}", "{{text}}"],
			{
				title: stem,
				createdAt: now,
				variables: {
					rawText: text,
					text,
					sourceType,
					created: now.toISOString(),
				},
			},
			fallbackContent,
			`## 原始文本\n\n${text}`,
		);

		await adapter.write(path, content);
		return path;
	}

	/**
	 * Saves an STT result before any LLM request.
	 */
	private async planTranscriptionPath(createdAt = new Date()): Promise<string> {
		const directory = normalizePath(this.settings.transcriptionFolder);
		await this.ensureFolder(directory);
		const stem = sanitizeFileNamePart(`${fmtDate(createdAt)} 转写-${fmtTime(createdAt)}`);
		const adapter = this.app.vault.adapter;
		return normalizePath(await resolveUniqueMarkdownPath({
			directory,
			stem,
			suffix: createdAt.getTime().toString(),
			exists: (candidate) => adapter.exists(candidate),
		}));
	}

	/**
	 * Saves an STT result at a persisted path so restart retries are idempotent.
	 */
	private async saveTranscription(
		transcript: string,
		audioPath: string,
		plannedPath?: string,
		createdAt = new Date(),
	): Promise<string> {
		const path = plannedPath ?? await this.planTranscriptionPath(createdAt);
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) return path;
		const stem = path.split("/").pop()?.replace(/\.md$/i, "")
			?? sanitizeFileNamePart(`${fmtDate(createdAt)} 转写-${fmtTime(createdAt)}`);
		const fallbackContent = renderDefaultTranscriptionTemplate({
			createdAt,
			title: stem,
			audioPath,
			transcript,
		});
		const content = await this.renderSelectedTemplate(
			this.settings.transcriptionTemplatePath,
			["{{transcript}}"],
			{
				title: stem,
				createdAt,
				variables: {
					transcript,
					sourceAudio: `![[${audioPath}]]`,
					sourceAudioPath: audioPath,
					created: createdAt.toISOString(),
				},
			},
			fallbackContent,
			`## 原始转写\n\n${transcript}`,
		);

		await this.app.vault.adapter.write(path, content);
		return path;
	}

	/**
	 * Reads and renders a selected vault template, or returns the fallback.
	 */
	private async renderSelectedTemplate(
		templatePath: string,
		insertionTokens: string[],
		context: Parameters<typeof renderTemplate>[1],
		fallback: string,
		appendWhenMissing: string,
	): Promise<string> {
		if (!templatePath.trim()) return fallback;

		const normalizedPath = normalizePath(templatePath.trim());
		const templateFile = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (!(templateFile instanceof TFile)) {
			throw new Error(`模板不存在：${normalizedPath}`);
		}
		const template = await this.app.vault.cachedRead(templateFile);
		const rendered = renderTemplate(template, context);
		if (insertionTokens.some((token) => template.includes(token))) return rendered;
		return `${rendered.replace(/\s+$/, "")}\n\n${appendWhenMissing}\n`;
	}

	/**
	 * Saves audio using an extension compatible with the recorded MIME type.
	 */
	private async saveAudio(blob: Blob, mimeType = blob.type): Promise<string> {
		const dir = normalizePath(this.settings.inboxFolder);
		await this.ensureFolder(dir);
		const now = new Date();
		const extension = this.audioExtension(mimeType);
		const fn = `录音-${fmtDate(now)}-${fmtTime(now)}.${extension}`;
		const fp = normalizePath(`${dir}/${fn}`);
		await this.app.vault.createBinary(fp, await blob.arrayBuffer());
		return fp;
	}

	/**
	 * Maps a browser MediaRecorder MIME type to a portable file extension.
	 */
	private audioExtension(mimeType: string): string {
		if (mimeType.includes("mp4")) return "m4a";
		if (mimeType.includes("aac")) return "aac";
		if (mimeType.includes("mpeg")) return "mp3";
		if (mimeType.includes("ogg")) return "ogg";
		if (mimeType.includes("wav")) return "wav";
		if (mimeType.includes("flac")) return "flac";
		return "webm";
	}

	private async callSTT(audioBlob: Blob): Promise<string> {
		// Convert to WAV if needed (SenseVoiceSmall works best with PCM WAV)
		let finalBlob = audioBlob;
		let finalExt = "webm";
		let finalMime = audioBlob.type || "audio/webm";

		if (!audioBlob.type.includes("wav") && !audioBlob.type.includes("mpeg")) {
			try {
				finalBlob = await this.convertToWav(audioBlob);
				finalExt = "wav";
				finalMime = "audio/wav";
			} catch (e) {
				console.warn("KnowledgeInbox: WAV conversion failed, sending original format", e);
			}
		}

		// Manual multipart body (requestUrl compatible, works on mobile)
		const boundary = "----AiInbox" + Math.random().toString(36).slice(2);
		const enc = new TextEncoder();
		const buf = await finalBlob.arrayBuffer();

		const parts: Uint8Array[] = [];
		const line = (s: string) => parts.push(enc.encode(s));
		line(`--${boundary}\r\n`);
		line(`Content-Disposition: form-data; name="file"; filename="audio.${finalExt}"\r\n`);
		line(`Content-Type: ${finalMime}\r\n\r\n`);
		parts.push(new Uint8Array(buf));
		line(`\r\n--${boundary}\r\n`);
		line(`Content-Disposition: form-data; name="model"\r\n\r\n`);
		line(`${this.settings.sttModel}\r\n`);
		if (this.settings.sttLanguage) {
			line(`--${boundary}\r\n`);
			line(`Content-Disposition: form-data; name="language"\r\n\r\n`);
			line(`${this.settings.sttLanguage}\r\n`);
		}
		line(`--${boundary}\r\n`);
		line(`Content-Disposition: form-data; name="response_format"\r\n\r\n`);
		line(`text\r\n`);
		line(`--${boundary}--\r\n`);

		const total = parts.reduce((s, p) => s + p.length, 0);
		const body = new Uint8Array(total);
		let off = 0;
		for (const p of parts) { body.set(p, off); off += p.length; }


		const resp = await requestUrl({
			url: this.settings.sttApiUrl,
			method: "POST",
			headers: {
				"Authorization": `Bearer ${this.getSttApiKey()}`,
				"Content-Type": `multipart/form-data; boundary=${boundary}`,
			},
			body: body.buffer,
		});


		if (resp.status !== 200) {
			const errStr: string = resp.text || (resp.json ? JSON.stringify(resp.json) : "");
			console.error("KnowledgeInbox: STT error response:", errStr);
			if (errStr.includes("balance") || errStr.includes("30001") || errStr.includes("4032")) {
				throw new Error("语音转文字服务余额不足或无调用额度，请前往当前服务商控制台检查");
			}
			if (errStr.includes("invalid") || errStr.includes("Api key") || errStr.includes("401")) {
				throw new Error("语音转文字服务密钥无效，请检查设置");
			}
			if (errStr.includes("20015") || errStr.includes("format") || errStr.includes("decode")) {
				throw new Error("录音格式不兼容，请尝试更短的录音或更换格式");
			}
			throw new Error(`语音转文字失败 (${resp.status}): ${errStr.substring(0, 100)}`);
		}

		// Providers may ignore response_format=text and still return {"text":"..."}.
		const result = parseSttResponse(resp.json, resp.text || "");
		return result;
	}

	private async convertToWav(blob: Blob): Promise<Blob> {
		const win = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
		const AudioCtx = win.AudioContext || win.webkitAudioContext;
		if (!AudioCtx) throw new Error("AudioContext not supported");
		const ctx = new AudioCtx({ sampleRate: 16000 });
		if (ctx.state === "suspended") await ctx.resume();
		const audioBuf = await ctx.decodeAudioData(await blob.arrayBuffer());
		await ctx.close();

		// Encode as 16-bit PCM WAV (mono, 16000Hz)
		const numChannels = Math.min(audioBuf.numberOfChannels, 1);
		const sampleRate = audioBuf.sampleRate;
		const length = audioBuf.length;
		const channelData = audioBuf.getChannelData(0);

		const wavBuf = new ArrayBuffer(44 + length * 2);
		const view = new DataView(wavBuf);
		const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
		writeStr(0, "RIFF");
		view.setUint32(4, 36 + length * 2, true);
		writeStr(8, "WAVE");
		writeStr(12, "fmt ");
		view.setUint32(16, 16, true);
		view.setUint16(20, 1, true);
		view.setUint16(22, numChannels, true);
		view.setUint32(24, sampleRate, true);
		view.setUint32(28, sampleRate * numChannels * 2, true);
		view.setUint16(32, numChannels * 2, true);
		view.setUint16(34, 16, true);
		writeStr(36, "data");
		view.setUint32(40, length * 2, true);

		for (let i = 0; i < length; i++) {
			const sample = Math.max(-1, Math.min(1, channelData[i]));
			view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
		}

		return new Blob([wavBuf], { type: "audio/wav" });
	}

	/**
	 * Organizes text into a validated Knowledge Inbox artifact.
	 */
	private async callStructuredAi(
		text: string,
		sourceType: TextSourceType,
		profile?: VaultProfile,
	): Promise<KnowledgeArtifact> {
		const activeProfile = profile ?? await this.profileRepository.load(this.settings.profilePath);
		const prompt = await this.promptResolver.resolve(activeProfile, sourceType);
		const response = await this.callLlm(prompt, text);
		const artifact = parseKnowledgeArtifact(response);
		if (artifact.categoryId && !resolveRoute(activeProfile, artifact.categoryId)) {
			return {
				...artifact,
				categoryId: null,
				uncertainties: [
					...artifact.uncertainties,
					`AI 返回了未配置的分类：${artifact.categoryId}`,
				],
			};
		}
		return artifact;
	}

	/**
	 * Calls the configured OpenAI-compatible chat completion endpoint.
	 */
	private async callLlm(systemPrompt: string, text: string): Promise<string> {
		const resp = await requestUrl({
			url: this.settings.aiApiUrl,
			method: "POST",
			headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.getAiApiKey()}` },
			body: JSON.stringify({
				model: this.settings.aiModel,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: text },
				],
				temperature: 0.3, max_tokens: 3000,
			}),
		});
		if (resp.status !== 200) throw new Error(`AI (${resp.status})`);
		const json = resp.json as { choices?: Array<{ message?: { content?: string } }> };
		const content = json.choices?.[0]?.message?.content?.trim() ?? "";
		if (!content) throw new Error("AI 返回了空结果");
		return content;
	}

	/**
	 * Writes or replaces a managed AI draft in a raw note.
	 */
	private async saveAiDraft(rawPath: string, artifact: KnowledgeArtifact): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(rawPath);
		if (!(file instanceof TFile)) throw new Error(`原稿不存在：${rawPath}`);
		const note = await this.app.vault.read(file);
		await this.app.vault.modify(file, upsertAiDraft(note, artifact));
	}

	/**
	 * Opens the cross-platform graphical vault profile editor.
	 */
	async openProfile(): Promise<void> {
		try {
			const profile = await this.profileRepository.load(this.settings.profilePath);
			new ProfileSettingsModal(
				this.app,
				profile,
				async (updatedProfile) => {
					const path = await this.profileRepository.save(
						this.settings.profilePath,
						updatedProfile,
					);
					new Notice(`✅ 配置已保存\n📄 ${path}`, 6000);
				},
				(promptText) => this.extractCategoriesFromPrompt(promptText),
			).open();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`❌ ${message}`, 8000);
		}
	}

	/**
	 * Uses the configured LLM once to convert a vault prompt into route cards.
	 */
	private async extractCategoriesFromPrompt(promptText: string): Promise<CategoryRoute[]> {
		if (!this.getAiApiKey()) throw new Error("请先在插件设置中选择 LLM API Secret");
		const response = await this.callLlm(CATEGORY_IMPORT_PROMPT, promptText);
		return parseCategoryImport(response);
	}

	/**
	 * Shows the built-in raw text note layout.
	 */
	showDefaultTextTemplate(): void {
		const preview = renderDefaultRawTextTemplate({
			createdAt: new Date(),
			title: "示例文本原稿",
			sourceType: "written",
			text: "这里会完整保留用户输入或粘贴的原始文本。",
		});
		new ContentPreviewModal(this.app, "系统默认：文本原稿样式", preview).open();
	}

	/**
	 * Shows the built-in transcription note layout.
	 */
	showDefaultTranscriptionTemplate(): void {
		const preview = renderDefaultTranscriptionTemplate({
			createdAt: new Date(),
			title: "示例语音转写",
			audioPath: "raw/audio/示例录音.m4a",
			transcript: "这里会完整保留语音识别得到的原始转写。",
		});
		new ContentPreviewModal(this.app, "系统默认：语音转写样式", preview).open();
	}

	onunload() {
		if (this.fabEl) this.fabEl.remove();
	}
}

// ==================== SETTINGS TAB ====================

/** Knowledge Inbox settings tab. */
class KnowledgeInboxSettingTab extends PluginSettingTab {
	plugin: KnowledgeInboxPlugin;
	constructor(app: App, plugin: KnowledgeInboxPlugin) { super(app, plugin); this.plugin = plugin; }

	getSettingDefinitions(): { id: string; name: string; desc: string; type: string }[] {
		return [
			{
				id: "inboxFolder",
				name: "录音文件夹",
				desc: "录音文件保存的位置",
				type: "text",
			},
			{
				id: "textInputFolder",
				name: "文本输入文件夹",
				desc: "原始文本笔记保存的位置",
				type: "text",
			},
			{
				id: "transcriptionFolder",
				name: "语音转写文件夹",
				desc: "语音转写笔记保存的位置",
				type: "text",
			},
			{
				id: "autoProcessText",
				name: "自动整理文本",
				desc: "文本采集后是否自动调用 AI 整理",
				type: "toggle",
			},
			{
				id: "deleteAfterProcess",
				name: "处理后删除录音文件",
				desc: "处理成功后将原音频移入回收站",
				type: "toggle",
			},
		];
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("knowledge-inbox-settings");

		new Setting(containerEl).setName("设置").setHeading();
		new Setting(containerEl)
			.setName("处理任务")
			.setDesc("查看等待、处理中、待确认、暂停和失败任务。")
			.addButton(button => button
				.setButtonText("打开任务中心")
				.onClick(() => this.plugin.openTaskCenter()));

		// Speech-to-text
		new Setting(containerEl)
			.setName("语音转文字服务")
			.setDesc("服务地址、模型和 Secret 都可以更改。SiliconFlow + SenseVoiceSmall 只是默认预设，不是唯一服务商。")
			.setHeading();

		new Setting(containerEl)
			.setName("语音转文字服务密钥")
			.setDesc("选择或新建当前语音转文字服务使用的密钥。每台设备需单独配置。")
			.addComponent((element) => new SecretComponent(this.app, element)
				.setValue(this.plugin.settings.sttSecretId)
				.onChange(async (value) => {
					this.plugin.settings.sttSecretId = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl).setName("语音转文字服务地址").setDesc("可填写任何兼容当前转写请求格式的服务地址。").addText(t =>
			t.setValue(this.plugin.settings.sttApiUrl).onChange(async v => { this.plugin.settings.sttApiUrl = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName("语音识别模型名称").setDesc("默认预设为 FunAudioLLM/SenseVoiceSmall，可按服务商文档修改。").addText(t =>
			t.setValue(this.plugin.settings.sttModel).onChange(async v => { this.plugin.settings.sttModel = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName("语言提示").setDesc("例如 zh、en；具体可用值由当前语音转文字服务决定。").addText(t =>
			t.setValue(this.plugin.settings.sttLanguage).onChange(async v => { this.plugin.settings.sttLanguage = v; await this.plugin.saveSettings(); }));

		// AI organization
		new Setting(containerEl)
			.setName("AI 整理服务")
			.setDesc("服务地址、模型和 Secret 都可以更改。DeepSeek 只是默认预设，也可使用其他兼容服务。")
			.setHeading();
		new Setting(containerEl)
			.setName("AI 整理服务密钥")
			.setDesc("选择或新建当前 AI 整理服务使用的密钥。每台设备需单独配置。")
			.addComponent((element) => new SecretComponent(this.app, element)
				.setValue(this.plugin.settings.aiSecretId)
				.onChange(async (value) => {
					this.plugin.settings.aiSecretId = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl).setName("AI 整理服务地址").setDesc("可填写任何兼容当前 AI 对话请求格式的服务地址。").addText(t =>
			t.setValue(this.plugin.settings.aiApiUrl).onChange(async v => { this.plugin.settings.aiApiUrl = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName("AI 模型名称").setDesc("默认预设为 deepseek-chat，可按服务商文档修改。").addText(t =>
			t.setValue(this.plugin.settings.aiModel).onChange(async v => { this.plugin.settings.aiModel = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl)
			.setName("文本保存后自动整理")
			.setDesc("默认开启。采集窗口中仍可针对单次输入临时关闭。")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoProcessText)
				.onChange(async value => {
					this.plugin.settings.autoProcessText = value;
					await this.plugin.saveSettings();
				}));

		// Vault profile
		new Setting(containerEl).setName("整理与分类").setHeading();
		new Setting(containerEl)
			.setName("整理规则、分类和输出样式")
			.setDesc("打开设置向导，选择提示词来源、管理笔记分类、保存目录和输出样式。首次保存时会自动创建配置，不需要手动生成文件。")
			.addButton(button => button
				.setButtonText("打开设置向导")
				.setCta()
				.onClick(() => void this.plugin.openProfile()));
		new Setting(containerEl)
			.setName("高级：规则配置保存位置")
			.setDesc("一般无需修改。这是插件在 vault 内保存整理规则的内部配置文件，可随同步工具跨设备同步。")
			.addText(text => text
				.setValue(this.plugin.settings.profilePath)
				.onChange(async value => {
					this.plugin.settings.profilePath = value;
					await this.plugin.saveSettings();
				}));

		// Output
		new Setting(containerEl).setName("输出").setHeading();
		new Setting(containerEl).setName("录音保存目录").addText(t =>
			t.setValue(this.plugin.settings.inboxFolder).onChange(async v => { this.plugin.settings.inboxFolder = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName("文本原稿目录").setDesc("直接输入或粘贴的原始文本保存位置。").addText(t =>
			t.setValue(this.plugin.settings.textInputFolder).onChange(async v => { this.plugin.settings.textInputFolder = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName("转写结果目录").setDesc("语音转写在 AI 整理前保存到此目录。").addText(t =>
			t.setValue(this.plugin.settings.transcriptionFolder).onChange(async v => { this.plugin.settings.transcriptionFolder = v; await this.plugin.saveSettings(); }));
		const textTemplateSetting = new Setting(containerEl)
			.setName("文本原稿的笔记样式（可选）")
			.setDesc("留空时使用系统默认样式。也可以选择 vault 中的一篇模板笔记；如果模板没有指定原文位置，插件会把原文自动追加到末尾。");
		textTemplateSetting.addText(t =>
			t.setValue(this.plugin.settings.textTemplatePath).onChange(async v => {
				this.plugin.settings.textTemplatePath = v;
				await this.plugin.saveSettings();
			}));
		textTemplateSetting.addButton(button => button.setButtonText("选择样式").onClick(() => {
			new VaultMarkdownFileSuggest(this.app, (file) => {
				this.plugin.settings.textTemplatePath = file.path;
				const input = textTemplateSetting.controlEl.querySelector("input");
				if (input) input.value = file.path;
				void this.plugin.saveSettings();
			}).open();
		}));
		textTemplateSetting.addButton(button => button.setButtonText("查看默认样式").onClick(() => {
			this.plugin.showDefaultTextTemplate();
		}));
		const transcriptionTemplateSetting = new Setting(containerEl)
			.setName("语音转写的笔记样式（可选）")
			.setDesc("留空时使用系统默认样式。也可以选择 vault 中的一篇模板笔记；如果模板没有指定转写位置，插件会把转写自动追加到末尾。");
		transcriptionTemplateSetting.addText(t =>
			t.setValue(this.plugin.settings.transcriptionTemplatePath).onChange(async v => {
				this.plugin.settings.transcriptionTemplatePath = v;
				await this.plugin.saveSettings();
			}));
		transcriptionTemplateSetting.addButton(button => button.setButtonText("选择样式").onClick(() => {
			new VaultMarkdownFileSuggest(this.app, (file) => {
				this.plugin.settings.transcriptionTemplatePath = file.path;
				const input = transcriptionTemplateSetting.controlEl.querySelector("input");
				if (input) input.value = file.path;
				void this.plugin.saveSettings();
			}).open();
		}));
		transcriptionTemplateSetting.addButton(button => button.setButtonText("查看默认样式").onClick(() => {
			this.plugin.showDefaultTranscriptionTemplate();
		}));
		new Setting(containerEl).setName("处理后删除录音文件").setDesc("默认关闭。开启后仅在全部目标笔记写入成功时将原音频移入回收站。").addToggle(t =>
			t.setValue(this.plugin.settings.deleteAfterProcess).onChange(async v => { this.plugin.settings.deleteAfterProcess = v; await this.plugin.saveSettings(); }));
	}
}

function pad(n: number): string { const s: string = n.toString(); return s.length < 2 ? "0" + s : s; }
function fmtDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fmtTime(d: Date) { return `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`; }
