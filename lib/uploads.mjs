export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export function decodeUpload(value, kind = "image") {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !["name", "type", "base64"].includes(k)) ||
    typeof value.name !== "string" ||
    value.name.length > 160 ||
    !value.name.trim() ||
    typeof value.base64 !== "string" ||
    value.base64.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 ||
    value.base64.length % 4 !== 0 ||
    /[^A-Za-z0-9+/=]/.test(value.base64)
  )
    throw new Error("Invalid upload.");
  const bytes = Buffer.from(value.base64, "base64");
  if (bytes.toString("base64") !== value.base64) throw new Error("Invalid base64.");
  if (bytes.length < 12 || bytes.length > MAX_FILE_BYTES)
    throw new Error("Use a file between 12 bytes and 5 MB.");
  if (kind === "image") {
    const jpeg =
      value.type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const png =
      value.type === "image/png" &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!jpeg && !png) throw new Error("Use a JPEG or PNG photo.");
  } else {
    const webm = value.type === "audio/webm" && bytes.subarray(0, 4).toString("hex") === "1a45dfa3";
    const mp4 = value.type === "audio/mp4" && bytes.subarray(4, 8).toString() === "ftyp";
    const wav =
      value.type === "audio/wav" &&
      bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WAVE";
    if (!webm && !mp4 && !wav) throw new Error("Use WebM, MP4 or WAV audio.");
  }
  return { bytes, type: value.type, name: value.name.replace(/[\x00-\x1f/\\]/g, "_") };
}
