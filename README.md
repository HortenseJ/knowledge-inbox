# Knowledge Inbox / 知识收件箱

Knowledge Inbox is an Obsidian plugin for capturing voice or text, preserving
the original material, organizing it with user-configured AI services, and
routing structured notes to configurable folders in a vault.

知识收件箱是 Obsidian 插件，用于捕捉语音或文本、保留原始材料、通过用户配置的 AI 服务整理内容，并将结构化笔记路由到 vault 中可配置的文件夹。

The project is in early development. Version `0.1.0` currently preserves the
Audio Inbox baseline behavior while the new capture and knowledge-flow
architecture is introduced incrementally.

---

## English

### Planned workflow

1. Capture or import audio, or paste text.
2. Save original material before any network request.
3. Transcribe audio with a user-configured STT API.
4. Organize and classify content with a user-configured LLM API.
5. Preview or automatically write a structured note using vault templates and folder mappings.

### Current foundation

- Unified audio and text capture window.
- Text source selection: written text or external transcript.
- Raw text output defaults to `raw/text/`.
- STT output is saved to `raw/transcription/` before any LLM request.
- Source audio is kept by default.
- Raw text and transcription folders are configurable.
- Users can select Markdown templates from the vault.
- Written text and external transcripts use different default organization rules.
- Text can be organized automatically after capture or manually with the `Organize selected text` command.
- LLM responses are parsed as validated JSON before a managed AI draft is appended to the raw note.
- Reprocessing replaces only the managed draft block and preserves the raw source and all other user content.

For imported audio, M4A, MP3, and WAV are the recommended formats. OGG, WEBM, AAC, and FLAC are compatibility attempts: Knowledge Inbox first asks the current device to decode and convert them to WAV, so results can differ across Android, iPhone, macOS, and Windows. The plugin currently caps uploads at 50MB; provider-specific duration and format limits depend on the configured STT service.

STT and LLM providers are configurable. SiliconFlow with SenseVoiceSmall and DeepSeek are convenience defaults only; users can replace the service URLs, model names, and Secrets with compatible providers.

Classification and wiki output are configured by a non-sensitive vault profile, defaulting to `.knowledge-inbox/profile.json`. Users do not need to manage this JSON directly: the graphical setup guide creates or updates it when settings are saved. Example routes are included, but their target folders are not created until a note is actually written.

The profile controls:

- Default write mode: preview or automatic.
- Prompt source per task: visible built-in rules, manually entered text, or a Markdown prompt file selected from the vault.
- Trusted category IDs and descriptions exposed to the LLM.
- Category-to-folder mappings.
- Per-category wiki templates and filename patterns.
- Configurable source, target, and processed frontmatter field names.

The settings tab provides a cross-platform graphical editor for this profile. Users can select prompt files, output templates, and existing folders from the vault; they can also type a new target folder without creating it immediately. Routes can be added or removed, Chinese category names are supported, and the full profile is validated before save. Built-in raw, transcription, and wiki layouts can be previewed. A custom template without a content marker remains valid: Knowledge Inbox appends the relevant content to its end.

The LLM returns only a category ID. It cannot choose an arbitrary path. In preview mode, users can edit the title and body and choose a configured route. In automatic mode, an unknown category falls back to preview.

Category cards are the only runtime classification source. Users may maintain them manually or select a vault prompt for a one-time AI import. Imported categories are previewed before replacing the editor draft; after import, the original classification prompt is not sent alongside the cards.

### Persistent processing

Audio and text are saved before entering a per-device persistent queue. The capture window can close immediately while Obsidian continues processing. Interrupted running jobs return to pending on the next launch. Missing Secrets or configuration pause a job without deleting its source. A task center keeps waiting, running, review, paused, failed, completed, and cancelled states with retry, review, cancel, and file-opening actions.

Mobile operating systems can suspend Obsidian in the background, so true background execution is not guaranteed. The queue guarantees recovery when Obsidian is opened again; an interrupted whole-file STT request restarts from that stage. Audio chunk checkpoints remain a later enhancement.

Template variables currently supported:

- Obsidian-style: `{{title}}`, `{{date}}`, `{{time}}`, `{{date:FORMAT}}`, `{{time:FORMAT}}`
- Text: `{{rawText}}`, `{{text}}`, `{{sourceType}}`, `{{created}}`
- Transcription: `{{transcript}}`, `{{sourceAudio}}`, `{{sourceAudioPath}}`, `{{created}}`

### Platforms

- Android
- iPhone and iPad
- macOS
- Windows

### Development

```bash
npm ci --registry=https://registry.npmjs.org --replace-registry-host=always
npm run build
```

Obsidian loads `main.js`, `manifest.json`, and `styles.css` from:

```text
<vault>/.obsidian/plugins/knowledge-inbox/
```

### Privacy

Knowledge Inbox does not provide an API proxy or bundled AI quota. Users configure their own transcription and language-model providers. Cloud STT uploads audio to the selected provider, and cloud LLM processing uploads text to the selected provider.

API keys are stored through Obsidian SecretStorage instead of the plugin's vault-local `data.json`. Secret values are device-local and must be configured on each device. Their at-rest protection follows the current Obsidian implementation for that platform.

Knowledge Inbox requires Obsidian 1.11.4 or newer because that version exposes SecretStorage to plugins. Existing plaintext Audio Inbox keys are migrated once without overwriting a secret that already exists, then removed from normal plugin settings.

### Attribution

Knowledge Inbox is based on [Audio Inbox](https://github.com/andsea007/obsidian-audio-inbox) by Andsea, used under the MIT License. The upstream notice and license are preserved in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [LICENSE-AUDIO-INBOX-MIT](LICENSE-AUDIO-INBOX-MIT).

### License

Copyright (c) 2026 HortenseJ.

Knowledge Inbox is distributed under [GNU GPL v3 or later](LICENSE). If you distribute a modified version, you must provide the corresponding source code under a compatible GPL license.

The Audio Inbox code incorporated into this project retains its original MIT copyright and notice as described above.

---

## 简体中文

### 预期工作流

1. 录制或导入音频，或粘贴文本。
2. 在任何网络请求之前保存原始材料。
3. 使用用户配置的 STT API 转写音频。
4. 使用用户配置的 LLM API 整理和分类内容。
5. 使用 vault 模板和文件夹映射预览或自动写入结构化笔记。

### 当前功能

- 统一的音频和文本采集窗口。
- 文本来源选择：书面文本或外部转录文本。
- 原始文本输出默认保存到 `raw/text/`。
- STT 输出在任何 LLM 请求之前保存到 `raw/transcription/`。
- 默认保留源音频文件。
- 原始文本和转录文件夹可配置。
- 用户可以从 vault 中选择 Markdown 模板。
- 书面文本和外部转录使用不同的默认整理规则。
- 文本可以在采集后自动整理，或通过"整理选中文本"命令手动整理。
- LLM 响应被解析为经过验证的 JSON，然后作为受管理的 AI 草稿附加到原始笔记中。
- 重新处理只替换受管理的草稿块，并保留原始源和所有其他用户内容。

对于导入的音频，推荐使用 M4A、MP3 和 WAV 格式。OGG、WEBM、AAC 和 FLAC 是兼容性尝试：知识收件箱首先要求当前设备解码并将其转换为 WAV，因此结果在 Android、iPhone、macOS 和 Windows 之间可能有所不同。插件当前限制上传大小为 50MB；特定于提供商的时长和格式限制取决于配置的 STT 服务。

STT 和 LLM 提供商可配置。使用 SenseVoiceSmall 和 DeepSeek 的 SiliconFlow 只是便利的默认设置；用户可以将服务 URL、模型名称和 Secrets 替换为兼容的提供商。

分类和 wiki 输出由非敏感的 vault profile 配置，默认为 `.knowledge-inbox/profile.json`。用户无需直接管理此 JSON：图形设置指南在保存设置时创建或更新它。包含示例路由，但在实际写入笔记之前不会创建其目标文件夹。

Profile 控制以下内容：

- 默认写入模式：预览或自动。
- 每个任务的提示词来源：可见的内置规则、手动输入的文本，或从 vault 中选择的 Markdown 提示词文件。
- 暴露给 LLM 的受信任类别 ID 和描述。
- 类别到文件夹的映射。
- 每个类别的 wiki 模板和文件名模式。
- 可配置的源、目标和已处理 frontmatter 字段名称。

设置选项卡提供此 profile 的跨平台图形编辑器。用户可以从 vault 中选择提示词文件、输出模板和现有文件夹；他们还可以键入新的目标文件夹而无需立即创建。路由可以添加或删除，支持中文类别名称，保存前会验证完整 profile。可以预览内置的原始、转录和 wiki 布局。没有内容标记的自定义模板仍然有效：知识收件箱会将相关内容附加到其末尾。

LLM 只返回类别 ID。它无法选择任意路径。在预览模式下，用户可以编辑标题和正文并选择配置的路由。在自动模式下，未知类别会回退到预览。

类别卡片是唯一的运行时分类来源。用户可以手动维护它们，或选择 vault 提示词进行一次性 AI 导入。导入的类别在替换编辑器草稿之前会预览；导入后，原始分类提示词不会与卡片一起发送。

### 持久化处理

音频和文本在进入每设备持久化队列之前会被保存。采集窗口可以立即关闭，而 Obsidian 继续处理。中断的运行作业在下一次启动时返回待处理状态。缺少 Secrets 或配置会暂停作业而不删除其源。任务中心保持等待、运行、审核、暂停、失败、完成和取消状态，具有重试、审核、取消和文件打开操作。

移动操作系统可以在后台挂起 Obsidian，因此无法保证真正的后台执行。队列保证在 Obsidian 再次打开时恢复；中断的全文件 STT 请求从该阶段重新开始。音频块检查点仍然是以后的增强功能。

当前支持的模板变量：

- Obsidian 风格：`{{title}}`、`{{date}}`、`{{time}}`、`{{date:FORMAT}}`、`{{time:FORMAT}}`
- 文本：`{{rawText}}`、`{{text}}`、`{{sourceType}}`、`{{created}}`
- 转录：`{{transcript}}`、`{{sourceAudio}}`、`{{sourceAudioPath}}`、`{{created}}`

### 支持平台

- Android
- iPhone 和 iPad
- macOS
- Windows

### 开发

```bash
npm ci --registry=https://registry.npmjs.org --replace-registry-host=always
npm run build
```

Obsidian 从以下位置加载 `main.js`、`manifest.json` 和 `styles.css`：

```text
<vault>/.obsidian/plugins/knowledge-inbox/
```

### 隐私

知识收件箱不提供 API 代理或捆绑的 AI 配额。用户配置自己的转录和语言模型提供商。云 STT 将音频上传到选定的提供商，云 LLM 处理将文本上传到选定的提供商。

API 密钥通过 Obsidian SecretStorage 而不是插件的 vault 本地 `data.json` 存储。Secret 值是设备本地的，必须在每台设备上配置。它们的静态保护遵循该平台的当前 Obsidian 实现。

知识收件箱需要 Obsidian 1.11.4 或更高版本，因为该版本向插件公开了 SecretStorage。现有的纯文本 Audio Inbox 密钥会迁移一次，而不会覆盖已存在的 secret，然后从常规插件设置中删除。

### 归属

知识收件箱基于 [Andsea 的 Audio Inbox](https://github.com/andsea007/obsidian-audio-inbox)，在 MIT 许可证下使用。上游通知和许可证保留在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 [LICENSE-AUDIO-INBOX-MIT](LICENSE-AUDIO-INBOX-MIT) 中。

### 许可证

版权所有 (c) 2026 HortenseJ。

知识收件箱以 [GNU GPL v3 或更高版本](LICENSE) 分发。如果您分发修改版本，则必须在兼容的 GPL 许可证下提供相应的源代码。

合并到本项目中的 Audio Inbox 代码保留其原始 MIT 版权和通知，如上所述。