import { App, Modal, Notice } from "obsidian";
import type {
	CaptureMode,
	CaptureSubmission,
	TextSourceType,
} from "../domain/capture";
import type { WriteMode } from "../domain/vault-profile";

const SUPPORTED_AUDIO_EXTENSIONS = ["m4a", "mp3", "wav", "ogg", "webm", "aac", "flac"];
const RECOMMENDED_AUDIO_EXTENSIONS = ["m4a", "mp3", "wav"];
const MAX_AUDIO_FILE_BYTES = 50 * 1024 * 1024;

const AUDIO_MIME_BY_EXTENSION: Record<string, string> = {
	m4a: "audio/mp4",
	mp3: "audio/mpeg",
	wav: "audio/wav",
	ogg: "audio/ogg",
	webm: "audio/webm",
	aac: "audio/aac",
	flac: "audio/flac",
};

/**
 * Unified cross-platform capture window for audio and pasted text.
 */
export class CaptureModal extends Modal {
	private mode: CaptureMode;
	private readonly resolveSubmission: (submission: CaptureSubmission | null) => void;
	private readonly defaultAutoProcessText: boolean;
	private writeMode: WriteMode;
	private panelEl: HTMLElement | null = null;
	private stream: MediaStream | null = null;
	private mediaRecorder: MediaRecorder | null = null;
	private audioChunks: Blob[] = [];
	private timerId: number | null = null;
	private startedAt = 0;
	private mimeType = "";
	private settled = false;
	private submitRecording = false;

	constructor(
		app: App,
		initialMode: CaptureMode,
		defaultAutoProcessText: boolean,
		defaultWriteMode: WriteMode,
		resolveSubmission: (submission: CaptureSubmission | null) => void,
	) {
		super(app);
		this.mode = initialMode;
		this.defaultAutoProcessText = defaultAutoProcessText;
		this.writeMode = defaultWriteMode;
		this.resolveSubmission = resolveSubmission;
	}

	onOpen(): void {
		this.modalEl.addClass("knowledge-inbox-modal-shell");
		this.contentEl.empty();
		this.contentEl.addClass("knowledge-inbox-capture-modal");
		this.contentEl.createEl("h2", { text: "Knowledge Inbox" });

		const tabs = this.contentEl.createDiv({ cls: "knowledge-inbox-capture-tabs" });
		this.createTab(tabs, "audio", "录音");
		this.createTab(tabs, "text", "文本");
		const writeModeRow = this.contentEl.createDiv({
			cls: "knowledge-inbox-write-mode",
		});
		writeModeRow.createEl("label", { text: "wiki 写入方式" });
		const writeModeSelect = writeModeRow.createEl("select", {
			cls: "dropdown",
		}) as HTMLSelectElement;
		writeModeSelect.createEl("option", { text: "先预览确认", attr: { value: "preview" } });
		writeModeSelect.createEl("option", { text: "自动写入", attr: { value: "auto" } });
		writeModeSelect.value = this.writeMode;
		writeModeSelect.addEventListener("change", () => {
			this.writeMode = writeModeSelect.value as WriteMode;
		});

		this.panelEl = this.contentEl.createDiv({ cls: "knowledge-inbox-capture-panel" });
		this.renderPanel();
	}

	onClose(): void {
		this.stopTimer();
		this.stopTracks();
		if (this.mediaRecorder?.state === "recording") {
			this.mediaRecorder.stop();
		}
		if (!this.settled) {
			this.settled = true;
			this.resolveSubmission(null);
		}
	}

	/**
	 * Creates a mode tab and prevents switching away during recording.
	 */
	private createTab(container: HTMLElement, mode: CaptureMode, label: string): void {
		const button = container.createEl("button", {
			text: label,
			cls: mode === this.mode ? "is-active" : "",
		});
		button.addEventListener("click", () => {
			if (this.mediaRecorder?.state === "recording") {
				new Notice("请先停止当前录音");
				return;
			}
			this.mode = mode;
			container.querySelectorAll("button").forEach((tab) => tab.removeClass("is-active"));
			button.addClass("is-active");
			this.renderPanel();
		});
	}

	/**
	 * Renders the active capture mode.
	 */
	private renderPanel(): void {
		if (!this.panelEl) return;
		this.panelEl.empty();
		if (this.mode === "audio") this.renderAudioPanel(this.panelEl);
		else this.renderTextPanel(this.panelEl);
	}

	/**
	 * Renders audio controls without starting the microphone automatically.
	 */
	private renderAudioPanel(container: HTMLElement): void {
		const status = container.createDiv({
			cls: "knowledge-inbox-recording-status",
			text: "准备录音",
		});
		const timer = container.createDiv({
			cls: "knowledge-inbox-recording-timer",
			text: "00:00",
		});
		const controls = container.createDiv({ cls: "knowledge-inbox-capture-actions" });
		const startButton = controls.createEl("button", {
			text: "开始录音",
			cls: "mod-cta",
		});
		const uploadButton = controls.createEl("button", {
			text: "上传录音",
		});
		const stopButton = controls.createEl("button", {
			text: "停止并处理",
		});
		stopButton.disabled = true;
		const fileInput = container.createEl("input", {
			attr: {
				type: "file",
				accept: SUPPORTED_AUDIO_EXTENSIONS.map((extension) => `.${extension}`).join(","),
			},
		}) as HTMLInputElement;
		fileInput.addClass("knowledge-inbox-audio-file-input");
		container.createEl("p", {
			text: "推荐：M4A、MP3、WAV。当前插件上传上限为 50MB；服务商的时长与格式限制请以其文档为准。兼容尝试：OGG、WEBM、AAC、FLAC。",
			cls: "setting-item-description knowledge-inbox-format-hint",
		});

		startButton.addEventListener("click", () => {
			void this.startRecording(status, timer, startButton, uploadButton, stopButton);
		});
		uploadButton.addEventListener("click", () => fileInput.click());
		fileInput.addEventListener("change", () => {
			const file = fileInput.files?.[0];
			if (!file) return;
			const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
			if (!SUPPORTED_AUDIO_EXTENSIONS.includes(extension)) {
				new Notice(`不支持的录音格式：${extension || "未知"}`);
				fileInput.value = "";
				return;
			}
			if (file.size > MAX_AUDIO_FILE_BYTES) {
				new Notice("录音文件超过插件当前的 50MB 上传上限", 8000);
				fileInput.value = "";
				return;
			}
			if (!RECOMMENDED_AUDIO_EXTENSIONS.includes(extension)) {
				new Notice(
					`${extension.toUpperCase()} 将先尝试在本机转成 WAV；是否成功取决于当前设备的解码能力`,
					8000,
				);
			}
			this.settle({
				kind: "audio",
				blob: file,
				mimeType: file.type || AUDIO_MIME_BY_EXTENSION[extension] || "application/octet-stream",
				writeMode: this.writeMode,
			});
		});
		stopButton.addEventListener("click", () => {
			if (this.mediaRecorder?.state !== "recording") return;
			this.submitRecording = true;
			stopButton.disabled = true;
			status.setText("正在保存录音…");
			this.mediaRecorder.stop();
		});
	}

	/**
	 * Renders text source selection and a large paste-friendly editor.
	 */
	private renderTextPanel(container: HTMLElement): void {
		container.createEl("label", {
			text: "文本来源",
			cls: "knowledge-inbox-field-label",
		});
		const sourceSelect = container.createEl("select", {
			cls: "dropdown knowledge-inbox-source-select",
		}) as HTMLSelectElement;
		sourceSelect.createEl("option", { text: "书面文本", attr: { value: "written" } });
		sourceSelect.createEl("option", { text: "外部语音转写", attr: { value: "external-transcript" } });

		container.createEl("label", {
			text: "原始文本",
			cls: "knowledge-inbox-field-label",
		});
		const textarea = container.createEl("textarea", {
			cls: "knowledge-inbox-text-input",
			attr: {
				placeholder: "在这里输入或粘贴文本…",
				rows: "12",
			},
		});
		const processLabel = container.createEl("label", {
			cls: "knowledge-inbox-process-toggle",
		});
		const processCheckbox = processLabel.createEl("input", {
			attr: { type: "checkbox" },
		}) as HTMLInputElement;
		processCheckbox.checked = this.defaultAutoProcessText;
		processLabel.appendText(" 保存后自动整理");

		const actions = container.createDiv({ cls: "knowledge-inbox-capture-actions" });
		const submitButton = actions.createEl("button", {
			text: "保存原稿",
			cls: "mod-cta",
		});
		submitButton.addEventListener("click", () => {
			const text = textarea.value.trim();
			if (!text) {
				new Notice("请输入或粘贴文本");
				textarea.focus();
				return;
			}
			this.settle({
				kind: "text",
				text,
				sourceType: sourceSelect.value as TextSourceType,
				processWithAi: processCheckbox.checked,
				writeMode: this.writeMode,
			});
		});

		window.setTimeout(() => textarea.focus(), 0);
	}

	/**
	 * Requests microphone access and starts a supported MediaRecorder format.
	 */
	private async startRecording(
		status: HTMLElement,
		timer: HTMLElement,
		startButton: HTMLButtonElement,
		uploadButton: HTMLButtonElement,
		stopButton: HTMLButtonElement,
	): Promise<void> {
		try {
			this.stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
					channelCount: 1,
				},
			});
			const candidates = [
				"audio/webm;codecs=opus",
				"audio/mp4",
				"audio/webm",
				"audio/ogg;codecs=opus",
			];
			const preferredType = candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
			this.mediaRecorder = preferredType
				? new MediaRecorder(this.stream, { mimeType: preferredType, audioBitsPerSecond: 64000 })
				: new MediaRecorder(this.stream);
			this.mimeType = this.mediaRecorder.mimeType || preferredType || "audio/webm";
			this.audioChunks = [];
			this.submitRecording = false;

			this.mediaRecorder.addEventListener("dataavailable", (event) => {
				if (event.data.size > 0) this.audioChunks.push(event.data);
			});
			this.mediaRecorder.addEventListener("stop", () => {
				this.stopTimer();
				this.stopTracks();
				if (!this.submitRecording || this.settled) return;
				const blob = new Blob(this.audioChunks, { type: this.mimeType });
				this.settle({
					kind: "audio",
					blob,
					mimeType: this.mimeType,
					writeMode: this.writeMode,
				});
			}, { once: true });

			this.mediaRecorder.start(250);
			this.startedAt = Date.now();
			status.setText("录音中…");
			startButton.disabled = true;
			uploadButton.disabled = true;
			stopButton.disabled = false;
			this.timerId = window.setInterval(() => {
				const elapsedSeconds = Math.floor((Date.now() - this.startedAt) / 1000);
				const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
				const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");
				timer.setText(`${minutes}:${seconds}`);
			}, 500);
		} catch (error) {
			this.stopTracks();
			const message = error instanceof Error ? error.message : String(error);
			status.setText("无法使用麦克风");
			uploadButton.disabled = false;
			new Notice(`无法开始录音：${message}`, 8000);
		}
	}

	/**
	 * Resolves the modal once and closes it without triggering cancellation.
	 */
	private settle(submission: CaptureSubmission): void {
		if (this.settled) return;
		this.settled = true;
		this.resolveSubmission(submission);
		this.close();
	}

	/**
	 * Stops and clears the recording timer.
	 */
	private stopTimer(): void {
		if (this.timerId !== null) {
			window.clearInterval(this.timerId);
			this.timerId = null;
		}
	}

	/**
	 * Releases all active microphone tracks.
	 */
	private stopTracks(): void {
		this.stream?.getTracks().forEach((track) => track.stop());
		this.stream = null;
	}
}
