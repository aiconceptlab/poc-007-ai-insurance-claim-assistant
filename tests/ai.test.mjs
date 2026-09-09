import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EMPTY } from "../lib/claim.mjs";
import { analyzePhoto, extractDetails, transcribe } from "../lib/ai.mjs";
const config = {
  key: "test-key-never-live",
  model: "fixture-model",
  transcriptionModel: "fixture-transcriber",
};
const photo = {
  name: "sample.jpg",
  type: "image/jpeg",
  base64: (
    await readFile(new URL("../public/assets/damaged-laptop.jpg", import.meta.url))
  ).toString("base64"),
};
const observation = {
  asset: "Laptop",
  observations: "The screen appears cracked.",
  uncertainties: "Cause cannot be determined.",
};
const output = (value) => ({
  status: "completed",
  output: [
    {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: JSON.stringify(value) }],
    },
  ],
});
const response = (value) => async () => Response.json(value);
const blank = Object.fromEntries(Object.keys(EMPTY).map((k) => [k, null]));
test("vision sends data URL to Responses with strict structured output and store:false", async () => {
  const result = await analyzePhoto(photo, config, async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const b = JSON.parse(init.body);
    assert.equal(b.store, false);
    assert.equal(b.text.format.strict, true);
    assert.equal(b.text.format.schema.additionalProperties, false);
    assert.equal(b.model, "fixture-model");
    assert.match(b.input[0].content[1].image_url, /^data:image\/jpeg;base64,/);
    assert.ok(init.signal);
    return Response.json(output(observation));
  });
  assert.equal(result.confirmed, false);
  assert.equal(result.source, "ai-suggestion");
});
test("null extraction fields preserve existing user details", async () => {
  const result = await extractDetails(
    "It happened in the kitchen.",
    { ...EMPTY, asset: "My laptop" },
    config,
    response(output({ ...blank, location: "Kitchen" })),
  );
  assert.equal(result.fields.asset, "My laptop");
  assert.equal(result.fields.location, "Kitchen");
  assert.deepEqual(result.changed, ["location"]);
});
test("extraction rejects unsupported category, invalid date and nonstring fields", async () => {
  for (const update of [{ category: "Approved" }, { incidentDate: "2026-02-30" }, { asset: 4 }])
    await assert.rejects(
      extractDetails("My account", EMPTY, config, response(output({ ...blank, ...update }))),
    );
});
test("vision rejects extra keys, long observations and wrong types", async () => {
  for (const v of [
    { ...observation, approved: true },
    { ...observation, asset: 42 },
    { ...observation, observations: "a".repeat(501) },
  ])
    await assert.rejects(analyzePhoto(photo, config, response(output(v))));
});
test("refusals, incomplete responses, missing outputs and invalid JSON fail closed", async () => {
  const refusal = {
    status: "completed",
    output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "No" }] }],
  };
  for (const v of [
    refusal,
    { status: "incomplete", output: [] },
    { status: "completed", output: [] },
    {
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "bad json" }],
        },
      ],
    },
  ])
    await assert.rejects(analyzePhoto(photo, config, response(v)));
});
test("provider HTTP errors and network timeouts never become successful observations", async () => {
  await assert.rejects(
    analyzePhoto(
      photo,
      config,
      async () => new Response("private provider error", { status: 429 }),
    ),
  );
  await assert.rejects(
    analyzePhoto(photo, config, async () => {
      throw new DOMException("timeout", "TimeoutError");
    }),
  );
});
test("transcription uses multipart file and leaves transcript for user review", async () => {
  const audio = {
    name: "answer.webm",
    type: "audio/webm",
    base64: Buffer.from("1a45dfa30000000000000000", "hex").toString("base64"),
  };
  const d = await transcribe(audio, config, async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(init.headers["Content-Type"], undefined);
    assert.ok(init.body instanceof FormData);
    assert.equal(init.body.get("model"), "fixture-transcriber");
    assert.equal(init.body.get("response_format"), "json");
    assert.equal(init.body.get("file").name, "answer.webm");
    return Response.json({ text: "I dropped my laptop." });
  });
  assert.equal(d.reviewRequired, true);
  assert.equal(d.text, "I dropped my laptop.");
});
test("empty or overlong transcript is rejected", async () => {
  const audio = {
    name: "answer.webm",
    type: "audio/webm",
    base64: Buffer.from("1a45dfa30000000000000000", "hex").toString("base64"),
  };
  for (const text of ["", "a".repeat(3001)])
    await assert.rejects(transcribe(audio, config, response({ text })));
});
