import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { analyzePhoto, extractDetails, transcribe } from "./lib/ai.mjs";
import { decodeUpload } from "./lib/uploads.mjs";
import { validateFields } from "./lib/claim.mjs";
const root = new URL("./", import.meta.url);
export function configuration(env = process.env) {
  const c = {
    host: env.HOST || "127.0.0.1",
    port: Number(env.PORT || 3010),
    mode: env.AI_MODE || "demo",
    key: env.OPENAI_API_KEY || "",
    model: env.OPENAI_MODEL || "gpt-4.1-mini-2025-04-14",
    transcriptionModel: env.TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
    token: env.APP_ACCESS_TOKEN || "",
  };
  if (!["demo", "openai"].includes(c.mode)) throw new Error("AI_MODE must be demo or openai.");
  if (c.mode === "openai" && !c.key) throw new Error("Set OPENAI_API_KEY for AI mode.");
  if ((!["127.0.0.1", "localhost", "::1"].includes(c.host) || c.token) && c.token.length < 32)
    throw new Error("Use a 32+ character APP_ACCESS_TOKEN for shared hosting.");
  if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535) throw new Error("Invalid PORT.");
  return c;
}
const files = new Map([
  ["/", ["public/index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["public/style.css", "text/css; charset=utf-8"]],
  ["/app.js", ["public/app.js", "text/javascript; charset=utf-8"]],
  ["/claim.mjs", ["lib/claim.mjs", "text/javascript; charset=utf-8"]],
  ["/assets/damaged-laptop.jpg", ["public/assets/damaged-laptop.jpg", "image/jpeg"]],
  ["/sample.json", ["sample/incident.json", "application/json"]],
]);
async function readBody(req) {
  const chunks = [];
  let n = 0;
  for await (const chunk of req) {
    n += chunk.length;
    if (n > 7200000) throw new Error("Request too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function authorized(header, token) {
  if (!token) return true;
  const a = Buffer.from(header || ""),
    b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createApp(config, { fetchImpl = fetch } = {}) {
  let start = Date.now(),
    calls = 0,
    inflight = 0;
  return http.createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    };
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      if (req.method === "GET" && files.has(path)) {
        const [file, type] = files.get(path),
          data = await readFile(new URL(file, root));
        res.writeHead(200, { "Content-Type": type });
        res.end(data);
        return;
      }
      if (path === "/api/config" && req.method === "GET") {
        send(200, { mode: config.mode, locked: !!config.token });
        return;
      }
      if (!["/api/analyze", "/api/extract", "/api/transcribe"].includes(path)) {
        send(404, { error: "Not found." });
        return;
      }
      if (req.method !== "POST") {
        send(405, { error: "Use POST." });
        return;
      }
      if (!authorized(req.headers.authorization, config.token)) {
        send(401, { error: "Enter a valid shared access token." });
        return;
      }
      if (req.headers["sec-fetch-site"] === "cross-site") {
        send(403, { error: "Cross-site request rejected." });
        return;
      }
      if (!req.headers["content-type"]?.startsWith("application/json")) {
        send(415, { error: "Send application/json." });
        return;
      }
      if (config.mode !== "openai") {
        send(409, {
          error:
            "This is sample/manual mode. Connect OpenAI for photo analysis, extraction and voice transcription.",
        });
        return;
      }
      const b = await readBody(req);
      if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("Invalid request.");
      if (path === "/api/extract") {
        if (
          Object.keys(b).some((k) => !["text", "fields"].includes(k)) ||
          typeof b.text !== "string" ||
          !b.text.trim() ||
          b.text.length > 3000
        )
          throw new Error("Invalid incident account.");
        validateFields(b.fields);
      } else {
        if (Object.keys(b).some((k) => k !== "upload")) throw new Error("Invalid upload request.");
        decodeUpload(b.upload, path === "/api/transcribe" ? "audio" : "image");
      }
      if (Date.now() - start >= 60000) {
        start = Date.now();
        calls = 0;
      }
      if (calls >= 20 || inflight >= 3) {
        send(429, { error: "Request limit reached. Try again in a minute." });
        return;
      }
      calls++;
      inflight++;
      try {
        const result =
          path === "/api/analyze"
            ? await analyzePhoto(b.upload, config, fetchImpl)
            : path === "/api/extract"
              ? await extractDetails(b.text, b.fields, config, fetchImpl)
              : await transcribe(b.upload, config, fetchImpl);
        send(200, result);
      } catch {
        send(502, {
          error:
            "The AI service could not complete this request. Your draft is unchanged. Try again or enter the details manually.",
        });
      } finally {
        inflight--;
      }
    } catch {
      if (!res.headersSent)
        send(400, {
          error:
            "Invalid request. Check the date, text length and supported file type (maximum 5 MB).",
        });
      else res.end();
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const c = configuration(),
    app = createApp(c);
  app.requestTimeout = 30000;
  app.headersTimeout = 15000;
  app.listen(c.port, c.host, () =>
    console.log(`Claim Assistant: http://${c.host}:${c.port} (${c.mode} mode)`),
  );
}
