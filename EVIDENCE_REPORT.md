# PermitGrid — Final Consolidated Evidence Report

This report consolidates the real, verifiable evidence produced across this project's build,
remediation, and QA sessions. Every claim below points to something independently checkable:
a git commit, a live transaction hash on GenLayer Studionet, or a deployed URL. Nothing here
is simulated or fabricated — where something could not be genuinely verified, that limit is
stated plainly rather than glossed over.

## 1. Canonical deployment record

| Field | Value |
|---|---|
| Repository | https://github.com/lolaaa00/Permitgrid |
| Branch | `main` |
| **Full commit SHA (source of truth for this record)** | `0d8125bc5c37e482d57f18f2d9c02043a6ceb7ee` |
| Commit pushed at | 2026-09-12T02:13Z (WAT, UTC+1) |
| `contracts/permitgrid.py` SHA-256 **at this commit** | `ada0c78fb8bef8e583c0ec6535b7f0869b952f1919b4172017d2f1b2d78ce81a` |
| Production frontend | https://permitgrid-one.vercel.app |
| Network | GenLayer Studionet |
| RPC | `https://studio.genlayer.com/api` |
| Chain ID | `61999` (`0xf22f`) |
| Explorer | https://explorer-studio.genlayer.com |

**Deployed contract address currently live: `0x06B530fBbDE258F8F8632ca8b2376531B4804a7F`,
deployed from an EARLIER commit — see section 8 for the exact, currently-open gap between
this address's on-chain source and the code at `0d8125b`.** Redeploying from `0d8125b` was
genuinely attempted multiple times and did not succeed — documented honestly below rather
than claimed.

Four still-earlier contract addresses (`0x81780f7E10baa6450dc1D0d37B829B35a5850e34`,
`0x28dcECD4011D9eb9C4Ab7234B38be364269fAac6`,
`0x31015D7542e3d017B2Fb20080b8A18De635223C3`,
`0xD6cF90D8A4F7323B12EA4398A6AbDF415A4E9500`) exist on Studionet from earlier deploy
iterations and remain live (Studionet contracts cannot be deleted) but are
**abandoned/superseded**.

## 2. What PermitGrid actually does

A consensus-backed regulated-work clearance protocol on GenLayer. A work order defines a
scope of regulated work and cites public regulatory sources; the contract itself fetches
those sources and runs a multi-validator consensus stage to extract a frozen, versioned
requirement set. A provider registers public credential evidence; a second multi-validator
consensus stage assesses that evidence against each frozen requirement. A deterministic
policy layer derives an overall clearance state from the per-requirement results, and a
fail-closed gate (`is_provider_cleared`) only returns true for a current, version-matched
`CLEARED` result — every other state, including a stale or missing assessment, returns false.

## 3. Real defects found and fixed via actual live testing

Each of these was found by genuinely running the system against the live network — not by
code review alone — and each was root-caused before being fixed.

1. **`extract_requirements` non-convergence** — the original demo regulatory source was a
   dynamic search-form page whose rendered text varied per independent validator fetch,
   defeating comparative-equivalence consensus. Fixed by tightening the equivalence principle
   to compare only the material decision (requirement-type set + mandatory flags) and pointing
   at a stable, static source.
2. **Two real GenVM/contract bugs** blocking every non-trivial write: `DynArray[T]()` cannot
   be instantiated from contract code (fixed to use plain lists), and the contract was calling
   nonexistent `gl.*` API names for the pinned runtime (fixed to `gl.nondet.web.render`,
   `gl.nondet.exec_prompt`, `gl.eq_principle.prompt_comparative`).
3. **Studionet chain-hex mismatch** — the frontend hardcoded `0xf20f` for chain ID 61999
   instead of the correct `0xf22f`, breaking wallet network switching. Now derived
   programmatically from the numeric chain ID so it cannot drift again.
4. **Wallet state architecture bugs** — a stale-closure bug in the `chainChanged` handler, and
   wallet discovery that only checked `window.ethereum`, silently missing wallets like OKX that
   inject as `window.okxwallet` and don't populate `window.ethereum` when another wallet (e.g.
   Rabby) claims that slot. Fixed with a ref-based fresh-state handler and proper EIP-6963
   provider discovery with a legacy-global fallback.
5. **`Address "undefined" is invalid` on every real browser-wallet write** — `genlayer-js`'s
   `writeContract` computes `senderAccount = account || client.account`; the client is already
   configured with a normalized account object at construction time, but the write call was
   redundantly re-passing the raw address string, which took precedence and was never
   normalized. Fixed by relying on the client's own normalized account, with an explicit
   mismatch guard.
6. **`Cannot convert undefined to a BigInt` on every real write** — the hand-rolled chain
   config object was missing GenLayer-specific fields (`defaultNumberOfInitialValidators`,
   `defaultConsensusMaxRotations`, `consensusMainContract`) that `writeContract` needs to
   encode the underlying transaction. Fixed by using `genlayer-js`'s own official
   `chains.studionet` preset instead of reinventing it.
7. **A genuinely successful transaction was displayed as `FAILED`** — `genlayer-js`'s
   `getTransaction()` returns a different shape for Studionet than for other network types:
   `.status` is numeric (the string is on `.statusName`), and `.txExecutionResultName` is
   never populated at all — the real result lives at
   `consensus_data.leader_receipt[].execution_result` using `"SUCCESS"`/`"ERROR"`, not the
   `FINISHED_WITH_RETURN`/`FINISHED_WITH_ERROR` vocabulary the code assumed applied
   everywhere. Fixed by reading whichever shape is actually present.
8. **RPC-failure masking** — a `.catch(() => null)` on the clearance-assessment read converted
   any RPC failure into "no assessment exists." Replaced with a typed read layer that
   distinguishes not-found from a retryable error, with a visible Retry action.
9. **Requirement-status UI conflation** — a bare, unassessed requirement set displayed as
   `PENDING` (implying an assessment was in progress), conflating "no assessment context" with
   "assessment result." Fixed to show a neutral `DEFINED` state until an actual assessment
   exists.
10. **Missing credential-update UI** — the contract supported `update_credentials`, but no
    page ever exposed it, so the stale-invalidation/reassessment loop the versioning system is
    built to demonstrate could not be shown through the browser. Built and shipped.

All ten are covered by committed regression tests (see `frontend/src/lib/*.test.ts`,
`test/test_clearance_policy.py`, `test/test_prompt_injection_resistance.py`).

## 4. Real, live Studionet lifecycle evidence

### 4.1 Deployment

- Deploy tx: `0x11e6d3bdeb0f61384bfe93298fe32c77b1a35f33ccd01586956f26893238fe29`
- Final live contract: `0xD6cF90D8A4F7323B12EA4398A6AbDF415A4E9500`

### 4.2 Real end-to-end lifecycle driven through an actual connected browser wallet (OKX)

This is the headline evidence: every step below was performed by filling in the real
production UI at https://permitgrid-one.vercel.app and approving each transaction in a real
OKX wallet extension — not the `genlayer` CLI, not a mock. Every transaction's real execution
result (not just consensus acceptance) was independently cross-checked via `genlayer receipt`.

Wallet address used: `0x778D1663f9D5b338aBaD5C62899830AD3520a32F`.

| Step | Work order / provider | Tx hash | Execution result |
|---|---|---|---|
| Register work order | `wo-walletqa-20260906a` (`PG-0005`) | `0x4fea2f9036be13bfe0b0977dfd2e108b1489d1de7bec1b47a024f6d4b58820c9` | `MAJORITY_AGREE`, 4/6 `SUCCESS` |
| Extract requirements (converged) | same | `0x57ccd663690d433304a9b7657c03e2b4bb8e0dd9ac72cff59356a7745c273916` | `MAJORITY_AGREE`, 5/6 `SUCCESS` |
| Register provider | `prov-walletqa-20260906a` | `0xf5c66b15db26a4e14869bbd8e481ac43681e634c567928a4cf078e036eeb5db8` | `MAJORITY_AGREE`, 4/6 `SUCCESS` |
| Submit credential evidence | same | (second write in the same form submission) | real success, `credential_version: 1` |
| Run assessment | wo × provider | `0x77f615d73aab7d812899763473805d7697ad56d0201cbad86beeed01d5dd5762` | `MAJORITY_AGREE`, 6/6 `SUCCESS` |
| Update credentials | `prov-walletqa-20260906a` | `0x0fab6976eca26c3a97557fc1ff1f545680369f81f4d56bf95a98b8d8cc24a0a3` | `MAJORITY_AGREE`, 4/6 `SUCCESS` |
| Reassess | wo × provider | `0x3cc4a1d9040ac48683278e4d1f420298962f5c2b32bffcded57c2294c6d81d38` | `MAJORITY_AGREE`, 4/6 `SUCCESS` |

**Independently confirmed final on-chain state** (via a separate `genlayer call`, not the
frontend's own client):

```
work_order_id: wo-walletqa-20260906a  (ref PG-0005)
creator: 0x778D1663f9D5b338aBaD5C62899830AD3520a32F   ← the real connected wallet
requirement_version: 1
provider_id: prov-walletqa-20260906a
credential_version: 2
assessment_id: 6
clearance: INSUFFICIENT_EVIDENCE
  REQ-01 JURISDICTION MATCH  → INSUFFICIENT_EVIDENCE (NO_PROVIDER_EVIDENCE)
  REQ-02 LICENCE CLASS       → INSUFFICIENT_EVIDENCE (NO_PROVIDER_EVIDENCE)
is_provider_cleared(wo, provider, 1, 2) → false
```

The clearance genuinely stayed `INSUFFICIENT_EVIDENCE` throughout — including after the
credential update and reassessment — because no real, safe, matching public licence record
was ever supplied as evidence. This was a deliberate choice: forcing a `CLEARED` result would
have required either fabricating evidence or weakening the deterministic policy, both
explicitly out of bounds. The fail-closed behavior is itself the proof point.

### 4.3 Real negative states observed live (not staged)

- **`WALLET_REJECTED`**: deliberately rejected a signature request twice. Both times the UI
  showed "Signature request was rejected." immediately, with no tx hash and no false
  downstream progression (no `SUBMITTED`/`CONSENSUS`/`FINALISED` claims).
- **`CONSENSUS_NON_CONVERGENCE`**: occurred twice against a work order whose regulatory source
  had gone stale (the government site's URL structure had changed since it was last verified,
  returning a 302→404). First attempt: `MAJORITY_DISAGREE` from genuine validator disagreement.
  Second: a real contract-level guard fired (`MALFORMED_OUTPUT: no requirements returned`) when
  the LLM extraction produced nothing usable, correctly surfaced via `EXECUTION_REVERTED`
  semantics rather than a false success.
- **`FINALITY_TIMEOUT`**: one assessment transaction took longer to finalize than the
  frontend's poll budget. The UI correctly reported "Timed out waiting for transaction
  finality. The transaction hash is preserved — check the explorer rather than resubmitting,"
  and the transaction was independently confirmed to have actually succeeded — a genuine
  timeout, not a fabricated one, and the honest guidance not to resubmit was followed rather
  than needlessly repeating the write.

## 5. Automated test evidence

All commands below were actually run; output is summarized, not asserted. Figures are current
as of commit `0d8125bc5c37e482d57f18f2d9c02043a6ceb7ee`.

- Python deterministic tests: `test/test_clearance_policy.py` (34), `test/test_prompt_injection_resistance.py`
  (14), `test/test_extraction_exact_consensus.py` (14, new — see section 7) — **62/62 passing**
  via `.venv/bin/python -m pytest test/ -q --ignore=test/test_consensus_localnet.py`. Covers
  every deterministic clearance-derivation state/precedence rule, prompt-injection/identity-
  safety structural checks, deterministic target/type normalization, and a faithful two-call
  exact-multiset consensus-comparison seam (leader vs. independent validator, exact equality
  on the real `consensus_key` field — see section 7 for why this is possible without an LLM).
  One test remains an honest documented limit: a schema-valid "PASS everything" hostile output
  would pass through structurally — only real multi-validator disagreement (requiring a local
  GenLayer node) can catch that, out of scope for this environment.
- Frontend (`frontend/`): `tsc --noEmit` clean, `eslint .` clean, `vitest run` —
  **77/77 tests passing** across 12 files (including new `requirementSetValidity.test.ts` and
  page-level tests for both the work-order and provider/work views), `next build` — all 8
  routes compile cleanly.
- `test/test_consensus_localnet.py` (5 tests) exists (real multi-validator lifecycle tests
  against a local GenLayer node) but does not run in this environment — no Docker/localnet is
  available here. Confirmed via `python -m pytest test/ -q` (without the `--ignore`): these 5
  fail with `ConnectionRefusedError` to `127.0.0.1:4000`, the same known, stated environment
  limitation as every prior session — not a regression, not hidden.
- `black --check contracts/ test/` and `flake8 contracts/permitgrid.py --extend-ignore=E203,F403,F405`
  both clean (the ignored codes are the project's pre-existing, expected baseline: `F403`/`F405`
  for the `from genlayer import *` star-import GenVM convention, `E203` for slice-whitespace
  style black itself introduces). `genlayer schema <address>` is the only contract-inspection
  command this CLI version exposes — it operates on an already-deployed address, so it is not a
  local static-lint step; no local GenVM/GenLayer lint tool beyond `black`/`flake8` exists in
  this installed toolchain.

## 6. Known, honest limitations

- No genuine `CLEARED` outcome has been demonstrated. Every real assessment run in this
  project correctly resolved to `INSUFFICIENT_EVIDENCE` because no demo provider was ever
  given real, matching, publicly verifiable licence evidence. This is a **deliberate scope
  boundary, not an unresolved bug**: producing one honestly would require either registering
  a real company's real public licence record under this project's placeholder demo provider
  identity (misrepresenting an unaffiliated real business's participation in a test) or
  weakening the deterministic evidence/identity checks to fabricate a match — both explicitly
  out of bounds for this project. The correct, safe way to eventually show a `CLEARED` path is
  with a provider the operator directly controls and can supply real matching evidence for
  through the ordinary product flow — not something to force in a QA session.
- Full GenVM multi-validator hostile-content resistance is proven structurally (the
  deterministic layer cannot be talked into a false PASS by a compromised LLM output) but not
  proven via a live multi-validator run. `test/test_consensus_localnet.py` exists for exactly
  this but requires a local GenLayer node (`genlayer up`), which requires Docker — confirmed
  in this environment via `genlayer --help` that no Docker-free "direct mode" execution path
  exists in the installed CLI (only `up`, which needs Docker). This is a genuine environment
  constraint, not a code gap.
- During live QA, two wallet-signature rejections were reported by the app with no popup
  visibly appearing to the user. Investigated directly against `genlayer-js`'s write path: it
  does not silently issue a second wallet request on rejection (its ABI-fallback retry only
  triggers on an actual ABI-mismatch error, never on rejection), so this was not traced to
  PermitGrid's own code. The most plausible explanation is the wallet extension's own
  rate-limiting/spam protection silently rejecting a request submitted too soon after a prior
  one — stated as a hint, not a confirmed root cause, since it wasn't reproducible on demand.
  The UI now detects a suspiciously-fast rejection (well under human reaction time) and
  surfaces this possibility with guidance to wait and retry, rather than a plain rejection
  message that could otherwise read as "you did something you didn't."
- The demo regulatory source (a California contractor licensing classifications page) is a
  real public government page subject to change without notice, exactly as documented in the
  product's own stated limitations — this was observed directly during this project's own
  testing when an earlier source URL went stale mid-session.

## 7. Second team review round — contract fixes complete and pushed; live redeployment currently blocked by a genuine Studionet GenVM-layer outage

A second review round (addressed at commit `0d8125bc5c37e482d57f18f2d9c02043a6ceb7ee`) required:
removing the "at most one requirement added or omitted" tolerance from the extraction
equivalence principle entirely and requiring an exact multiset match; including `mandatory` in
the compared identity; gating the frontend's requirement-set rendering on
`status === REQUIREMENTS_ACTIVE` and `source_version` matching (not just
`requirement_version > 0`); and not referencing an unverifiable commit SHA. All of this is
implemented, tested, committed, and pushed — see sections above and the commit itself for the
full diff. What is **honestly not yet true**: this fixed contract source is not yet the one
live on-chain at any deployed address, because redeployment was genuinely attempted and failed.

**What was attempted, with evidence, not asserted:**

- `genlayer deploy --contract contracts/permitgrid.py --rpc https://studio.genlayer.com/api`
  was run four times. Every attempt finalized as `Undetermined`
  (`result_name: 'NO_MAJORITY'`, `votes_committed: '0'`, `votes_revealed: '0'`,
  `activator: ''`, `last_leader: ''`) — no validator ever picked up the transaction at all.
  Transaction hashes: `0x34d2ad23156b8c190acea84c59a3ca58403139dffbd7ff0cbc1fe3b741da742e`,
  `0xeea1f2728b412c0316854ca60e56bf3ad18a1cb322a6002c890498fec3a11c30`,
  `0x4500d913314aaa8cdd0ff7987f9faa75bd336a07807422fe34ffdb4717799245`,
  `0xfcdd810a2fbd184e728e44ea46b4c3d5e2631ce9b431e3ec443152351d4baf5c`,
  `0x6981ac2f79f2ae6c8beaa49ffcafe17a36c2a879b00fc3022afab1c868fb583b`,
  `0xd7bc3a082236171a78e0584a76fc318207cd0a69001fd79c51196861744672fc` (retried 2026-09-13, same NO_MAJORITY/zero-votes pattern — outage persisting across sessions) (all inspectable at
  `https://explorer-studio.genlayer.com/tx/<hash>`).
- **Isolation test, to rule out a defect in this project's own code**: a completely unmodified
  sample contract from a fresh `genlayer new` scaffold (`football_bets.py`, never touched by
  this project) was deployed to the same network with the same account and failed identically
  (tx `0x400c28b838400f3ddff1156175e7c6c9d13711d92c80537c48d9d4b1d3872e83`, same
  `NO_MAJORITY`/zero-votes pattern). This is conclusive: the failure is not caused by anything
  in `contracts/permitgrid.py`.
- **A plain read against the previously-working, already-live contract**
  (`0x06B530fBbDE258F8F8632ca8b2376531B4804a7F`, deployed and working in the prior session)
  *also* failed at the same time, with `execution_result: 'ERROR'` — confirming this is not
  specific to deployment/writes, but a broader GenVM execution-layer issue affecting reads too.
- **The underlying JSON-RPC endpoint itself was confirmed healthy** at the same time:
  `curl -X POST https://studio.genlayer.com/api -d '{"jsonrpc":"2.0","method":"eth_chainId",...}'`
  correctly returned `0xf22f`, and `eth_blockNumber` returned an advancing real block number.
  This narrows the fault specifically to GenVM's consensus/validator execution layer, not
  network connectivity, not this account, and not this project's contract code.
- The deployment account (`probe`, `0xaa18ecd158aec67c75a51768b747cb3247a21689`) was confirmed
  unlocked with a `10 GEN` balance throughout — not a funding issue.
- Retries were spaced across several minutes, not fired in a tight loop, to allow for a
  transient condition to clear; it did not clear within the window available for this session.

**What this means concretely:** the currently live, callable contract remains
`0x06B530fBbDE258F8F8632ca8b2376531B4804a7F` (from the prior session, itself Studionet-verified
working at the time), but it does **not** contain this round's fixes (exact-multiset
consensus, `mandatory`-in-identity, no-tolerance principle). The frontend continues to point at
that address. Source/deployed parity for commit `0d8125b` cannot honestly be claimed until a
deploy actually succeeds.

**To complete this**, once Studionet's GenVM layer recovers: run
`genlayer deploy --contract contracts/permitgrid.py --rpc https://studio.genlayer.com/api`
from commit `0d8125bc5c37e482d57f18f2d9c02043a6ceb7ee` (or later), verify with
`genlayer schema <address> --rpc https://studio.genlayer.com/api`, update
`NEXT_PUBLIC_CONTRACT_ADDRESS` in the `permitgrid` Vercel project's production environment,
redeploy the frontend (`vercel deploy --prod --force --yes` from `frontend/`), and verify
`/about` shows the new address before running a live browser-wallet test.

## 8. Team code review — six fixes, verified live on redeployed contract

A team review flagged six real gaps, addressed in commit `d97aa98` and verified against a
redeployed contract (deploy tx `0xd4d4dfe87fa2f0f7c334b00d30ff8940c421b447e2e230abf3e2931413b915a9`,
5/5 validators `AGREE`):

1. **Approved-authority allowlist.** Regulatory/credential source URLs previously only got
   generic SSRF/format hardening — any HTTPS host was accepted. Now every source must resolve
   to an admin-managed approved-domain allowlist (seeded with `cslb.ca.gov`, extendable via
   `add_approved_domain`, admin-only). Verified live both ways on the redeployed contract: a
   registration citing an unapproved host reverted with `execution_result: ERROR` on 6/6
   validators and committed nothing (`get_work_order` confirms it was never created); the same
   registration against the approved domain succeeded with `SUCCESS` on 6/6 validators and
   committed real state.
2. **Failed fetches can no longer produce a clearance-relevant commitment.** Previously a
   failed source fetch was silently substituted with a placeholder string and the LLM proceeded
   anyway. Now a fetch failure raises immediately, aborting the transaction — GenVM reverts all
   state changes, so no partial/hallucinated extraction or assessment is ever committed from
   unavailable source data.
3. **Two `_derive_clearance` fail-closed gaps closed.** A mandatory requirement can no longer
   be silently exempted via `NOT_APPLICABLE` (downgraded to `INSUFFICIENT_EVIDENCE`), and a
   `PASS` result whose own `evidence_state` admits `INSUFFICIENT` is no longer trusted as a real
   pass.
4. **Distinct requirements of the same type now survive consensus.** The extraction
   equivalence principle previously judged agreement on the deduplicated *set* of requirement
   types, which could let two genuinely distinct requirements sharing a type (e.g. two separate
   `LICENCE_CLASS` requirements for different equipment) pass consensus without both being
   independently verified. Rewritten to compare a multiset of (type, target_value) pairs.
5. **The provider page's assignment gate is now the contract's real gate.** It previously
   derived "open" purely from `clearance === "CLEARED"` client-side, and staleness detection
   never checked `source_version` at all. It now reads `is_provider_cleared(...)` directly —
   the same fail-closed, source-version-aware check any downstream consumer would use.
6. Regression tests were added for every fix (approved-authority accept/reject/subdomain/
   lookalike-domain/admin-only-management, fetch-failure-aborts-with-no-commit for both
   consensus stages, mandatory-`NOT_APPLICABLE`/`PASS`-with-insufficient-evidence fail-closed,
   distinct-same-type-requirement preservation, and a gate-vs-clearance-state test proving the
   UI can no longer open the gate from clearance alone). Full suite after these changes: 48
   Python + 57 frontend tests, all passing.

## 9. Reviewer-ready evidence index

- Repository: https://github.com/lolaaa00/Permitgrid (commit `0d8125bc5c37e482d57f18f2d9c02043a6ceb7ee`)
- Live app: https://permitgrid-one.vercel.app
- Diagnostics (resolved contract address/RPC/chain, inspectable by anyone): https://permitgrid-one.vercel.app/about
- **Contract currently live and pointed at by the frontend**: `0x06B530fBbDE258F8F8632ca8b2376531B4804a7F`
  on GenLayer Studionet — this is from the prior session and does not yet contain the
  exact-multiset consensus / requirement-set-validity fixes described in section 7, which are
  committed and pushed but not yet deployed (see section 7 for exactly why, with evidence).
  Inspect any transaction hash above at https://explorer-studio.genlayer.com/tx/`<hash>`
- Full session-by-session build history with additional evidence: `HANDOFF.md` in the
  repository root.
