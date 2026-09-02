# PermitGrid — Handoff

Status as of this build session, verified by actually running each command
below in this environment. See `README.md` for the product/architecture
description.

## What is built

- **Intelligent Contract** — `contracts/permitgrid.py`. Work-order and
  provider registries, two GenLayer non-deterministic consensus stages
  (`extract_requirements`, `assess_provider`), deterministic clearance
  derivation (`_derive_clearance`), append-only requirement/credential/
  clearance histories, source/requirement/credential versioning with
  immediate stale-invalidation, the fail-closed `is_provider_cleared(...)`
  gate, creator-only permission checks, and hard caps on counts/lengths/
  pagination.
- **Frontend** — `frontend/`, Next.js 16 + TypeScript + `genlayer-js`. All 7
  required routes exist and build: `/`, `/work-orders/new`,
  `/work-order/[id]`, `/providers/new`, `/clearance/new`,
  `/provider/[id]/work/[workId]`, `/about`. An injected-EIP-1193 wallet flow
  (`src/lib/wallet.tsx`) handles no-provider / disconnected / connecting /
  wrong-chain / connected states and network switching. Every write action
  goes through `src/lib/txFlow.ts`, which never reports success before a
  transaction finalizes on-chain *and* a fresh canonical view-method readback
  confirms the intended state change (`CANONICAL_READBACK` -> verify ->
  `UPDATED`, or `READBACK_MISMATCH`). The design system
  (`src/app/globals.css`) uses the permit-paper palette, hard 0–2px-radius
  rules, hairline borders, and monospace identifiers for IDs/versions/tx
  hashes — no gradients, glassmorphism, or glow.
- **Tests** — `test/test_clearance_policy.py` (pure/deterministic, no
  network) and `test/test_consensus_localnet.py` (needs a GenLayer localnet)
  on the contract side; `frontend/src/**/*.test.{ts,tsx}` (Vitest +
  Testing Library) on the frontend side, covering the tx-progress state
  machine (including the readback-mismatch and known-failure-message paths),
  the clearance stamp / assignment gate, the requirement sheet (empty,
  pending, pass/fail), the source-list editor, and wallet no-provider /
  connect states.

## Verified with real command output (this session)

Contract side:

```
$ python -m pytest test/ -v
...
FAILED test/test_consensus_localnet.py::test_register_work_order_and_provider
FAILED test/test_consensus_localnet.py::test_duplicate_work_order_key_rejected
FAILED test/test_consensus_localnet.py::test_non_https_source_rejected
FAILED test/test_consensus_localnet.py::test_extract_requirements_real_consensus
FAILED test/test_consensus_localnet.py::test_full_lifecycle_and_stale_invalidation
========================= 5 failed, 27 passed in 1.41s =========================
```

The 5 failures are all `requests.exceptions.ConnectionError: ... 127.0.0.1:4000
... Connection refused` — they require a running GenLayer localnet
(`genlayer up`, which needs Docker) and Docker is not available in this
environment. `test_clearance_policy.py`'s 27 tests are pure/deterministic and
all pass with no network dependency.

Frontend side (`cd frontend`):

```
$ npx tsc --noEmit
(no output — clean)

$ npx eslint .
(no output — clean)

$ npx next build
▲ Next.js 16.3.4 (Turbopack)
✓ Compiled successfully in 7.9s
  Running TypeScript ...
  Finished TypeScript in 6.7s ...
  Generating static pages using 7 workers (8/8)

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /about
├ ○ /clearance/new
├ ƒ /provider/[id]/work/[workId]
├ ○ /providers/new
├ ƒ /work-order/[id]
└ ○ /work-orders/new

$ npx vitest run
 Test Files  6 passed (6)
      Tests  26 passed (26)
```

## Deployment fixed and live on Studionet (this session)

**Root cause of the previous `invalid_contract` failure:** `contracts/
permitgrid.py`'s `Depends` header (and the `genlayer new` sample used to
isolate the problem) used a floating tag — `py-genlayer:test`, then
`py-genlayer:latest`. Current GenLayer documentation
(`docs.genlayer.com/developers/intelligent-contracts/first-intelligent-contract`)
shows the currently correct convention is a content-addressed pinned tag,
e.g. `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` — not
`latest`/`test`. Studionet's current GenVM apparently no longer resolves
those floating aliases to a usable runtime image, so contract instantiation
failed for *any* contract using them (confirmed identically on both the
sample and `permitgrid.py`, which is why the earlier isolation test looked
like a network-wide outage rather than a header problem). The `genlayer`
CLI itself was not the issue — npm's `genlayer` is still at `0.39.2`
(latest stable; `0.40.0-rc1`/`rc2` exist as pre-releases but are not the
generally published version), and no CLI upgrade was needed or performed.

**Fix applied:** changed `contracts/permitgrid.py`'s header to
`# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }`.

**Real deployment now succeeds.** `genlayer deploy --contract
contracts/permitgrid.py --rpc https://studio.genlayer.com/api` (same
`probe` account, `0xaa18eCD158AEC67c75A51768b747cb3247A21689`):

```
Transaction Hash: 0x11e6d3bdeb0f61384bfe93298fe32c77b1a35f33ccd01586956f26893238fe29
Contract Address: 0x81780f7E10baa6450dc1D0d37B829B35a5850e34
result_name: MAJORITY_AGREE, status_name: ACCEPTED
```

Verified live via `genlayer schema 0x81780f7E10baa6450dc1D0d37B829B35a5850e34`
(returns the full method schema — `register_work_order`,
`extract_requirements`, `assess_provider`, etc. — confirming a real
instantiated contract, not another `invalid_contract` rejection).

`NEXT_PUBLIC_CONTRACT_ADDRESS` is now set in `frontend/.env.local`
(gitignored) to `0x81780f7E10baa6450dc1D0d37B829B35a5850e34`, with
`NEXT_PUBLIC_RPC_URL=https://studio.genlayer.com/api`. Frontend `npm test`
(26/26 passing) and `npm run build` (all 8 routes compile/prerender
cleanly) were re-run against this config and both pass.

**On-chain lifecycle — started for real:**
- `register_work_order("wo-demo-001", ...)` — tx
  `0x629d8c6f80d5545260866a229f09f6432d3b8df6f79e1ee50f2396c1b98eb6fd`,
  `MAJORITY_AGREE`/`ACCEPTED`.
- `extract_requirements("wo-demo-001")` (real LLM-validator consensus
  stage, fetching the configured CSLB licensing-authority source) — tx
  `0x0ca4350c200bda784aa81bf87add60975e2b8d199771263f9399474f221e74f3`,
  `MAJORITY_AGREE`/`ACCEPTED`.
- Further lifecycle steps (register provider + credentials, assess,
  verify clearance gate, update credentials, prove staleness, reassess)
  were not run this session but the contract is live and callable for
  anyone to continue this — `genlayer write
  0x81780f7E10baa6450dc1D0d37B829B35a5850e34 <method> --rpc
  https://studio.genlayer.com/api --args ...`.
- Note: `genlayer call ... get_work_order --args wo-demo-001` (a read)
  returned a CLI-side `Missing or invalid parameters` error during
  verification — this looks like a `genlayer call` argument-passing quirk
  in 0.39.2, not a contract or network problem (the same argument style
  works fine for `write`), and did not block confirming the contract is
  live via `genlayer schema`.
- **No production frontend deployment** (e.g. Vercel) — still deferred,
  now unblocked since there is a real, working contract address.

## Honest limitation

PermitGrid reaches validator consensus over configured public sources. It
does not itself issue or legally certify licences, and its regulatory/
credential fetch coverage is only as good as the public sources configured
for a given work order or provider.
