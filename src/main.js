"use strict";
const L = require("./lib");

async function run() {
  const key = L.input("api-key");
  if (!key) throw new Error("api-key is required");
  L.mask(key);
  const base = L.input("api-url", "https://api.nocthost.com");
  const timeout = Number(L.input("timeout", "600")) * 1000;
  const runId = process.env.GITHUB_RUN_ID || String(Date.now());
  const attempt = process.env.GITHUB_RUN_ATTEMPT || "1";
  const label = L.input("label", `gha-${runId}-${attempt}`);
  const password = L.makePassword();
  L.mask(password);

  const body = {
    label,
    planId: L.input("plan", "vc2-1c-1gb"),
    regionId: L.input("region", "ams"),
    password,
  };
  const provider = L.input("provider");
  if (provider) body.providerId = provider;
  const osId = L.input("os-id");
  if (osId) body.osId = Number(osId);
  const sshKey = L.input("ssh-key");
  if (sshKey) body.sshKey = sshKey;

  L.info(`Creating ${body.planId} in ${body.regionId}${provider ? ` on ${provider}` : ""} as ${label}`);
  const created = await L.api(base, key, "POST", "/servers", body);
  const id = created && created.server && created.server.id;
  if (!id) throw new Error("API did not return a server id");
  // Save first, so the post step destroys the server even if waiting fails.
  L.saveState("server_id", id);
  L.setOutput("server-id", id);
  L.setOutput("password", password);

  const deadline = Date.now() + timeout;
  let server = created.server;
  while (server.status !== "ACTIVE" || !server.ipv4) {
    if (["ERROR", "DESTROYING", "DESTROYED", "ARCHIVED", "SUSPENDED"].includes(server.status)) {
      throw new Error(`Server ${id} ended in status ${server.status}`);
    }
    if (Date.now() > deadline) throw new Error(`Server ${id} not active after ${timeout / 1000}s`);
    await L.sleep(5000);
    server = (await L.api(base, key, "GET", `/servers/${id}`)).server;
  }
  L.info(`Server ${id} is active at ${server.ipv4}`);
  L.setOutput("ip", server.ipv4);

  if (L.input("wait-for-ssh", "true") === "true") {
    const port = Number(L.input("ssh-port", "22"));
    while (!(await L.portOpen(server.ipv4, port))) {
      if (Date.now() > deadline) throw new Error(`SSH on ${server.ipv4} not reachable in time`);
      await L.sleep(3000);
    }
    L.info(`SSH port ${port} is open`);
  }
}

run().catch((e) => L.fail(e.message));
