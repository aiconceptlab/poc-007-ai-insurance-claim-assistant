# BUILD — POC 007

## Product boundary

The product gathers an account and prepares an editable draft. No insurer integration, eligibility decision, policy lookup, fraud judgement, cost estimate, payment or claim submission exists. Categories are provisional organisational tags. The review checkbox records the user's review of the draft, not approval by an insurer.

## Small architecture

```text
Browser photo -- explicit Analyze --> Node /api/analyze --> OpenAI Responses (vision)
Browser account -- Add details -----> Node /api/extract --> OpenAI Responses (schema)
Browser recording -- Stop ----------> Node /api/transcribe --> OpenAI transcription
                                     |
Suggestions and transcript <---------+
          |
Editable fields + local attachments
          |
Deterministic checklist --> user review --> JSON bundle / YAML download
```

Node 24 supplies HTTP, fetch, FormData, Blob, crypto and the test runner. The vanilla frontend uses CSS grid, native file inputs, canvas and MediaRecorder. No SDK or deployment platform is required. The sample/manual mode uses the exact same form, checklist and export logic as AI mode.

## API contracts

All AI routes use POST JSON. When a shared token is configured, send `Authorization: Bearer <APP_ACCESS_TOKEN>`.

- `/api/analyze`: `{upload:{name,type,base64}}` -> `{asset,observations,uncertainties,source:'ai-suggestion',confirmed:false}`.
- `/api/extract`: `{text,fields:{incidentDate,location,description,asset,damage,category}}` -> `{fields,changed}`. Every input field is a string; empty means unknown. The model returns a nullable six-field object. Only explicit nonblank updates are merged.
- `/api/transcribe`: `{upload:{name,type,base64}}` -> `{text,reviewRequired:true}`.
- `GET /api/config`: public `{mode,locked}`, without keys or token.

Unknown routes return 404. Wrong methods 405; missing/incorrect token 401; cross-site fetch 403; wrong media type 415; sample-mode AI calls 409; malformed fields/uploads 400; budget/concurrency cap 429; provider refusal, incomplete output or failure 502 with a generic message. The browser keeps the current draft on failure.

## Integration details

`lib/ai.mjs` calls the fixed official API origin. Responses requests use `store:false`, `max_output_tokens:1400`, and `text.format:{type:'json_schema',name,strict:true,schema}`. Each schema requires all properties and sets `additionalProperties:false`. Photo input is a base64 `input_image`; uploaded text is treated as evidence rather than instructions. Output is validated again in code, including field lengths, dates and categories. Incomplete results, refusals, unknown keys and malformed JSON are rejected.

Transcription uses FormData (`model`, `response_format=json`, `file`). Fetch sets the multipart boundary automatically; do not add a Content-Type header. Audio is transcribed first and returned to the textarea for correction. This POC does not synthesize speech: the user can speak, and assistant questions appear as text. Relative or ambiguous incident dates are left unknown until the user supplies an exact date.

The model prompts reduce unsupported inference; schema validation cannot prove every statement is faithful. Photo observations remain unconfirmed, provenance is displayed, and human review is required before download. An irrelevant or unclear photo should yield uncertainty, not invented damage. These semantic cases need real-model evaluation in your account before a public live demonstration.

## Data and limits

Uploads are bounded at 5 MiB, HTTP JSON bodies at 7,200,000 bytes, provider calls at 20 seconds, and browser calls at 25 seconds. The server allows 3 concurrent AI calls and 20 calls per minute across the process; these reset on restart and are not distributed quotas. Configure provider spending controls for your own account.

Image MIME and magic bytes are checked server-side. This is a header check, not a complete image decoder or evidence authentication. The browser decodes/re-encodes user images and checks dimensions. Photo metadata is omitted by canvas export; original files are not modified. Attachments are validated again before JSON export. The server does not fetch arbitrary uploaded URLs.

State is per-page memory only. No localStorage, customer database, upload directory or claim log is created. Reload and New draft clear the page. A JSON export can contain personal information and evidence; it is the user's responsibility to store or share that file intentionally. There is no import or insurer-send function.

## Build and verify

1. Install Node 24 and run `npm ci --ignore-scripts`.
2. Run `npm run check` (no credentials or API spending).
3. Run `npm start` and follow `docs/demo-script.md`.
4. To use live AI, copy `.env.example`, configure a key locally, set `AI_MODE=openai`, restart and refresh.
5. Run the live checklist in `docs/TESTING.md`. Keep fixture/mock success distinct from real provider success.
6. For sharing, configure HTTPS and the access token as described in README. Public GitHub source alone does not host the app.

CI runs the same checks on Windows and Linux with Node 24. There is no bundling step. To package the tracked project, use `git archive --format=zip --prefix=poc-007-ai-insurance-claim-assistant/ -o ../poc-007-ai-insurance-claim-assistant.zip HEAD`. `.env.example` is included; `.env` is ignored.

See README for the exact official reference links. Defaults are documented model IDs; keep environment overrides when you evaluate a newer compatible model.
