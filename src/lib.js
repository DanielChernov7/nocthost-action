"use strict";
// No dependencies: Node 20 has fetch, and the runner protocol is plain files and stdout.
const fs = require("fs");
const crypto = require("crypto");
const net = require("net");

function input(name, fallback = "") {
  const v = process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`];
  return v === undefined || v === "" ? fallback : v.trim();
}

function appendFile(envName, line) {
  const f = process.env[envName];
  if (f) fs.appendFileSync(f, line + "\n");
}

function setOutput(k, v) {
  appendFile("GITHUB_OUTPUT", `${k}=${v}`);
}

function saveState(k, v) {
  appendFile("GITHUB_STATE", `${k}=${v}`);
}

function getState(k) {
  return process.env[`STATE_${k}`] || "";
}

function mask(v) {
  if (v) process.stdout.write(`::add-mask::${v}\n`);
}

function info(msg) {
  process.stdout.write(msg + "\n");
}

function fail(msg) {
  process.stdout.write(`::error::${msg}\n`);
  process.exitCode = 1;
}

// 24 chars, all four character classes, no spaces: passes the API's password rule.
function makePassword() {
  const pick = (set, n) =>
    Array.from(crypto.randomBytes(n), (b) => set[b % set.length]).join("");
  const chars =
    pick("abcdefghijkmnopqrstuvwxyz", 8) +
    pick("ABCDEFGHJKLMNPQRSTUVWXYZ", 6) +
    pick("23456789", 6) +
    pick("-_.+=@%", 4);
  const arr = chars.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

async function api(base, key, method, path, body) {
  const res = await fetch(base.replace(/\/$/, "") + path, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "User-Agent": "nocthost-action",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const msg = (json && (json.error || json.message)) || text.slice(0, 300);
    const err = new Error(`${method} ${path} -> ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

function portOpen(host, port, ms = 4000) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (ok) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(ms, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  input,
  setOutput,
  saveState,
  getState,
  mask,
  info,
  fail,
  makePassword,
  api,
  portOpen,
  sleep,
};
