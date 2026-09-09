import {
  EMPTY,
  validateFields,
  completeness,
  nextQuestion,
  buildDraft,
  draftText,
} from "/claim.mjs";
const $ = (id) => document.getElementById(id),
  keys = Object.keys(EMPTY);
let fields = { ...EMPTY },
  sources = Object.fromEntries(keys.map((k) => [k, "user"])),
  photo = null,
  receipt = null,
  observations = null,
  id = "DRAFT-" + crypto.randomUUID(),
  mode = "demo",
  token = "",
  busy = false,
  recording = false,
  recorder = null,
  stream = null,
  timer = null,
  recordStarted = 0,
  sample = null;
const sourceLabel = (s) =>
  s === "ai-suggestion"
    ? "AI suggestion · check before export"
    : s === "sample"
      ? "Fictional sample"
      : "Entered by you";
function notice(text, error = false) {
  $("status").textContent = text;
  $("status").className = error ? "error" : "";
}
function sync() {
  for (const k of keys) $(k).value = fields[k];
  render();
}
function changed() {
  $("reviewed").checked = false;
  render();
}
function render() {
  $("draft-id").textContent = id;
  for (const k of keys)
    document.querySelector(`[data-source="${k}"]`).textContent = fields[k]
      ? sourceLabel(sources[k])
      : "";
  let valid = true;
  try {
    const c = completeness(fields, { photo: !!photo, receipt: !!receipt });
    $("percentage").textContent = c.percent + "%";
    $("progress").value = c.percent;
    $("missing").textContent = c.missing.length
      ? "Missing: " + c.missing.join(" · ")
      : "All demo checklist items are present. Human review is still required.";
    $("checklist").replaceChildren(
      ...c.items.map((i) => {
        const n = document.createElement("li");
        n.textContent = `${i.complete ? "✓" : "○"} ${i.label} · ${i.weight}%`;
        return n;
      }),
    );
    $("field-error").textContent = "";
  } catch (e) {
    valid = false;
    $("field-error").textContent = e.message;
    $("percentage").textContent = "—";
    $("progress").value = 0;
    $("missing").textContent = "Correct the date or fields to calculate completeness.";
  }
  $("question").textContent = nextQuestion(fields, { photo: !!photo, receipt: !!receipt });
  $("photo-overlay").hidden = !!photo;
  $("photo-preview").src = photo
    ? `data:${photo.type};base64,${photo.base64}`
    : "/assets/damaged-laptop.jpg";
  $("photo-preview").alt =
    photo && !photo.sample
      ? "Supporting photo uploaded by you; contents not yet confirmed"
      : "Illustrative damaged laptop with cracked screen and dented casing";
  $("photo-label").textContent = photo
    ? photo.sample
      ? "SYNTHETIC SAMPLE PHOTO"
      : photo.name
    : "ILLUSTRATIVE SAMPLE · NOT ATTACHED";
  $("remove-photo").hidden = !photo;
  $("analyze").hidden = mode !== "openai" || !photo;
  $("extract").hidden = mode !== "openai";
  $("sample-account").hidden = !photo?.sample;
  $("observations").hidden = !observations;
  if (observations) {
    $("observation-source").textContent =
      observations.source === "sample"
        ? "SCRIPTED SAMPLE OBSERVATIONS · UNCONFIRMED"
        : "AI PHOTO OBSERVATIONS · UNCONFIRMED";
    $("observation-text").textContent = observations.observations;
    $("uncertainty").textContent = observations.uncertainties;
  }
  $("receipt-label").textContent = receipt ? receipt.name : "Missing from this draft";
  $("remove-receipt").hidden = !receipt;
  document
    .querySelectorAll("button,input,textarea,select")
    .forEach((n) => (n.disabled = busy || recording));
  $("record").disabled = busy || mode !== "openai";
  $("record").textContent = recording ? "■ Stop & transcribe" : "● Record answer";
  $("record").classList.toggle("recording", recording);
  $("export-json").disabled = $("export-text").disabled =
    busy || recording || !valid || !$("reviewed").checked;
}
async function operation(fn) {
  if (busy || recording) return;
  busy = true;
  render();
  try {
    return await fn();
  } catch (e) {
    notice(e.message || "Something went wrong. Your draft has not been submitted.", true);
  } finally {
    busy = false;
    render();
  }
}
async function api(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  const data = await r.json();
  if (r.status === 401) $("access").hidden = false;
  if (!r.ok) throw new Error(data.error || "Request failed.");
  return data;
}
const upload = (u) => ({ name: u.name, type: u.type, base64: u.base64 });
const dataURL = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(blob);
  });
async function prepareImage(file) {
  if (
    !file ||
    !["image/jpeg", "image/png"].includes(file.type) ||
    file.size > 5 * 1024 * 1024 ||
    !file.size
  )
    throw new Error("Choose a JPEG or PNG photo up to 5 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 24000000)
      throw new Error("Use a photo smaller than 24 megapixels.");
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/jpeg", 0.88);
    return {
      name: file.name.replace(/\.[^.]+$/, "").slice(0, 140) + ".jpg",
      type: "image/jpeg",
      base64: result.split(",")[1],
    };
  } finally {
    bitmap.close();
  }
}
function setPhoto(value) {
  photo = value;
  observations = null;
  for (const k of ["asset", "damage"])
    if (sources[k] !== "user") {
      fields[k] = "";
      sources[k] = "user";
    }
  $("reviewed").checked = false;
  sync();
}
async function samplePhoto() {
  const r = await fetch("/assets/damaged-laptop.jpg");
  if (!r.ok) throw new Error("Sample photo unavailable.");
  const d = await dataURL(await r.blob());
  setPhoto({
    name: "synthetic-damaged-laptop.jpg",
    type: "image/jpeg",
    base64: d.split(",")[1],
    sample: true,
  });
  observations = { ...sample.observations };
  render();
  notice(
    "Synthetic sample photo attached. These are scripted observations, not a live AI analysis.",
  );
}
$("photo").addEventListener("change", (e) =>
  operation(async () => {
    const file = e.target.files[0];
    if (!file) return;
    const value = await prepareImage(file);
    setPhoto(value);
    notice(
      mode === "openai"
        ? "Photo attached. Choose Analyze this photo to send it to OpenAI."
        : "Photo attached locally. In sample/manual mode, describe the damage in the draft.",
    );
    e.target.value = "";
  }),
);
$("receipt").addEventListener("change", (e) =>
  operation(async () => {
    const file = e.target.files[0];
    if (!file) return;
    receipt = await prepareImage(file);
    changed();
    notice("Receipt photo attached locally. It will be included in the JSON download.");
    e.target.value = "";
  }),
);
$("sample-photo").addEventListener("click", () => operation(samplePhoto));
$("remove-photo").addEventListener("click", () => {
  setPhoto(null);
  notice("Photo removed. Related sample/AI asset and damage suggestions were cleared.");
});
$("remove-receipt").addEventListener("click", () => {
  receipt = null;
  changed();
  notice("Receipt removed. The checklist now shows it as missing.");
});
$("analyze").addEventListener("click", () =>
  operation(async () => {
    notice("Looking at the visible evidence…");
    const result = await api("/api/analyze", { upload: upload(photo) });
    observations = result;
    $("reviewed").checked = false;
    notice("Tentative observations are ready. Check them before using them in the draft.");
  }),
);
$("use-observations").addEventListener("click", () => {
  fields.asset = observations.asset;
  fields.damage = observations.observations;
  sources.asset = sources.damage = observations.source;
  $("reviewed").checked = false;
  sync();
  notice("Asset and damage suggestions added. They remain labelled for review.");
});
$("sample-account").addEventListener("click", () => {
  fields = { ...sample.fields };
  sources = Object.fromEntries(keys.map((k) => [k, "sample"]));
  $("account").value = sample.account;
  $("reviewed").checked = false;
  sync();
  notice("Fictional sample details added. The 92% example assumes a photo and no receipt.");
});
$("extract").addEventListener("click", () =>
  operation(async () => {
    validateFields(fields);
    notice("Organizing your account into draft fields…");
    const result = await api("/api/extract", { text: $("account").value, fields });
    fields = result.fields;
    for (const k of result.changed) sources[k] = "ai-suggestion";
    $("reviewed").checked = false;
    sync();
    notice(
      result.changed.length
        ? "Suggested details added. Review them against your account."
        : "No explicit field updates found. Add an exact date or enter details directly.",
    );
  }),
);
for (const k of keys)
  $(k).addEventListener("input", () => {
    fields[k] = $(k).value;
    sources[k] = "user";
    changed();
  });
$("fields").addEventListener("submit", (e) => e.preventDefault());
$("reviewed").addEventListener("change", render);
function download(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportDraft(asText) {
  try {
    const d = buildDraft({
      id,
      fields,
      sources,
      photo,
      receipt,
      observations,
      reviewed: $("reviewed").checked,
    });
    download(
      id + (asText ? ".yaml" : ".json"),
      asText ? draftText(d) : JSON.stringify(d, null, 2),
      asText ? "text/yaml" : "application/json",
    );
    notice("Draft downloaded for human review. Nothing was submitted to an insurer.");
  } catch (e) {
    notice(e.message, true);
  }
}
$("export-json").addEventListener("click", () => exportDraft(false));
$("export-text").addEventListener("click", () => exportDraft(true));
$("reset").addEventListener("click", () => {
  fields = { ...EMPTY };
  sources = Object.fromEntries(keys.map((k) => [k, "user"]));
  photo = receipt = observations = null;
  id = "DRAFT-" + crypto.randomUUID();
  $("account").value = "";
  $("reviewed").checked = false;
  $("photo").value = $("receipt").value = "";
  sync();
  notice("Fresh draft started. Previous details were cleared from this page.");
});
$("unlock").addEventListener("submit", (e) => {
  e.preventDefault();
  token = $("token").value;
  $("token").value = "";
  $("access").hidden = true;
  notice("Token stored in this page only. It will be checked with your next AI request.");
});
function stopTracks() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  clearInterval(timer);
  timer = null;
}
async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
    throw new Error("Recording is unavailable in this browser. Type your account instead.");
  const mime = ["audio/webm;codecs=opus", "audio/mp4"].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
  if (!mime) throw new Error("This browser has no supported recording format. Type instead.");
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks = [];
  let size = 0,
    tooLarge = false;
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = (e) => {
      size += e.data.size;
      if (size > 5 * 1024 * 1024) {
        tooLarge = true;
        if (recorder.state === "recording") recorder.stop();
      } else if (e.data.size) chunks.push(e.data);
    };
    recorder.onerror = () => {
      recorder.onstop = null;
      stopTracks();
      recording = false;
      render();
      notice("Recording failed. Please type your account.", true);
    };
    recorder.onstop = async () => {
      stopTracks();
      recording = false;
      render();
      await operation(async () => {
        if (tooLarge) throw new Error("Recording exceeded 5 MB. Try a shorter answer.");
        const blob = new Blob(chunks, { type: mime.split(";")[0] });
        if (blob.size < 12) throw new Error("No audio captured. Type your account or try again.");
        notice("Transcribing your answer…");
        const d = await dataURL(blob),
          result = await api("/api/transcribe", {
            upload: {
              name: mime.startsWith("audio/mp4") ? "answer.mp4" : "answer.webm",
              type: blob.type,
              base64: d.split(",")[1],
            },
          });
        $("account").value = result.text;
        notice("Transcript ready. Correct any mistakes, then choose Add details to draft.");
      });
      $("recording-status").textContent = "Review the transcript before using it";
    };
    recorder.start(1000);
    recording = true;
    recordStarted = Date.now();
    render();
    timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - recordStarted) / 1000);
      $("recording-status").textContent = `Recording ${seconds}s / 60s`;
      if (seconds >= 60 && recorder.state === "recording") recorder.stop();
    }, 500);
  } catch (e) {
    stopTracks();
    throw e;
  }
}
$("record").addEventListener("click", async () => {
  if (busy || mode !== "openai") return;
  if (recording) {
    if (recorder?.state === "recording") recorder.stop();
    return;
  }
  busy = true;
  render();
  try {
    await startRecording();
  } catch (e) {
    recording = false;
    stopTracks();
    render();
    notice(
      e.name === "NotAllowedError"
        ? "Microphone permission was not granted. You can type your account instead."
        : e.message,
      true,
    );
  } finally {
    busy = false;
    render();
  }
});
window.addEventListener("pagehide", () => {
  if (recorder?.state === "recording") {
    recorder.onstop = null;
    recorder.stop();
  }
  stopTracks();
});
async function init() {
  try {
    const [c, s] = await Promise.all([fetch("/api/config"), fetch("/sample.json")]);
    if (!c.ok || !s.ok) throw new Error("Could not load the app.");
    const config = await c.json();
    sample = await s.json();
    mode = config.mode;
    $("access").hidden = !config.locked;
    $("mode").textContent = mode === "openai" ? "AI mode" : "Sample / manual";
    $("privacy").textContent =
      mode === "openai"
        ? "Analyze sends the selected photo to OpenAI. Stopping a recording sends its audio for transcription. Add details sends your account and current draft fields. Review the transcript before using it."
        : "Sample mode makes no AI calls. The laptop observations and incident account are fictional fixtures. Enter your own details manually, or connect OpenAI for live analysis and voice.";
    $("recording-status").textContent =
      mode === "openai" ? "Up to 60 seconds. You can also type." : "Voice available in AI mode";
    $("incidentDate").max = new Date().toISOString().slice(0, 10);
    notice("Add a photo or try the fictional sample. Your draft is never submitted automatically.");
    sync();
  } catch (e) {
    notice(e.message, true);
    $("mode").textContent = "Offline";
  }
}
init();
