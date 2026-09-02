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

## What is NOT done, and why

- **GenLayer localnet consensus tests were not executed.** `gltest`
  requires Docker (`genlayer up` starts validator + LLM-provider
  containers), and Docker is not installed in this build environment.
  `test/test_consensus_localnet.py` is real, runnable test code — not a
  placeholder — it has simply not been run to completion here. Unblock:
  install Docker, then `genlayer up && python -m pytest
  test/test_consensus_localnet.py -v` (or `gltest`).
- **No live Studionet deployment.** No contract address, transaction hash,
  or explorer link exists anywhere in this repository — none have been
  created. Deploying requires a funded GenLayer Studionet account (GEN for
  gas/fees); no such account or funding source is available in this
  environment, and funding a wallet is a decision only a human can make.
  Unblock: fund a Studionet account, then
  `genlayer deploy --contract contracts/permitgrid.py --rpc https://studio.genlayer.com/api`,
  set `NEXT_PUBLIC_CONTRACT_ADDRESS` in `frontend/.env.local`, and run the
  full lifecycle once against it (register work order -> extract
  requirements -> register provider + credentials -> assess -> verify
  clearance + gate -> update credentials -> prove staleness -> reassess),
  recording every real tx hash as it happens.
- **No production frontend deployment** (e.g. Vercel) — deferred until
  there is a real contract address to point it at.

## Honest limitation

PermitGrid reaches validator consensus over configured public sources. It
does not itself issue or legally certify licences, and its regulatory/
credential fetch coverage is only as good as the public sources configured
for a given work order or provider.
