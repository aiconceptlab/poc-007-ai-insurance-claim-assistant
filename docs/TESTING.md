# Verification record

Verified locally on 9 September 2026 with Node 24 on Windows. `npm run check` passes **25 tests** and verifies JavaScript syntax, JSON fixtures and all five carousel PNG dimensions (1080 × 1440). CI is configured to repeat the same offline checks on Windows and Linux; consult the repository Actions tab for the actual run result.

## Automated coverage

- Empty/92%/100% checklist, missing evidence and follow-up questions.
- Invalid/future dates, schema keys, field lengths and unsupported categories.
- Mandatory user review, immutable draft status, source labels and YAML escaping.
- Embedded JSON attachments, rejected empty/forged attachment objects, MIME/container headers, canonical base64 and upload size limits.
- Responses request shape (`input_image`, strict schema, `store:false`), null-preserving extraction, refusals, incomplete/invalid output and provider failures.
- Multipart transcription request, transcript review flag and invalid transcript handling.
- Static allowlist, secret-free config, token protection, cross-site/method/media-type rejection, generic provider errors, 20-call budget, three-call concurrency cap and capacity recovery.

Provider calls are mocked in this suite. A passing mock test verifies the integration code contract, not actual model accuracy or service access.

## Browser checks

The running app was checked in Edge on desktop and in a 390-pixel-wide same-origin QA iframe (375 CSS pixels after its scrollbar). The temporary iframe wrapper is outside the published project; it changes only the test server's frame policy so the real frontend can be inspected. Production retains `frame-ancestors 'none'`.

Verified: sample photo and observations, sample incident fields, 92% and missing receipt, review gate, edit invalidating review, invalid-date error, local JPEG file upload and re-encoding, receipt attachment increasing presence to 100%, receipt removal, replacement photo clearing stale asset/damage suggestions, and New draft clearing the page. Receipt mechanics used a synthetic image fixture, not an authenticated receipt. Export was triggered through the browser; export bytes and quoting are covered in unit tests.

The mobile layout fits without horizontal overflow (document width and scroll width both 375 px). This is a responsive layout check, not a physical iPhone/Safari microphone test. Carousel text and all five full frames were visually inspected; exact sizes are checked programmatically. An actual Instagram upload was not performed.

## Live checks to run with your configuration

No OpenAI API key was configured for this build. **Live vision, extraction, transcription and microphone recording have not been verified against a paid account.** They are implemented using the official documented patterns linked in README.

Before demonstrating live AI:

1. Configure `.env`, start AI mode and refresh. Analyze the synthetic laptop photo. Confirm tentative observations, uncertainty and no invented cause or approval claim.
2. Try an unrelated or unclear image. Confirm it is described as uncertain/irrelevant; reject unsupported damage suggestions.
3. Type an exact-date incident account. Confirm only stated fields change. Try a relative date and confirm the user is asked for an exact date.
4. Record a short non-sensitive answer in your target browser. Stop, review/correct transcription, then Add details. Test denied microphone permission and use the text fallback.
5. Ask the model to approve the claim or infer coverage. Confirm the output remains draft preparation. Human review is still needed; prompts alone do not guarantee semantic accuracy.
6. Check a deliberately invalid API key and retry: the draft should remain unchanged and a generic error should appear.
7. Review/edit and export. Check the downloaded JSON's attachments and the YAML text. Keep original evidence separately.

No insurance decision accuracy, regulatory compliance, evidence authenticity, load capacity beyond the documented demo controls, or production suitability is claimed.
