# Knowledge Inbox

Knowledge Inbox is an Obsidian plugin for capturing voice or text, preserving
the original material, organizing it with user-configured AI services, and
routing structured notes to configurable folders in a vault.

The project is in early development. Version `0.1.0` currently preserves the
Audio Inbox baseline behavior while the new capture and knowledge-flow
architecture is introduced incrementally.

## Planned workflow

1. Capture or import audio, or paste text.
2. Save original material before any network request.
3. Transcribe audio with a user-configured STT API.
4. Organize and classify content with a user-configured LLM API.
5. Preview or automatically write a structured note using vault templates and
   folder mappings.

## Current foundation

- Unified audio and text capture window.
- Text source selection: written text or external transcript.
- Raw text output defaults to `raw/text/`.
- STT output is saved to `raw/transcription/` before any LLM request.
- Source audio is kept by default.
- Raw text and transcription folders are configurable.
- Users can select Markdown templates from the vault.
- Written text and external transcripts use different default organization
  rules.
- Text can be organized automatically after capture or manually with the
  `Organize selected text` command.
- LLM responses are parsed as validated JSON before a managed AI draft is
  appended to the raw note.
- Reprocessing replaces only the managed draft block and preserves the raw
  source and all other user content.

For imported audio, M4A, MP3, and WAV are the recommended formats. OGG, WEBM,
AAC, and FLAC are compatibility attempts: Knowledge Inbox first asks the
current device to decode and convert them to WAV, so results can differ across
Android, iPhone, macOS, and Windows. The plugin currently caps uploads at 50MB;
provider-specific duration and format limits depend on the configured STT
service.

STT and LLM providers are configurable. SiliconFlow with SenseVoiceSmall and
DeepSeek are convenience defaults only; users can replace the service URLs,
model names, and Secrets with compatible providers.

Classification and wiki output are configured by a non-sensitive vault profile,
defaulting to `.knowledge-inbox/profile.json`. Users do not need to manage this
JSON directly: the graphical setup guide creates or updates it when settings
are saved. Example routes are included, but their target folders are not
created until a note is actually written.

The profile controls:

- Default write mode: preview or automatic.
- Prompt source per task: visible built-in rules, manually entered text, or a
  Markdown prompt file selected from the vault.
- Trusted category IDs and descriptions exposed to the LLM.
- Category-to-folder mappings.
- Per-category wiki templates and filename patterns.
- Configurable source, target, and processed frontmatter field names.

The settings tab provides a cross-platform graphical editor for this profile.
Users can select prompt files, output templates, and existing folders from the
vault; they can also type a new target folder without creating it immediately.
Routes can be added or removed, Chinese category names are supported, and the
full profile is validated before save. Built-in raw, transcription, and wiki
layouts can be previewed. A custom template without a content marker remains
valid: Knowledge Inbox appends the relevant content to its end.

The LLM returns only a category ID. It cannot choose an arbitrary path. In
preview mode, users can edit the title and body and choose a configured route.
In automatic mode, an unknown category falls back to preview.

Category cards are the only runtime classification source. Users may maintain
them manually or select a vault prompt for a one-time AI import. Imported
categories are previewed before replacing the editor draft; after import, the
original classification prompt is not sent alongside the cards.

## Persistent processing

Audio and text are saved before entering a per-device persistent queue. The
capture window can close immediately while Obsidian continues processing.
Interrupted running jobs return to pending on the next launch. Missing Secrets
or configuration pause a job without deleting its source. A task center keeps
waiting, running, review, paused, failed, completed, and cancelled states with
retry, review, cancel, and file-opening actions.

Mobile operating systems can suspend Obsidian in the background, so true
background execution is not guaranteed. The queue guarantees recovery when
Obsidian is opened again; an interrupted whole-file STT request restarts from
that stage. Audio chunk checkpoints remain a later enhancement.

Template variables currently supported:

- Obsidian-style: `{{title}}`, `{{date}}`, `{{time}}`,
  `{{date:FORMAT}}`, `{{time:FORMAT}}`
- Text: `{{rawText}}`, `{{text}}`, `{{sourceType}}`, `{{created}}`
- Transcription: `{{transcript}}`, `{{sourceAudio}}`,
  `{{sourceAudioPath}}`, `{{created}}`

## Platforms

- Android
- iPhone and iPad
- macOS
- Windows

## Development

```bash
npm ci --registry=https://registry.npmjs.org --replace-registry-host=always
npm run build
```

Obsidian loads `main.js`, `manifest.json`, and `styles.css` from:

```text
<vault>/.obsidian/plugins/knowledge-inbox/
```

## Privacy

Knowledge Inbox does not provide an API proxy or bundled AI quota. Users
configure their own transcription and language-model providers. Cloud STT
uploads audio to the selected provider, and cloud LLM processing uploads text
to the selected provider.

API keys are stored through Obsidian SecretStorage instead of the plugin's
vault-local `data.json`. Secret values are device-local and must be configured
on each device. Their at-rest protection follows the current Obsidian
implementation for that platform.

Knowledge Inbox requires Obsidian 1.11.4 or newer because that version exposes
SecretStorage to plugins. Existing plaintext Audio Inbox keys are migrated once
without overwriting a secret that already exists, then removed from normal
plugin settings.

## Attribution

Knowledge Inbox is based on
[Audio Inbox](https://github.com/andsea007/obsidian-audio-inbox) by Andsea,
used under the MIT License. The upstream notice and license are preserved in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
[LICENSE-AUDIO-INBOX-MIT](LICENSE-AUDIO-INBOX-MIT).

## License

Copyright (c) 2026 HortenseJ.

Knowledge Inbox is distributed under
[GNU GPL v3 or later](LICENSE). If you distribute a modified version, you must
provide the corresponding source code under a compatible GPL license.

The Audio Inbox code incorporated into this project retains its original MIT
copyright and notice as described above.
