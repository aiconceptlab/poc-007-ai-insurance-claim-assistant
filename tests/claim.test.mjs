import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  EMPTY,
  validDate,
  validateFields,
  completeness,
  nextQuestion,
  buildDraft,
  draftText,
  validateAttachment,
} from "../lib/claim.mjs";
import { decodeUpload, MAX_FILE_BYTES } from "../lib/uploads.mjs";
const sample = JSON.parse(await readFile(new URL("../sample/incident.json", import.meta.url)));
const jpeg = {
  name: "photo.jpg",
  type: "image/jpeg",
  base64: (
    await readFile(new URL("../public/assets/damaged-laptop.jpg", import.meta.url))
  ).toString("base64"),
};
const base = {
  id: "DRAFT-12345678-1234-1234-1234-123456789abc",
  fields: sample.fields,
  sources: Object.fromEntries(Object.keys(EMPTY).map((k) => [k, "sample"])),
  photo: jpeg,
  reviewed: true,
};
test("empty draft is 0%; fixture with photo is 92% and missing only receipt", () => {
  assert.equal(completeness(EMPTY).percent, 0);
  const c = completeness(sample.fields, { photo: true });
  assert.equal(c.percent, 92);
  assert.deepEqual(c.missing, ["Purchase receipt photo"]);
  assert.equal(completeness(sample.fields, { photo: true, receipt: true }).percent, 100);
  assert.equal(completeness(sample.fields, { photo: false }).percent, 82);
});
test("dates reject future and impossible dates, accept leap day", () => {
  for (const d of ["2026-02-29", "2026-13-01", "7 September", "1899-01-01", "9999-01-01"])
    assert.equal(validDate(d, "2026-09-09"), false);
  assert.equal(validDate("2024-02-29", "2026-09-09"), true);
  assert.throws(() => validateFields({ ...EMPTY, incidentDate: "9999-01-01" }));
});
test("schema rejects unknown fields, nonstrings, oversized input and approval category", () => {
  for (const f of [
    { ...EMPTY, approved: true },
    { ...EMPTY, asset: 3 },
    { ...EMPTY, description: "a".repeat(3001) },
    { ...EMPTY, category: "Approved" },
    null,
  ])
    assert.throws(() => validateFields(f));
});
test("follow-up asks for date first and missing evidence later", () => {
  assert.match(nextQuestion(EMPTY), /exact date/);
  assert.match(nextQuestion(sample.fields), /supporting photo/);
  assert.match(nextQuestion(sample.fields, { photo: true }), /receipt/);
});
test("export requires explicit review and preserves immutable draft status", () => {
  assert.throws(() => buildDraft({ ...base, reviewed: false }), /Check/);
  const d = buildDraft(base);
  assert.equal(d.status, "draft_for_human_review");
  assert.equal(d.completeness.percent, 92);
  assert.equal(d.fieldSources.damage, "sample");
  assert.match(d.notice, /Not submitted/);
  assert.match(d.categoryStatus, /not_a_coverage_decision/);
  assert.throws(() => buildDraft({ ...base, sources: {} }));
  assert.throws(() => buildDraft({ ...base, id: "claim-approved" }));
});
test("JSON includes attachment bytes; YAML safely quotes multiline user content", () => {
  const d = buildDraft({
    ...base,
    fields: { ...sample.fields, description: "I dropped it.\nstatus: approved" },
  });
  assert.equal(JSON.parse(JSON.stringify(d)).attachments.photo.base64, jpeg.base64);
  const text = draftText(d);
  assert.ok(text.includes("\\nstatus: approved"));
  assert.ok(!text.includes("\nstatus: approved"));
  assert.ok(!text.includes(jpeg.base64));
});
test("exports reject empty or forged attachment objects instead of inflating score", () => {
  for (const photo of [
    {},
    { ...jpeg, base64: "bad" },
    { ...jpeg, type: "text/html" },
    { ...jpeg, base64: Buffer.from("not a jpeg photo").toString("base64") },
  ])
    assert.throws(() => buildDraft({ ...base, photo }));
  assert.equal(validateAttachment(null), null);
  assert.equal(validateAttachment({ ...jpeg, name: "../photo.jpg" }).name, ".._photo.jpg");
});
test("uploads validate signature, canonical base64 and size before contacting provider", () => {
  assert.equal(decodeUpload(jpeg).type, "image/jpeg");
  for (const value of [
    { ...jpeg, type: "image/png" },
    { ...jpeg, base64: jpeg.base64 + "=" },
    { ...jpeg, base64: "A".repeat(Math.ceil(MAX_FILE_BYTES / 3) * 4 + 4) },
    { ...jpeg, url: "https://example.com" },
    { ...jpeg, base64: Buffer.alloc(12).toString("base64") },
  ])
    assert.throws(() => decodeUpload(value));
});
test("audio accepts supported container signatures and rejects MIME mismatch", () => {
  const wav = {
    name: "a.wav",
    type: "audio/wav",
    base64: Buffer.from("RIFF0000WAVEdata").toString("base64"),
  };
  assert.equal(decodeUpload(wav, "audio").type, "audio/wav");
  assert.throws(() => decodeUpload({ ...wav, type: "audio/mp4" }, "audio"));
});
