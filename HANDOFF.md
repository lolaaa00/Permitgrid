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

Docker/localnet is intentionally out of scope for this project's workflow
(not a blocker to work around — this project verifies against real
Studionet instead). This session used the GenLayer CLI (`genlayer` 0.39.2,
the current npm-published version) directly against Studionet
(`https://studio.genlayer.com/api`, chain ID `61999`, confirmed via
`genlayer network info`), with an already-configured, already-unlocked,
GEN-funded local account (`probe`, address
`0xaa18eCD158AEC67c75A51768b747cb3247A21689`, balance 10 GEN at deploy
time) — no private key was requested from or supplied by the user, and none
was created.

- **Real deployment was attempted and broadcast successfully, but contract
  execution itself failed on Studionet — this is a live network-side
  failure, not a missing tool.** `genlayer deploy --contract
  contracts/permitgrid.py --rpc https://studio.genlayer.com/api` signed,
  broadcast, and finalized a real transaction:
  `0x5eb43aa2a7c4ed6c05f146b9bb18f6a9b79221cb30ef8ea3ee8a1449fae0ffd9`
  (recipient/would-be contract address
  `0x86be5deeCab92572fA0Be0AC6669D34d74F35B3a`), reaching validator
  consensus (`MAJORITY_AGREE`, 5 validators, `status_name: FINALIZED`). But
  `genlayer receipt` on that hash shows every validator's
  `leader_receipt`/`genvm_result` returning
  `{status: 'contract_error', payload: 'invalid_contract'}` — the GenVM
  itself rejected contract instantiation, so no contract exists at that
  address (`genlayer schema` / `genlayer code` / `genlayer call` on it all
  return `Contract ... not found`).
  To isolate whether this was specific to `permitgrid.py`, the exact same
  failure (`invalid_contract`, `MAJORITY_AGREE`/`FINALIZED` on an errored
  execution) was reproduced twice more: (1) deploying the unmodified
  `football_bets.py` sample contract generated fresh by `genlayer new`
  (tx `0x140a488035cba28b6005c27c078eae82cbb3cad7e816de9e7f2689a5cf393261`),
  and (2) the same sample with its header changed from
  `py-genlayer:test` to `py-genlayer:latest`
  (tx `0x480cdfd30a266c8fafd32f0d6c2fa6b93bc20a340170ce98929e0e60887160b4`).
  All three deployments — two different contracts, two different
  `Depends` tags — failed identically. This is conclusive evidence the
  failure is a current Studionet-side execution problem, not a defect in
  `contracts/permitgrid.py` or in the deployment process used.
  Because no contract actually exists on-chain, `NEXT_PUBLIC_CONTRACT_ADDRESS`
  was deliberately left unset in the frontend (setting it to a
  non-existent address would silently break the "not configured" fallback
  state and make the frontend appear connected to a contract that isn't
  there).
- **`gltest` against Studionet (no Docker) confirms the same failure.**
  `gltest` supports a `--rpc-url` flag for pointing at a remote network
  instead of localnet; run as
  `python -m pytest test/test_consensus_localnet.py -v --rpc-url https://studio.genlayer.com/api`
  from `.venv` (Python 3.12; the system `python3` is 3.9 and can't import
  `gltest`/`genlayer_py`, which need `collections.abc.Buffer` from 3.12+).
  All 5 tests in `test/test_consensus_localnet.py` failed, this time with
  `gltest.exceptions.DeploymentError: ... Deployment transaction finalized
  with error: ... 'result': {'status': 'contract_error', 'payload':
  'invalid_contract'} ...` — the same GenVM-side rejection, via a
  completely independent code path (gltest's own account/client, not the
  CLI). `test/test_clearance_policy.py`'s 27 tests are pure/deterministic
  and pass with no network dependency, confirmed again this session.
- **No on-chain lifecycle steps (register work order, extract
  requirements, register provider, assess) were possible**, because there
  is no live contract instance to call — every attempt to instantiate one
  on Studionet failed as described above. No lifecycle transactions were
  fabricated; none exist.
- **No production frontend deployment** (e.g. Vercel) — deferred until
  there is a real, working contract address to point it at.

Unblock: retry deployment once GenLayer's Studionet execution layer is
confirmed healthy (e.g. by re-running `genlayer deploy --contract
contracts/permitgrid.py --rpc https://studio.genlayer.com/api` with the
`probe` account, which remains configured and funded), then set
`NEXT_PUBLIC_CONTRACT_ADDRESS` in `frontend/.env.local` and run the full
lifecycle (register work order -> extract requirements -> register
provider + credentials -> assess -> verify clearance + gate -> update
credentials -> prove staleness -> reassess), recording every real tx hash.

## Honest limitation

PermitGrid reaches validator consensus over configured public sources. It
does not itself issue or legally certify licences, and its regulatory/
credential fetch coverage is only as good as the public sources configured
for a given work order or provider.
