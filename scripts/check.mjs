import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
async function walk(path) {
  for (const e of await readdir(path, { withFileTypes: true })) {
    if (["node_modules", ".git"].includes(e.name)) continue;
    const p = path + "/" + e.name;
    if (e.isDirectory()) await walk(p);
    else if (/\.(mjs|js)$/.test(p)) {
      const r = spawnSync(process.execPath, ["--check", p], { encoding: "utf8" });
      if (r.status !== 0) throw Error(r.stderr);
    }
  }
}
await walk(".");
for (const f of ["package.json", "sample/incident.json", "marketing/image-prompts.json"])
  JSON.parse(await readFile(f, "utf8"));
for (const f of ["01-cover", "02-evidence", "03-draft", "04-build", "05-cta"]) {
  const b = await readFile("marketing/images/" + f + ".png");
  if (b.readUInt32BE(16) !== 1080 || b.readUInt32BE(20) !== 1440)
    throw Error("Incorrect carousel size: " + f);
}
console.log("Syntax, JSON fixtures and all five 1080 x 1440 images verified.");
