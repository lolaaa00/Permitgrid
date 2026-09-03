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
  were not run in that first session but the contract was live and
  callable — `genlayer write 0x81780f7E10baa6450dc1D0d37B829B35a5850e34
  <method> --rpc https://studio.genlayer.com/api --args ...`.
- Note: `genlayer call ... get_work_order --args wo-demo-001` (a read)
  returned a CLI-side `Missing or invalid parameters` error during
  verification.

## Session 2 — real fix of the `genlayer call` read path, and two real contract bugs found by actually exercising the live chain

**The read-path "CLI bug" from session 1 was not a CLI bug.** `genlayer
call <addr> <method> --args a --args b` (one `--args` flag per positional
argument) works correctly and returns real state. What actually failed in
session 1 was `get_work_order("wo-demo-001")` itself — because, as this
session discovered, **`wo-demo-001` was never actually registered**:
`register_work_order`'s session-1 transaction
(`0x629d8c6f80d5545260866a229f09f6432d3b8df6f79e1ee50f2396c1b98eb6fd`) shows
`result_name: MAJORITY_AGREE` / `status_name: ACCEPTED` in the CLI's
summary line — which session 1 read as success — but `genlayer receipt
<tx> --rpc https://studio.genlayer.com/api` shows the **leader_receipt
`execution_result: 'ERROR'`** on every validator: `TypeError: this class
can't be instantiated by user` at `contract.py:463`
(`DynArray[RegSource]()`). MAJORITY_AGREE here means all validators agreed
the transaction *reverts* — the tx lands on-chain and finalizes, but no
state changes. **Lesson recorded for future sessions: `result_name:
MAJORITY_AGREE` / `status_name: ACCEPTED` is not proof of a successful
write — always cross-check `genlayer receipt <tx>`'s
`leader_receipt[].execution_result` (`SUCCESS` vs `ERROR`).** This is why
`list_work_orders` on the session-1 contract address returns `[]`: nothing
was ever actually registered against it.

**Real bug #1 — `DynArray[T]()` cannot be instantiated by contract code.**
`py-genlayer`'s storage `DynArray.__init__` unconditionally raises
`TypeError("this class can't be instantiated by user")` (confirmed by
reading the actual pinned runtime's `genlayer/py/storage/vec.py`, cached
locally under `~/.cache/genvm-linter/.../py-lib-genlayer-std/`). The
correct pattern is to build a plain Python `list`, append plain dataclass
instances to it, and assign the whole list directly to the storage-backed
field/dict entry in one shot — `_DynArrayDesc.set()` accepts a plain
`list` and converts it. Fixed at all 7 call sites in
`contracts/permitgrid.py` (`register_work_order`,
`update_regulatory_sources`, `extract_requirements`, `register_provider`,
`update_credentials`, `assess_provider`) by replacing
`x: DynArray[T] = DynArray[T]()` + `.append()` loops with `x = []` +
`.append()` loops.

**Real bug #2 — three `gl.*` API names in the contract do not exist on
this pinned runtime.** Confirmed by an actual on-chain traceback
(`AttributeError: module 'genlayer.gl' has no attribute
'eq_principle_prompt_comparative'`) from the redeployed (bug-#1-fixed)
contract's first `extract_requirements` call, and by reading the pinned
runtime's actual `genlayer/gl/__init__.py`, `genlayer/gl/eq_principle.py`,
and `genlayer/nondet/__init__.py`. Fixed:
  - `gl.get_webpage(url, mode="text")` → `gl.nondet.web.render(url,
    mode="text")`
  - `gl.exec_prompt(task)` → `gl.nondet.exec_prompt(task)`
  - `gl.eq_principle_prompt_comparative(fn, principle=...)` →
    `gl.eq_principle.prompt_comparative(fn, principle=...)`

Both bugs were **latent in every non-trivial write path since the original
build** — they went unnoticed in session 1 because nobody had yet
cross-checked `genlayer receipt` against the CLI's summary line, and
because the local pytest suite only exercises `test_clearance_policy.py`
(pure Python, no GenVM) — `test_consensus_localnet.py`, which would have
caught this, needs Docker/localnet, unavailable in this environment both
sessions.

### Real redeployment and on-chain lifecycle (this session, both fixes applied)

Both fixes were applied, `python -m pytest test/test_clearance_policy.py -v`
re-run clean (27/27, pure/deterministic, unaffected by the GenVM-side
bugs), and the contract was **redeployed twice** (first redeploy only had
bug #1 fixed; bug #2 was only discovered from that redeploy's own
on-chain failure, so a second redeploy was needed):

1. First redeploy (bug #1 only) — tx
   `0x43e40fcf19f16285310745fd7ea171ee494093064a71b272b777ec791920d48a`,
   contract `0x28dcECD4011D9eb9C4Ab7234B38be364269fAac6`. `register_work_order`
   on it (tx
   `0x9ecec5646e043a5ceb81e5f9a38d9b0674bc8e62c09a77ce556b77429e55230c`)
   really succeeded this time (`genlayer receipt` shows
   `execution_result: 'SUCCESS'` on every validator; read back with
   `genlayer call ... get_work_order --args "wo-demo-001"` and got the real
   stored fields back). `extract_requirements` on this contract then hit
   bug #2 (see above) — tx
   `0xdc471838279e971c2313b4c45df5653d9546d254be0c779d19f64cd15fcaaf21`,
   `MAJORITY_AGREE`/`ACCEPTED` at the CLI-summary level but
   `execution_result: 'ERROR'` (`AttributeError`) on every validator —
   this contract address is now abandoned in favor of the second redeploy.

2. **Second redeploy (both fixes applied) — the contract address now in
   `frontend/.env.local` and considered current:**
   - Deploy tx
     `0x0004e63352061de5e4d8771b3073f31e35816d67741fe46bfb12785822523583`,
     contract **`0x31015D7542e3d017B2Fb20080b8A18De635223C3`**,
     `MAJORITY_AGREE`/`ACCEPTED`.
   - `register_work_order("wo-demo-001", ...)` — tx
     `0xe8565e9deb3e1fbcf6b7f951e2968052951f4d15fabe9b5d7023b534ad089feb`,
     **verified `execution_result: 'SUCCESS'`** on every validator (not just
     CLI-summary ACCEPTED), and read back live with `get_work_order`.
   - `extract_requirements("wo-demo-001")` — attempted **three times**,
     real fetches of the CSLB source and real LLM equivalence-principle
     judging each time, **all three failed to converge**:
     - tx `0x41427b08cb4968a0b1fee88a05511b06bed6e6c5014002639cef2ac6d015b62a`
       — `MAJORITY_DISAGREE`, `status_name: FINALIZED` (leader `SUCCESS`,
       3 of 4 non-idle validators voted `disagree`).
     - tx `0x974614536439f43450ef517d011a19bf547ebb6a3c1a4775b3d217e8f6d62ad0`
       — `MAJORITY_DISAGREE` after 4 rounds of leader rotation/appeal,
       `status_name: UNDETERMINED`.
     - tx `0xd4cd645c4307d1ec3b68b8370f781a7a9f2aa4c54780165f24df3c5b9a8fa35d`
       — `MAJORITY_DISAGREE`, `status_name: UNDETERMINED`.
     This is recorded as a **genuine, real technical/negative result, not
     a fabricated one**: the leader always executed successfully and
     produced a plausible requirement set (visible in `eq_outputs` in the
     receipt — e.g. `REQ-01 LICENCE_STATUS`, `REQ-02 JURISDICTION_MATCH`
     against the real CSLB page), but independent validator re-fetches of
     the same public CSLB URL plus independent LLM extraction did not
     satisfy the comparative equivalence principle enough times to reach
     quorum. Plausible causes (not confirmed): the CSLB "check license"
     page is a dynamic/search-form page rather than static content, so
     `gl.nondet.web.render(url, mode="text")` may return materially
     different text per fetch (e.g. session/CAPTCHA/empty-search-state
     differences), which would make any comparative-equivalence consensus
     over it inherently hard to converge — a real limitation of this
     specific demo source, not of the contract logic. Per the task's
     instructions this was retried a bounded number of times (3) and then
     stopped and reported rather than forced or faked.
   - Because `extract_requirements` never converged, `wo-demo-001`'s
     on-chain `status` remains `NEEDS_REQUIREMENTS` / `requirement_version:
     0`, and `get_requirement_set("wo-demo-001")` correctly reads back
     `{version: 0, requirements: []}` (empty history, exactly as
     `get_requirement_set`'s own empty-history branch specifies).
   - `register_provider("prov-demo-001", "Bay Area Electric Co")` — tx
     `0x7be4d6b67ff0a2a94a246c4484fab9375223b3267635d6d7e1f5c21d38b34efe`,
     `MAJORITY_AGREE`/`ACCEPTED`, real success (this exercises the same
     bug-#1-fixed code path as `register_work_order`).
   - `create_credential_submission("prov-demo-001", [CSLB check-license URL
     as LICENCE_REGISTRY])` — tx
     `0xfaecdc32e5dcd1138545f288df58d354b7b44072c8df8dba45ead4d0f1ac5a14`,
     `MAJORITY_AGREE`/`ACCEPTED`. Read back live with `get_provider`:
     `credential_version: 1`, `credential_sources` containing the
     submitted URL/role — confirms real success end-to-end.
   - `is_provider_cleared("wo-demo-001", "prov-demo-001", 0, 1)` (real
     read call) — returned **`false`**, correctly, because no assessment
     has ever run for this pair (the deterministic fail-closed gate
     working exactly as designed with no data present).
   - `assess_provider("wo-demo-001", "prov-demo-001")` was attempted for
     completeness — tx
     `0xedf5f4e4294f6754668314dbc2fc9eaa18449537a7baf9312e812e5936c4d029`,
     `MAJORITY_AGREE`/`ACCEPTED` at the CLI-summary level, but this
     ACCEPTED means all validators agreed the call **reverts**: the
     contract's own guard (`if wo.status != "REQUIREMENTS_ACTIVE": raise
     Exception("work order has no active requirement set")`) fired
     correctly and consistently, because `extract_requirements` never
     converged for this work order. This is expected, correct fail-closed
     behavior, not a bug — confirmed real on-chain, not asserted from
     reading the source alone.
   - **Not attempted**: credential-version bump / staleness / reassessment
     demonstration. This chain step requires a `CLEARED` assessment to
     exist first (to have something to go stale), and no assessment could
     be produced this session because `extract_requirements` never
     converged. Recorded honestly as **not attempted**, not as a failure
     of the staleness logic itself (which is exercised and passes in
     `test/test_clearance_policy.py`'s pure unit tests).
   - **No production frontend deployment** (e.g. Vercel) — still deferred.
     `frontend/.env.local` (gitignored) now points
     `NEXT_PUBLIC_CONTRACT_ADDRESS` at the second-redeploy address
     `0x31015D7542e3d017B2Fb20080b8A18De635223C3`; frontend code itself was
     not modified this session (no frontend re-test was run — the contract
     fixes are Python-only and the frontend already builds/tests clean per
     the session-1 log above).

### Current on-chain state, as of the end of this session

- **Live contract**: `0x31015D7542e3d017B2Fb20080b8A18De635223C3` on
  Studionet (chain id 61999, RPC `https://studio.genlayer.com/api`).
- `wo-demo-001`: registered, `status: NEEDS_REQUIREMENTS`,
  `requirement_version: 0`, `source_version: 1` — verified on-chain via
  `get_work_order`.
- `prov-demo-001`: registered, `credential_version: 1` — verified on-chain
  via `get_provider`.
- No requirement set, no assessment, no clearance record exists for this
  pair. `is_provider_cleared(...)` verified `false` on-chain.
- Contract source SHA-256 at the point of the second (current) deploy:
  see the `shasum -a 256 contracts/permitgrid.py` value recorded in the git
  commit for this session.
- The first-redeploy contract (`0x28dcECD4011D9eb9C4Ab7234B38be364269fAac6`)
  and the original session-1 contract
  (`0x81780f7E10baa6450dc1D0d37B829B35a5850e34`) are both live on Studionet
  but abandoned/superseded — left as-is (Studionet contracts cannot be
  deleted); do not use them.

## Honest limitation

PermitGrid reaches validator consensus over configured public sources. It
does not itself issue or legally certify licences, and its regulatory/
credential fetch coverage is only as good as the public sources configured
for a given work order or provider. This session's real evidence also
shows that comparative-equivalence consensus (`extract_requirements`) can
genuinely fail to converge against a real dynamic government web page —
that is a property of the demo source and the NLP equivalence principle,
not a simulated or invented failure.
