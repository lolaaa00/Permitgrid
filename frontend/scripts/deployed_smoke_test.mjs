#!/usr/bin/env node
// Read-only deployment smoke test for the live configured PermitGrid
// contract on Studionet. Uses genlayer-js the exact same way
// frontend/src/lib/genlayerClient.ts / contract.ts do, so a pass here is
// real evidence the frontend's own call shape works against the real chain
// — not just that the contract exists.
//
// State-changing tests are intentionally NOT here (see
// frontend/scripts/live_lifecycle_qa.mjs, explicitly opt-in, uses
// test-prefixed unique IDs so normal CI runs never create uncontrolled
// live records).
//
// Usage (from frontend/): node scripts/deployed_smoke_test.mjs
//   Reads NEXT_PUBLIC_CONTRACT_ADDRESS / NEXT_PUBLIC_RPC_URL from
//   .env.local if present, else from the environment, else the documented
//   live defaults.

import { createClient } from "genlayer-js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");

function loadEnvLocal() {
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}

const envLocal = loadEnvLocal();
const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  envLocal.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0xD6cF90D8A4F7323B12EA4398A6AbDF415A4E9500";
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || envLocal.NEXT_PUBLIC_RPC_URL || "https://studio.genlayer.com/api";
const CHAIN_ID = 61999;
const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}${detail ? " — " + detail : ""}`);
}

async function main() {
  console.log(`Contract: ${CONTRACT_ADDRESS}`);
  console.log(`RPC:      ${RPC_URL}`);
  console.log(`Chain id: ${CHAIN_ID} (hex ${CHAIN_ID_HEX})`);
  console.log("");

  if (CHAIN_ID_HEX !== "0xf22f") {
    record("chain id hex sanity", false, `expected 0xf22f, computed ${CHAIN_ID_HEX}`);
  } else {
    record("chain id hex sanity", true, CHAIN_ID_HEX);
  }

  const chain = {
    id: CHAIN_ID,
    name: "GenLayer Studio",
    rpcUrls: { default: { http: [RPC_URL] } },
    nativeCurrency: { name: "GenLayer", symbol: "GEN", decimals: 18 },
  };

  let client;
  try {
    client = createClient({ chain, endpoint: RPC_URL });
    record("RPC client construction", true);
  } catch (err) {
    record("RPC client construction", false, String(err));
    printSummary();
    process.exit(1);
  }

  // RPC connectivity + schema/code presence.
  try {
    const schema = await client.getContractSchema(CONTRACT_ADDRESS);
    const methods = Object.keys(schema?.methods ?? {});
    const requiredMethods = [
      "register_work_order",
      "extract_requirements",
      "register_provider",
      "create_credential_submission",
      "update_credentials",
      "assess_provider",
      "get_work_order",
      "get_requirement_set",
      "get_provider",
      "get_clearance_state",
      "get_clearance_assessment",
      "is_provider_cleared",
      "list_work_orders",
      "list_providers",
    ];
    const missing = requiredMethods.filter((m) => !methods.includes(m));
    record(
      "RPC connectivity + contract schema present",
      missing.length === 0,
      missing.length === 0 ? `${methods.length} methods` : `missing: ${missing.join(", ")}`
    );
  } catch (err) {
    record("RPC connectivity + contract schema present", false, String(err));
  }

  async function tryRead(name, fn) {
    try {
      const v = await fn();
      record(name, true, JSON.stringify(v).slice(0, 160));
      return v;
    } catch (err) {
      record(name, false, String(err).slice(0, 200));
      return undefined;
    }
  }

  const view = (functionName, args) =>
    client.readContract({ address: CONTRACT_ADDRESS, functionName, args });

  await tryRead("list_work_orders(0,20)", () => view("list_work_orders", [0, 20]));
  await tryRead("list_providers(0,20)", () => view("list_providers", [0, 20]));
  await tryRead("get_work_order('wo-demo-001')", () => view("get_work_order", ["wo-demo-001"]));
  await tryRead("get_requirement_set('wo-demo-001', 0)", () =>
    view("get_requirement_set", ["wo-demo-001", 0])
  );
  await tryRead("get_provider('prov-demo-001')", () => view("get_provider", ["prov-demo-001"]));
  await tryRead("get_clearance_state('wo-demo-001','prov-demo-001')", () =>
    view("get_clearance_state", ["wo-demo-001", "prov-demo-001"])
  );
  await tryRead("is_provider_cleared('wo-demo-001','prov-demo-001',1,1)", () =>
    view("is_provider_cleared", ["wo-demo-001", "prov-demo-001", 1, 1])
  );

  printSummary();
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

function printSummary() {
  const pass = results.filter((r) => r.ok).length;
  console.log("");
  console.log(`${pass}/${results.length} checks passed.`);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
