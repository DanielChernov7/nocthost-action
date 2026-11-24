"use strict";
const L = require("./lib");

async function run() {
  const id = L.getState("server_id");
  if (!id) return L.info("No server was created, nothing to destroy");
  if (L.input("destroy", "true") !== "true") {
    return L.info(`destroy is false, leaving server ${id} running (it is billed until you delete it)`);
  }
  const key = L.input("api-key");
  L.mask(key);
  const base = L.input("api-url", "https://api.nocthost.com");
  for (let i = 1; i <= 5; i++) {
    try {
      await L.api(base, key, "DELETE", `/servers/${id}`);
      return L.info(`Destroyed server ${id}`);
    } catch (e) {
      if (e.status === 404) return L.info(`Server ${id} is already gone`);
      L.info(`Destroy attempt ${i} failed: ${e.message}`);
      await L.sleep(5000 * i);
    }
  }
  L.fail(`Could not destroy server ${id}. Delete it in the dashboard to stop billing.`);
}

run().catch((e) => L.fail(e.message));
