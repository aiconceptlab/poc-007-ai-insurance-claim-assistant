export const EMPTY = Object.freeze({
  incidentDate: "",
  location: "",
  description: "",
  asset: "",
  damage: "",
  category: "",
});
export const CATEGORIES = [
  "Accidental damage",
  "Liquid damage",
  "Theft or loss",
  "Other / needs review",
];
export const CHECKLIST = Object.freeze([
  { key: "incidentDate", label: "Incident date", weight: 15 },
  { key: "location", label: "Incident location", weight: 15 },
  { key: "description", label: "Incident description (20+ characters)", weight: 20 },
  { key: "asset", label: "Asset", weight: 10 },
  { key: "damage", label: "Damage description (5+ characters)", weight: 12 },
  { key: "category", label: "Provisional category", weight: 10 },
  { key: "photo", label: "Supporting photo", weight: 10 },
  { key: "receipt", label: "Purchase receipt photo", weight: 8 },
]);
export const SOURCES = ["user", "ai-suggestion", "sample"];
export function validDate(value, today = new Date().toISOString().slice(0, 10)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > today) return false;
  const d = new Date(value + "T12:00:00Z");
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}
export function validateFields(fields, { today = new Date().toISOString().slice(0, 10) } = {}) {
  if (
    !fields ||
    typeof fields !== "object" ||
    Array.isArray(fields) ||
    Object.keys(fields).length !== 6 ||
    Object.keys(fields).some((k) => !Object.hasOwn(EMPTY, k))
  )
    throw new Error("Invalid claim fields.");
  const result = {};
  for (const k of Object.keys(EMPTY)) {
    if (typeof fields[k] !== "string" || fields[k].length > (k === "description" ? 3000 : 500))
      throw new Error("Invalid " + k + ".");
    result[k] = fields[k].trim();
  }
  if (result.incidentDate && !validDate(result.incidentDate, today))
    throw new Error("Enter a real incident date, on or before today, in YYYY-MM-DD format.");
  if (result.category && !CATEGORIES.includes(result.category))
    throw new Error("Choose a supported provisional category.");
  return result;
}
export function completeness(fields, { photo = false, receipt = false } = {}, options = {}) {
  const f = validateFields(fields, options);
  const present = {
    incidentDate: !!f.incidentDate,
    location: f.location.length >= 2,
    description: f.description.length >= 20,
    asset: f.asset.length >= 2,
    damage: f.damage.length >= 5,
    category: !!f.category,
    photo: photo === true,
    receipt: receipt === true,
  };
  const items = CHECKLIST.map((item) => ({ ...item, complete: present[item.key] }));
  return {
    percent: items.reduce((n, i) => n + (i.complete ? i.weight : 0), 0),
    items,
    missing: items.filter((i) => !i.complete).map((i) => i.label),
    meaning:
      "Weighted presence of fields in this demo checklist. Not evidence quality, policy compliance, coverage or approval likelihood.",
  };
}
export function nextQuestion(fields, attachments = {}) {
  if (!fields.incidentDate) return "When did the incident happen? Please give the exact date.";
  if (!fields.location) return "Where did it happen? A general location is enough for this draft.";
  if (fields.description.trim().length < 20)
    return "What happened? Describe the incident in your own words.";
  if (!fields.asset) return "Which item was affected?";
  if (fields.damage.trim().length < 5)
    return "What damage have you noticed? Please check the photo observations.";
  if (!fields.category)
    return "Which provisional category best describes your account? You can choose Other / needs review.";
  if (!attachments.photo)
    return "Add a supporting photo, or export an incomplete draft with the gap flagged.";
  if (!attachments.receipt)
    return "A purchase receipt is still missing from this demo checklist. You can attach a receipt photo or export with it flagged.";
  return "The demo checklist is filled. Check the draft before exporting it for a person to review.";
}
export function buildDraft(
  { id, fields, sources, photo = null, receipt = null, reviewed = false, observations = null },
  now = new Date(),
) {
  if (!/^DRAFT-[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid draft ID.");
  if (reviewed !== true) throw new Error("Check the draft details before exporting.");
  const f = validateFields(fields, { today: now.toISOString().slice(0, 10) });
  photo = validateAttachment(photo);
  receipt = validateAttachment(receipt);
  const provenance = {};
  for (const k of Object.keys(EMPTY)) {
    if (!SOURCES.includes(sources?.[k])) throw new Error("Invalid field source.");
    provenance[k] = sources[k];
  }
  return {
    schemaVersion: 1,
    id,
    status: "draft_for_human_review",
    createdAt: now.toISOString(),
    fields: f,
    fieldSources: provenance,
    categoryStatus: "provisional_not_a_coverage_decision",
    photoObservations: observations,
    completeness: completeness(
      f,
      { photo: !!photo, receipt: !!receipt },
      { today: now.toISOString().slice(0, 10) },
    ),
    attachments: { photo, receipt },
    preparedByUserReview: true,
    notice:
      "Prepared for human review. Not submitted to an insurer. No coverage, liability, fraud, repair-cost or approval decision has been made.",
  };
}
// Shared by browser exports and tests. Presence is not evidence authenticity.
export function validateAttachment(value) {
  if (value === null) return null;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !["name", "type", "base64", "sample"].includes(k)) ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 160 ||
    !["image/jpeg", "image/png"].includes(value.type) ||
    (value.sample !== undefined && typeof value.sample !== "boolean") ||
    typeof value.base64 !== "string" ||
    value.base64.length > 6990508 ||
    value.base64.length % 4 ||
    /[^A-Za-z0-9+/=]/.test(value.base64)
  )
    throw new Error("Invalid attachment.");
  let bytes;
  try {
    bytes = atob(value.base64);
  } catch {
    throw new Error("Invalid attachment.");
  }
  if (
    bytes.length < 12 ||
    bytes.length > 5 * 1024 * 1024 ||
    btoa(bytes) !== value.base64 ||
    (value.type === "image/jpeg"
      ? !bytes.startsWith("\xff\xd8\xff")
      : !bytes.startsWith("\x89PNG\r\n\x1a\n"))
  )
    throw new Error("Invalid attachment.");
  return { ...value, name: value.name.replace(/[\x00-\x1f\x7f/\\]/g, "_") };
}
// JSON-quoted scalars are valid YAML strings; they prevent multiline content becoming keys.
export function draftText(d) {
  const q = (v) => JSON.stringify(v);
  return `# Claim draft for human review\nclaim_id: ${q(d.id)}\nstatus: ${q(d.status)}\ncreated_at: ${q(d.createdAt)}\nincident_date: ${q(d.fields.incidentDate || "Missing")}\nlocation: ${q(d.fields.location || "Missing")}\nasset: ${q(d.fields.asset || "Missing")}\ndescription: ${q(d.fields.description || "Missing")}\ndamage: ${q(d.fields.damage || "Missing")}\nprovisional_category: ${q(d.fields.category || "Missing")}\nchecklist_complete_percent: ${d.completeness.percent}\nmissing: ${JSON.stringify(d.completeness.missing)}\nsupporting_photo: ${q(d.attachments.photo?.name || "Missing")}\nreceipt_photo: ${q(d.attachments.receipt?.name || "Missing")}\nnotice: ${q(d.notice)}\n# Attachments are embedded only in the JSON bundle, not in this text file.\n# Completeness measures field presence, not approval likelihood or policy requirements.\n`;
}
