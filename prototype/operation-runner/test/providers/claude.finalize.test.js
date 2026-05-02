const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const claude = require("../../src/providers/claude");

async function tmpdir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), "claude-finalize-"));
}

test("finalizeLastMessage extracts the final result on success", async () => {
  const dir = await tmpdir();
  const eventsPath = path.join(dir, "events.jsonl");
  const lastMessagePath = path.join(dir, "last-message.md");
  await fsp.writeFile(
    eventsPath,
    [
      JSON.stringify({ type: "system", subtype: "init" }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "thinking" }] } }),
      JSON.stringify({ type: "result", subtype: "success", result: "Build wiki finished. Wrote 5 pages." }),
    ].join("\n") + "\n",
  );

  const out = await claude.finalizeLastMessage({ eventsPath, lastMessagePath });

  assert.equal(out.subtype, "success");
  assert.equal(fs.readFileSync(lastMessagePath, "utf8"), "Build wiki finished. Wrote 5 pages.");
});

test("finalizeLastMessage reports error_max_turns subtype", async () => {
  const dir = await tmpdir();
  const eventsPath = path.join(dir, "events.jsonl");
  const lastMessagePath = path.join(dir, "last-message.md");
  await fsp.writeFile(
    eventsPath,
    JSON.stringify({ type: "result", subtype: "error_max_turns", result: "" }) + "\n",
  );

  const out = await claude.finalizeLastMessage({ eventsPath, lastMessagePath });
  assert.equal(out.subtype, "error_max_turns");
});

test("finalizeLastMessage tolerates malformed lines", async () => {
  const dir = await tmpdir();
  const eventsPath = path.join(dir, "events.jsonl");
  const lastMessagePath = path.join(dir, "last-message.md");
  await fsp.writeFile(
    eventsPath,
    [
      "not json",
      JSON.stringify({ type: "result", subtype: "success", result: "ok" }),
      "",
    ].join("\n"),
  );

  const out = await claude.finalizeLastMessage({ eventsPath, lastMessagePath });
  assert.equal(out.subtype, "success");
  assert.equal(fs.readFileSync(lastMessagePath, "utf8"), "ok");
});
