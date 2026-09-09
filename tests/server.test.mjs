import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp, configuration } from "../server.mjs";
import { EMPTY } from "../lib/claim.mjs";
async function serve(
  t,
  config = configuration({}),
  fetchImpl = async () => {
    throw Error("UNEXPECTED network call");
  },
) {
  const app = createApp(config, { fetchImpl });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  t.after(() => {
    app.closeAllConnections();
    return new Promise((r) => app.close(r));
  });
  return "http://127.0.0.1:" + app.address().port;
}
const live = () => configuration({ AI_MODE: "openai", OPENAI_API_KEY: "fixture-key" });
const post = (url, body = { text: "I dropped my laptop.", fields: EMPTY }, headers = {}) =>
  fetch(url + "/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
test("configuration requires API key, valid mode/port and token for nonloopback host", () => {
  for (const e of [
    { AI_MODE: "openai" },
    { AI_MODE: "fake" },
    { PORT: "0" },
    { HOST: "0.0.0.0" },
    { APP_ACCESS_TOKEN: "short" },
  ])
    assert.throws(() => configuration(e));
  assert.equal(
    configuration({ HOST: "0.0.0.0", APP_ACCESS_TOKEN: "a".repeat(32) }).host,
    "0.0.0.0",
  );
});
test("static allowlist serves app and image but hides source, environment and submission routes", async (t) => {
  const url = await serve(t);
  for (const p of ["/", "/app.js", "/claim.mjs", "/assets/damaged-laptop.jpg", "/sample.json"])
    assert.equal((await fetch(url + p)).status, 200);
  for (const p of ["/.env", "/server.mjs", "/lib/ai.mjs", "/api/approve", "/api/submit"])
    assert.equal((await fetch(url + p)).status, 404);
  const r = await fetch(url);
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(r.headers.get("cache-control"), "no-store");
});
test("sample mode is explicit and never calls AI", async (t) => {
  const url = await serve(t);
  assert.deepEqual(await (await fetch(url + "/api/config")).json(), {
    mode: "demo",
    locked: false,
  });
  assert.equal((await post(url)).status, 409);
});
test("shared token protects AI routes and is not disclosed by config", async (t) => {
  const url = await serve(t, { ...live(), token: "a".repeat(32) });
  assert.equal((await post(url)).status, 401);
  assert.equal((await post(url, undefined, { Authorization: "Bearer wrong" })).status, 401);
  assert.deepEqual(await (await fetch(url + "/api/config")).json(), {
    mode: "openai",
    locked: true,
  });
  assert.equal(
    (await post(url, undefined, { Authorization: "Bearer " + "a".repeat(32) })).status,
    502,
  );
});
test("cross-site, wrong method, content type and malformed fields rejected before AI", async (t) => {
  const url = await serve(t, live());
  assert.equal((await post(url, undefined, { "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await fetch(url + "/api/extract")).status, 405);
  assert.equal((await fetch(url + "/api/extract", { method: "POST", body: "{}" })).status, 415);
  assert.equal((await post(url, { text: "x", fields: {} })).status, 400);
  assert.equal((await post(url, { text: "x", fields: EMPTY, approved: true })).status, 400);
});
test("provider secrets and errors are redacted from API failure", async (t) => {
  const url = await serve(t, live(), async () => {
    throw Error("SECRET provider trace");
  });
  const r = await post(url);
  assert.equal(r.status, 502);
  const text = await r.text();
  assert.ok(!text.includes("SECRET"));
  assert.match(text, /draft is unchanged/);
});
test("per-process budget caps accepted calls at twenty per minute", async (t) => {
  let n = 0;
  const value = {
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, null]))),
          },
        ],
      },
    ],
  };
  const url = await serve(t, live(), async () => {
    n++;
    return Response.json(value);
  });
  for (let i = 0; i < 20; i++) assert.equal((await post(url)).status, 200);
  assert.equal((await post(url)).status, 429);
  assert.equal(n, 20);
});
test("three in-flight calls are allowed, fourth is rejected, capacity recovers", async (t) => {
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  let entered = 0;
  let ready;
  const allEntered = new Promise((r) => {
    ready = r;
  });
  const url = await serve(t, live(), async () => {
    entered++;
    if (entered === 3) ready();
    await gate;
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: JSON.stringify(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, null]))),
            },
          ],
        },
      ],
    });
  });
  const pending = [post(url), post(url), post(url)];
  await allEntered;
  assert.equal((await post(url)).status, 429);
  release();
  assert.deepEqual(
    (await Promise.all(pending)).map((r) => r.status),
    [200, 200, 200],
  );
  assert.equal((await post(url)).status, 200);
});
