"use strict";
// Runs main.js and post.js against a local fake API. No real servers are created.
const http = require("http");
const net = require("net");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const assert = require("assert");

const sshStub = net.createServer((s) => { s.on("error", () => {}); s.end("SSH-2.0-OpenSSH_9.6\r\n"); });
const calls = [];
let polls = 0;
const api = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    calls.push({ m: req.method, u: req.url, auth: req.headers.authorization, body: body && JSON.parse(body) });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url === "/servers") {
      res.statusCode = 202;
      return res.end(JSON.stringify({ server: { id: "srv_1", status: "PROVISIONING" } }));
    }
    if (req.method === "GET" && req.url === "/servers/srv_1") {
      polls++;
      const active = polls >= 2;
      return res.end(JSON.stringify({ server: { id: "srv_1", status: active ? "ACTIVE" : "PROVISIONING", ipv4: active ? "127.0.0.1" : null } }));
    }
    if (req.method === "DELETE" && req.url === "/servers/srv_1") {
      res.statusCode = 202;
      return res.end('{"ok":true}');
    }
    res.statusCode = 404;
    res.end('{"error":"not found"}');
  });
});

function runStep(file, env) {
  return execFileSync(process.execPath, [path.join(__dirname, "..", "src", file)], { env: { ...process.env, ...env }, encoding: "utf8" });
}

(async () => {
  await new Promise((r) => sshStub.listen(0, "127.0.0.1", r));
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${api.address().port}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nh-action-"));
  const out = path.join(dir, "out"), state = path.join(dir, "state");
  fs.writeFileSync(out, ""); fs.writeFileSync(state, "");
  const env = {
    "INPUT_API-KEY": "nh_test", "INPUT_API-URL": base, INPUT_PLAN: "vc2-1c-1gb", INPUT_REGION: "fra",
    INPUT_PROVIDER: "hetzner", "INPUT_WAIT-FOR-SSH": "true", "INPUT_SSH-PORT": String(sshStub.address().port), INPUT_TIMEOUT: "60",
    GITHUB_OUTPUT: out, GITHUB_STATE: state, GITHUB_RUN_ID: "42", GITHUB_RUN_ATTEMPT: "1",
  };
  const log = await new Promise((resolve, reject) => {
    const { execFile } = require("child_process");
    execFile(process.execPath, [path.join(__dirname, "..", "src", "main.js")], { env: { ...process.env, ...env } }, (e, so) => (e ? reject(e) : resolve(so)));
  });
  const outputs = fs.readFileSync(out, "utf8");
  assert.match(outputs, /server-id=srv_1/);
  assert.match(outputs, /ip=127\.0\.0\.1/);
  const pw = outputs.match(/password=(.*)/)[1];
  assert.ok(pw.length === 24 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw), "password rule");
  assert.ok(log.includes(`::add-mask::${pw}`), "password masked");
  assert.ok(log.includes("::add-mask::nh_test"), "key masked");
  const create = calls.find((c) => c.m === "POST");
  assert.deepStrictEqual(
    { label: create.body.label, planId: create.body.planId, regionId: create.body.regionId, providerId: create.body.providerId },
    { label: "gha-42-1", planId: "vc2-1c-1gb", regionId: "fra", providerId: "hetzner" },
  );
  assert.strictEqual(create.auth, "Bearer nh_test");
  assert.match(fs.readFileSync(state, "utf8"), /server_id=srv_1/);

  await new Promise((resolve, reject) => {
    require("child_process").execFile(process.execPath, [path.join(__dirname, "..", "src", "post.js")], { env: { ...process.env, ...env, STATE_server_id: "srv_1" } }, (e, so) => (e ? reject(e) : resolve(so)));
  });
  assert.ok(calls.some((c) => c.m === "DELETE" && c.u === "/servers/srv_1"), "post destroys");
  console.log("ok: create, poll, ssh wait, outputs, masking, destroy");
  api.close(); sshStub.close();
})().catch((e) => { console.error(e); process.exit(1); });
