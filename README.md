# POC #007 — AI Insurance Claim Assistant

**A damaged laptop. A clearer claim.**

Claimnote turns a damage photo and a spoken or typed incident account into an editable claim draft **for human review**. It never approves, denies or submits a claim, checks coverage, or estimates a payout.

![Photo-led carousel cover](marketing/images/01-cover.png)

## Run the free sample

Requires Node.js 24. No database, build step or runtime npm dependencies.

```sh
npm ci --ignore-scripts
npm start
```

Open **http://127.0.0.1:3010**. Click **Try sample photo**, then **Use for asset and damage**, then **Use sample incident account**. The fictional example reaches **92% checklist completeness** and flags the missing purchase receipt. Review/edit the fields, check the review box, and download the JSON bundle or YAML text draft.

The default sample/manual mode makes **no AI calls**. Its photo observations and incident account are scripted and visibly labelled. You can also attach your own photo and enter fields manually. Reloading or choosing New draft clears the page; there is no autosave or import feature.

## Enable live photo analysis and voice

Copy `.env.example` to `.env` (PowerShell: `Copy-Item .env.example .env`; macOS/Linux: `cp .env.example .env`). Set these values locally:

```dotenv
AI_MODE=openai
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-4.1-mini-2025-04-14
TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

Restart `npm start` and refresh the page. API usage requires your own paid OpenAI credits; the source and no-key sample are free.

1. Choose a JPEG/PNG photo, then **Analyze this photo**. The model proposes tentative visible observations. Click **Use for asset and damage** only after checking them.
2. Type your incident account or select **Record answer**. Stopping a recording sends it for transcription. Correct the transcript before selecting **Add details to draft**.
3. Answer the next question with an exact date and explicit facts. Unmentioned fields are preserved. AI suggestions are labelled; every field is editable.
4. Optionally attach a receipt photo. Review all fields and download the draft. Further edits invalidate the review checkbox.

Recording needs microphone permission and a secure browser context (localhost or HTTPS). Up to 60 seconds / 5 MB of WebM or MP4 recording; unsupported browsers can use text. The server transcription endpoint also accepts WAV. Photo uploads are JPEG/PNG up to 5 MB and 24 megapixels; the browser re-encodes them to JPEG, at most 1600 px on the longest edge. Keep original evidence separately: exports contain the resized copies.

## What 92% means

This is a transparent demo checklist, calculated in code. It measures **field/attachment presence**, not correctness, evidence quality, insurer requirements or approval likelihood.

| Item                               | Weight |
| ---------------------------------- | -----: |
| Valid incident date                |    15% |
| Location (2+ characters)           |    15% |
| Description (20+ characters)       |    20% |
| Asset (2+ characters)              |    10% |
| Damage description (5+ characters) |    12% |
| Provisional category               |    10% |
| Supporting photo                   |    10% |
| Receipt photo                      |     8% |

A complete fixture without the receipt is 92%. Adding an attachment does not authenticate it. Incomplete drafts can be exported after review, with missing items listed. A human decides what evidence is actually required.

## Files and exports

- `server.mjs`: small Node HTTP server; three AI routes and a static file allowlist.
- `lib/ai.mjs`: vision, structured extraction and transcription; explicit prompts and schemas.
- `lib/claim.mjs`: field validation, checklist, questions and export format (shared with browser).
- `public/`: responsive frontend and synthetic sample photo.
- `sample/incident.json`: fictional incident and scripted observations.
- `tests/`: offline tests for validation, API contracts and HTTP safeguards.
- `marketing/`: five 1080 × 1440 carousel PNGs, caption and image prompts.
- `docs/`: demo script, posting notes, engagement templates and verification record.

The **JSON bundle** includes fields, their source labels, tentative photo observations, checklist, notices, and base64 photo attachments. The **YAML text draft** lists filenames but does not embed photos. Draft IDs are random UUIDs; the carousel's `#00384` is an illustrative mockup.

## Privacy and sharing

Drafts and attachments stay in page memory until an explicit AI action or download. The server does not persist uploads or log their contents. Analyze sends the selected image to OpenAI; Add details sends the account and current draft fields; stopping recording sends captured audio. Receipt photos are never sent for AI analysis. Responses uses `store:false`; that setting is not a promise of zero provider retention. Review your provider's data settings before using real information. Use the fictional fixture for public demonstrations.

For a small shared demo, set `HOST=0.0.0.0` and a random `APP_ACCESS_TOKEN` of at least 32 characters. Put the server behind HTTPS and enter that token in the page's unlock form. The OpenAI key remains server-side. The sample/static UI remains public; the token protects paid AI routes. Configure your reverse proxy for an 8 MB body limit and a 30-second timeout. This is a starter with one shared token and per-process limits, not a production claims system, user account service or durable case store.

```sh
npm run check
```

Checks syntax, fixtures, exact carousel dimensions and the offline test suite. See [BUILD.md](BUILD.md) for the integration design and [verification](docs/TESTING.md) for what was and was not tested.

## Official integration references

Patterns checked on 9 September 2026 against OpenAI documentation:

- [Images and vision](https://developers.openai.com/api/docs/guides/images-vision): Responses `input_image` with a base64 data URL.
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs): `text.format` with a strict JSON schema; handle refusals and incomplete responses separately.
- [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini): pinned vision-capable model snapshot.
- [Speech to text](https://developers.openai.com/api/docs/guides/speech-to-text) and [GPT-4o mini Transcribe](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe): multipart audio transcription with JSON output.

MIT licence. Synthetic images were created with the built-in image generation tool; prompts are included in `marketing/image-prompts.json`.
