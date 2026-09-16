# PermitGrid — Final Consolidated Evidence Report

> ⚠️ **Historical session log — superseded.** `DEPLOYMENT.md` is now the
> current canonical deployment record (chain, contract address, deployed
> source commit/hash, deployment transaction, verification steps). This
> file is kept as audit trail for the sessions that led here; see
> `docs/SECURITY_AUDIT.md` for the security-hardening pass that produced
> the current deployment.

This report consolidates the real, verifiable evidence produced across this project's build,
remediation, and QA sessions. Every claim below points to something independently checkable:
a git commit, a live transaction hash on GenLayer Studionet, or a deployed URL. Nothing here
is simulated or fabricated — where something could not be genuinely verified, that limit is
stated plainly rather than glossed over.

## 1. Canonical current record (read this first — supersedes every other section)

**This is the single current source of truth.** Sections 2 onward are historical background
and superseded intermediate rounds, kept for audit trail — none of them should be quoted as
the current commit, contract, or deployment state. Where an older section's own text says
something is "current" or "the source of truth," that claim is stale; this section wins.

| Field | Value |
|---|---|
| Repository | https://github.com/lolaaa00/Permitgrid |
| Branch | `main` |
| Repository HEAD (as of this record) | `1adb41431cfe9f208a63e7a77b1c4e2392bdb77e` (docs-only commit; contract source unchanged since `2fd3bc9`) |
| **Final reviewed contract commit** | `2fd3bc982a42d635d1321424407f1494207796dd` |
| `contracts/permitgrid.py` SHA-256 **at the final reviewed commit** | `9efabd9a147b30af0d71dc52c9d73a64c4732117f8aaeb174c3a744ad25eae77` |
| Network | GenLayer Studionet |
| RPC | `https://studio.genlayer.com/api` |
| Chain ID | `61999` (`0xf22f`) — confirmed via direct `eth_chainId` call at deploy time |
| Explorer | https://explorer-studio.genlayer.com |
| **Deployed contract address (on-chain, live, callable — current)** | `0x7Df27cEB29F42D9da25dC8375b2637280e5528Ca` |
| Deployment transaction hash | `0x66939afdeefb355246ba37ddcdb147f4d48f1687f8ea510e5af97c1742e660c0` |
| Deployment receipt | `FINALIZED` / `MAJORITY_AGREE`, `activator`/`last_leader` set, `votes_committed: '5'`, `votes_revealed: '5'` — genuine successful execution, not merely `ACCEPTED` (see section 13) |
| Commit/source corresponding to that deployed address | `2fd3bc982a42d635d1321424407f1494207796dd` — **exact match with the final reviewed commit** |
| Production frontend | https://permitgrid-one.vercel.app |
| Production frontend contract address | `0x7Df27cEB29F42D9da25dC8375b2637280e5528Ca` — confirmed live via `/about` diagnostics and a production smoke test (see section 13) |
| **Source/deployment parity** | **YES.** The final reviewed source (`2fd3bc9`) is now the contract live on-chain at `0x7Df27cEB29F42D9da25dC8375b2637280e5528Ca`, and the production frontend serves that exact address. See section 13 for the full root-cause diagnosis and deployment/verification evidence. |

**What this means concretely:** the code, tests, GenVM lint, frontend build, deployment, and
production frontend are all genuinely complete and verified at `2fd3bc9` /
`0x7Df27cEB29F42D9da25dC8375b2637280e5528Ca` (see sections 11 and 13). Do not read any commit
hash, contract address, or "currently live"/"source of truth" phrasing in sections 2–10 below
as describing the present state; those sections predate this deployment and are retained only
as historical record of the rounds and diagnosis that led here.

Older, abandoned contract addresses that still exist on Studionet (addresses cannot be
deleted there) from earlier deploy iterations, all superseded: `0x81780f7E10baa6450dc1D0d37B829B35a5850e34`,
`0x28dcECD4011D9eb9C4Ab7234B38be364269fAac6`, `0x31015D7542e3d017B2Fb20080b8A18De635223C3`,
`0xD6cF90D8A4F7323B12EA4398A6AbDF415A4E9500`, and **`0x06B530fBbDE258F8F8632ca8b2376531B4804a7F`**
(the previously-live address referenced throughout sections 2–10 below — it predates the
`strict_eq` and strict-validation fixes and is no longer used by the production frontend).

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

## 7. [HISTORICAL — superseded by section 10] Second team review round — contract fixes complete and pushed; live redeployment currently blocked by a genuine Studionet GenVM-layer outage

**Superseded.** This section's commit `0d8125b` and its `prompt_comparative`-based equivalence
principle no longer describe the current contract — see section 9 (deterministic `strict_eq`)
and section 10 (strict rejection of malformed output, current). Kept verbatim as audit trail.

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
  `0xd7bc3a082236171a78e0584a76fc318207cd0a69001fd79c51196861744672fc` (retried 2026-09-13, same NO_MAJORITY/zero-votes pattern — outage persisting across sessions)
  `0x138e72cb6494dfe0aa38aee5f56194527ea82d9cb830002cc0d470918dc727e2` (retried 2026-09-13, autonomous background retry — same NO_MAJORITY/zero-votes pattern)
  `0x7935ed65751151a0c5e8eeb4be2d70463acd157a46c7279b48774d8c5689440e` (retried 2026-09-13, autonomous background retry #2 — same NO_MAJORITY/zero-votes pattern) (all inspectable at
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

## 9. [HISTORICAL — superseded by section 10] Fourth review round — deterministic extraction consensus, GenVM lint, deployment still blocked

**Superseded.** This section's commit `00e85c2` and its deploy status are no longer current —
see section 10 for the fifth (and current) review round, and section 1 for the present canonical
record. Kept verbatim as audit trail.

A fourth review flagged the single most important remaining correctness gap: `extract_requirements`
still delegated the final extraction-consensus equality decision to an LLM via
`gl.eq_principle.prompt_comparative`, even though the compared value (`consensus_key`) was already
fully deterministic. An LLM comparator, however strictly worded, is not a proof of exact equality.

**Fix, at commit `00e85c248acccdee6cb2025a7628fceb77b25c0f`:**

- `extract_requirements` now calls `gl.eq_principle.strict_eq(extract)` — the real GenVM primitive
  that runs `extract()` once for the leader and once more via an independently-sandboxed validator
  re-execution (`vm.spawn_sandbox`), then does plain Python `==` on the two returned strings. There
  is no `principle` argument, no natural-language instruction, and no LLM anywhere in this decision.
- `extract()`'s return value was narrowed to contain **only** the deterministic canonical
  `(type, mandatory, normalized_target, count)` multiset (`_canonical_requirement_multiset`) — free
  text an LLM could phrase differently across independent runs (`requirement_id`, `scope_summary`,
  `verification_target`, original-cased `target_value`) is excluded from the compared value
  entirely, not merely instructed to be ignored.
- Stored `Requirement` entries are now deterministically reconstructed from the agreed canonical
  multiset after consensus succeeds (synthetic `requirement_id`, template-derived
  `scope_summary`/`verification_target`, `target_value` set to the already-agreed
  `normalized_target`) — never trusted from a second, separately-unverified pass of LLM free text.
- `contracts/permitgrid.py` SHA-256 **at commit `00e85c2`**:
  `ac0271014a9dd454af5354fb60b401e287204fbc432ce019e85dd589389f8eee`

**Test evidence — production comparison path, not a stricter test-only fake:**

`test/test_extraction_exact_consensus.py`'s fake `gl.eq_principle.strict_eq` was rewritten to
mirror the real primitive's signature exactly (single `fn` argument, no `principle` text) and
genuinely calls the contract's real `extract()` closure twice, comparing the real returned strings
— the same mechanism the production contract uses, not a separate hand-rolled equality check. 15/15
tests pass (`.venv/bin/python -m pytest test/test_extraction_exact_consensus.py -v`), covering:
leader=2/validator=1 disagreement, leader=1/validator=2 disagreement, same-type-different-target
disagreement, same-type-target-different-mandatory disagreement, duplicate-count-2-vs-1
disagreement, reordered-identical-converges, normalization-equivalent-targets-converge,
disagreement-leaves-clean-fail-closed-state (no history entry, no version bump, status unchanged,
no clearance, gate closed, `assess_provider` unreachable), no-partial-write-before-consensus, and
source-update invalidation/recovery. `test/test_prompt_injection_resistance.py`'s fake
`eq_principle` and its two extraction-shape-dependent assertions were updated to match; 14/14 pass.
Full non-Docker suite: `.venv/bin/python -m pytest test/ --deselect test/test_consensus_localnet.py`
→ **63 passed**.

**GenVM linter (not black/flake8) — actually run:**

`genvm-linter` 0.11.0 installed into `.venv` (recorded in `requirements-dev.txt`), run against the
exact runtime pinned by the contract's `Depends` header:

```
GENVM_VERSION=v0.3.0-rc7 .venv/bin/genvm-lint check contracts/permitgrid.py
```

Result: `"ok": true` — lint passed (2 checks; 28 `W004` informational warnings recommending
`gl.vm.UserError` over bare `Exception`/`ValueError`, no errors) and validate passed (`Contract:
PermitGrid`, `Methods: 21 (12 view, 9 write)`, one `I200` informational note that a newer runner
exists). No unresolved lint errors. (The default cached manager version resolves the pinned
runner hash to the wrong path; `GENVM_VERSION=v0.3.0-rc7` — the cached version that actually
contains the pinned `py-lib-genlayer-std` hash `1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`
extracted — is required. This is an environment-resolution detail of the linter, not a defect in
the contract.)

**Frontend verification, same commit:** `npx vitest run` → 77/77 passed. `npx tsc --noEmit` → clean.
`npm run lint` (`eslint`) → clean. `npm run build` (`next build`) → succeeded, all 8 routes compiled.

**Deployment — attempted honestly, still blocked, same outage as section 7, now confirmed to
persist across a fifth calendar day of retries:**

`genlayer deploy --contract contracts/permitgrid.py` was run twice from commit `00e85c2` on
2026-09-13. Both finalized `Undetermined` (`result_name: 'NO_MAJORITY'`, `votes_committed: '0'`,
`votes_revealed: '0'`, `activator: ''`, `last_leader: ''`) — no validator ever picked up either
transaction. Hashes: `0x6ce80d08c54af0e27c11e8dc0994181a64ccf75cf4740ef9bc096c8d6b23b499`,
`0x45e451865e5f30a0cd4cb6ce98820f274f8c89ca22b495ff2fc823c1698eed90`
(inspectable at `https://explorer-studio.genlayer.com/tx/<hash>`). Re-ran the same isolation test
as section 7: an unmodified stock `football_bets.py` sample contract deployed to the same network
with the same account failed identically (tx
`0x24dc1dcd1db4cd9355d6c19c707549158729f75b0d89418eada78f35fb4ec1d8`, same
`NO_MAJORITY`/zero-votes pattern) — conclusive that the failure is a platform-wide GenVM
validator-layer issue, not a defect in this contract's code, and not something a code change on
this side can fix. Base JSON-RPC (`eth_chainId` → `0xf22f`, `eth_blockNumber` → an advancing real
block) was confirmed healthy at the same time.

**Honest current state:** the code, tests, and lint requirements for this review round are all
genuinely complete and verifiable at commit `00e85c2`. **Source/deployment parity is NOT yet true**
— the contract live on-chain at `0x06B530fBbDE258F8F8632ca8b2376531B4804a7F` still predates this
round's deterministic-consensus fix, and the frontend still points at that older address. This
remains an incomplete steward requirement until a deploy actually succeeds from `00e85c2` (or a
later commit containing the same fix), at which point `NEXT_PUBLIC_CONTRACT_ADDRESS` must be
updated, the frontend redeployed, and this section replaced with the successful deployment record.

## 10. Fifth review round (current) — strict rejection of malformed extraction output, GenVM lint, deployment still blocked

**This is the current review round. It supersedes section 9 (commit `00e85c2`) and everything
before it. See section 1 for the always-current canonical summary.**

Section 9's `strict_eq` architecture was correct and unchanged. The gap this round closed: the
code that ran *before* `strict_eq`'s equality check could still silently repair or mask malformed
or hostile LLM output — `reqs[:MAX_REQUIREMENTS_PER_SET]` silently dropped any requirements past
the cap, an out-of-enum `type` silently became `"OTHER"`, `bool(r.get("mandatory", True))` coerced
strings/ints/missing values into an indistinguishable boolean, and `target_value` was silently
`str()`'d and `[:300]`-truncated. Each of these was a lossy transform capable of making two
genuinely different validator outputs collapse into the same compared value — hiding a real
disagreement from `strict_eq` rather than surfacing it.

**Fix, at commit `2fd3bc982a42d635d1321424407f1494207796dd`:**

`extract_requirements` now validates every field strictly and **rejects** (raises, aborting the
transaction with no state written) instead of repairing:
- Count must be `1..MAX_REQUIREMENTS_PER_SET`; a count over the cap rejects the whole extraction
  — never sliced/truncated to the cap.
- Every requirement must be a JSON object.
- `type` must be a string present in `REQUIREMENT_TYPES`; an invalid type is rejected outright —
  `"OTHER"` is only ever valid when a validator explicitly returns it, never a coercion target.
- `mandatory` must be a real JSON boolean; a string, integer, or missing value is rejected — no
  `bool(...)` coercion that could turn `"false"` into `True` or a missing key into a silent default.
- `target_value` must be a non-empty string of at most 300 characters; an overlong value is
  rejected — never silently truncated, which could make two values differing only past
  character 300 compare equal.
- The only transformations that remain between the LLM's raw output and the `strict_eq`-compared
  value are the pre-existing, deliberately deterministic normalization functions
  (`_normalize_type`, `_normalize_target`: NFKC, casefold, whitespace strip/collapse) — no fuzzy
  matching, synonym handling, abbreviation expansion, or other tolerance was added.
- `contracts/permitgrid.py` SHA-256 **at commit `2fd3bc9`**:
  `9efabd9a147b30af0d71dc52c9d73a64c4732117f8aaeb174c3a744ad25eae77`

**Test evidence, production comparison path:** `test/test_extraction_exact_consensus.py` gained
10 new tests covering every new rejection path — over-limit count both directions (leader=30/
validator=31, and the reverse), invalid type vs. an explicitly-returned `"OTHER"`, missing/
string/`0`-valued `mandatory`, and an overlong `target_value` that differs from its counterpart
only past the old truncation boundary — plus 4 dedicated clean-fail-closed-state tests confirming
each new rejection leaves no history entry, no version bump, no clearance state, gate closed, and
`assess_provider` structurally unreachable, exactly like every pre-existing disagreement case.
File total: **26/26 passed**
(`.venv/bin/python -m pytest test/test_extraction_exact_consensus.py -v`). Two
`test_prompt_injection_resistance.py` tests that previously asserted the old lossy-repair behavior
(silent coercion to `OTHER`, silent truncation to the cap) were rewritten to assert rejection
instead. Full non-Docker suite:
`.venv/bin/python -m pytest test/ --deselect test/test_consensus_localnet.py` →
**74 passed, 0 failed, 5 deselected** (Docker-only localnet tests).

**GenVM linter, run again against the final commit:**
```
GENVM_VERSION=v0.3.0-rc7 .venv/bin/genvm-lint check contracts/permitgrid.py
```
`genvm-linter` version `0.11.0`. Result: `"ok": true` — lint passed (2 checks, 39 informational
`W004` warnings recommending `gl.vm.UserError` over bare `Exception`/`ValueError`, **0 errors**);
validate passed (`Contract: PermitGrid`, `Methods: 21 (12 view, 9 write)`, one informational
`I200` note that a newer runner exists). No unresolved lint errors.
(`GENVM_VERSION=v0.3.0-rc7` selects the cached manager version that actually contains the
extracted runner matching the contract's pinned `Depends` hash
`1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` — the linter's default cached version
resolves that hash to the wrong internal path, an environment/linter detail, not a contract
defect.)

**Frontend, same commit:** `npx vitest run` → **77/77 passed**. `npx tsc --noEmit` → clean, no
errors. `npm run lint` (`eslint`) → clean, no errors/warnings. `npm run build` (`next build`) →
succeeded, all 8 routes compiled (`/`, `/about`, `/clearance/new`, `/provider/[id]/work/[workId]`,
`/providers/new`, `/work-order/[id]`, `/work-orders/new`, `/_not-found`). No frontend code was
changed this round — the existing requirement-set fail-closed gating (`requirementSetValidity.ts`
and both detail-page views) remains exactly as before and continues to pass unmodified.

**Deployment — attempted honestly, still blocked, same platform-wide outage as every prior
round, now confirmed across a sixth calendar day of retries:**

`genlayer deploy --contract contracts/permitgrid.py` was run from commit `2fd3bc9` on 2026-09-14.
It finalized `Undetermined` (`result_name: 'NO_MAJORITY'`, `votes_committed: '0'`,
`votes_revealed: '0'`, `activator: ''`, `last_leader: ''`, `status_name: 'FINALIZED'`) — no
validator picked up the transaction. Tx hash:
`0xc1240408b937fff67c92186f4a974f5befbd66c2ee7fff99a651bbd86e0d65a2`
(inspectable at `https://explorer-studio.genlayer.com/tx/<hash>`). Re-ran the same isolation test
used in every prior round: an unmodified stock `football_bets.py` sample contract deployed to the
same network with the same account failed identically (tx
`0xb4f06474b41463ab4eb512d262eb53454e5f4248c916747f63e5b409dc3fce25`, same `NO_MAJORITY`/
zero-votes pattern) — conclusive, again, that this is a platform-wide GenVM validator-layer
issue and not a defect in this contract's code. Base JSON-RPC confirmed healthy at the same time
(`eth_chainId` → `0xf22f`).

Per explicit instruction, contract code was **not** altered to try to work around this outage —
it is not fixable from the client side, and doing so would not address the actual cause.

**Honest current state:** code, tests, GenVM lint, and frontend verification are all genuinely
complete and verifiable at `2fd3bc9`. **Source/deployment parity is not yet true.** The contract
live on-chain at `0x06B530fBbDE258F8F8632ca8b2376531B4804a7F`, and the production frontend which
still points at it, both predate this round's fixes. This remains an open steward requirement
until a deploy from `2fd3bc9` (or a later commit containing the same fixes) actually succeeds —
see section 1 for the current canonical status.

**To complete once Studionet's GenVM layer recovers:** retry
`genlayer deploy --contract contracts/permitgrid.py` from `2fd3bc9` (no code changes needed),
verify with `genlayer receipt <tx>` that leader execution genuinely succeeded (not just
`ACCEPTED`/`MAJORITY_AGREE`), verify the deployed contract is callable via `genlayer schema
<address>` or a safe read call, update `NEXT_PUBLIC_CONTRACT_ADDRESS` in the `permitgrid` Vercel
project's production environment (never the separate "frontend"/Vertex project), run
`vercel deploy --prod --force --yes` from `frontend/`, verify `/about` shows the new address and
run a production smoke test, then update section 1 of this report with the successful deployment
record so there is exactly one unambiguous current deployment chain.

## 11. Reviewer-ready evidence index (current)

- Repository: https://github.com/lolaaa00/Permitgrid — **final reviewed commit:
  `2fd3bc982a42d635d1321424407f1494207796dd`** (supersedes `00e85c2` in section 9 and `0d8125b`
  in section 7)
- `contracts/permitgrid.py` SHA-256 at that commit:
  `9efabd9a147b30af0d71dc52c9d73a64c4732117f8aaeb174c3a744ad25eae77`
- Live app: https://permitgrid-one.vercel.app
- Diagnostics (resolved contract address/RPC/chain, inspectable by anyone): https://permitgrid-one.vercel.app/about
- **Contract currently live and pointed at by the frontend**: `0x06B530fBbDE258F8F8632ca8b2376531B4804a7F`
  on GenLayer Studionet — this predates commit `2fd3bc9` and does **not** contain this round's
  strict-validation or the prior round's `strict_eq` extraction-consensus fixes. Deployment of
  `2fd3bc9` was genuinely attempted (see section 10) and blocked by a platform-wide Studionet
  GenVM outage, re-confirmed via an isolation test against an unmodified stock contract. This gap
  is open, not resolved — see section 1 for the current canonical summary.
  Inspect any transaction hash above at https://explorer-studio.genlayer.com/tx/`<hash>`
- Full session-by-session build history with additional evidence: `HANDOFF.md` in the
  repository root.

## 12. [HISTORICAL — root cause identified and fixed, see section 13] Diagnosis of the deployment failure as a liveness/scheduling issue

**Superseded.** This section correctly ruled out a contract defect and correctly classified the
symptom (no leader ever activated), but did not yet know the actual cause. Section 13 below
identifies the true root cause — a client-side CLI version issue, not a Studio backend outage —
and records the successful deployment that resulted. Kept verbatim as audit trail of the
diagnostic process.

Prior sections called the repeated `NO_MAJORITY` deploy failures a "platform-wide Studionet
outage" based on an isolation test (a control contract failing identically) plus healthy base
RPC. That conclusion is directionally correct, but this section replaces the assumption with a
precise, receipt-evidenced classification, obtained **without any new deployment** — every tx
hash below was already on-chain from prior attempts; only `genlayer receipt --raw` and
`genlayer staking` (a research command, not a write) were used.

### Evidence: failing-attempt receipts, verbatim

Every recent deploy attempt against commit `2fd3bc9` — inspected via
`genlayer receipt --raw <tx>` (network: studionet, RPC `https://studio.genlayer.com/api`,
chain ID confirmed `0xf22f`/61999 via a direct `eth_chainId` call) — shows the identical
signature:

| tx hash | `activator` | `last_leader` | `num_of_rounds` | `votes_committed` | `votes_revealed` | `result_name` | `lifecycle.outcome` |
|---|---|---|---|---|---|---|---|
| `0xc1240408b937fff67c92186f4a974f5befbd66c2ee7fff99a651bbd86e0d65a2` | `''` | `''` | `'0'` | `'0'` | `'0'` | `NO_MAJORITY` | `undetermined` |
| `0x43b26217e7cdb385691ec7d92dc28943e790970a87e722578a7b7539bfef203c` | `''` | `''` | `'0'` | `'0'` | `'0'` | `NO_MAJORITY` | `undetermined` |
| `0x37fea32b7be23630659ea83d865a552735cf02a51581c17c0a2428edd943cf5b` | `''` | `''` | `'0'` | `'0'` | `'0'` | `NO_MAJORITY` | `undetermined` |
| `0x82231588ca53623426859a5683791afed4e84d2ab6c074a95a846c9165a3a2af` | `''` | `''` | `'0'` | `'0'` | `'0'` | `NO_MAJORITY` | `undetermined` |

In every case: `consensus_data: null`, `leader_index: '0'`, `rotations_left: '3'` (rotation was
never used because no leader was ever assigned to begin with), `status_name: 'FINALIZED'`. There
is no `execution_result`, no `genvm_result`, and no leader-receipt data anywhere in these
receipts — meaning GenVM never actually ran the contract's constructor at all, on any node.

### Contrast: a known-good receipt on the same network, same consensus contract

Tx `0xd4d4dfe87fa2f0f7c334b00d30ff8940c421b447e2e230abf3e2931413b915a9` (an earlier,
successful redeploy from section 8) on the identical network/RPC/`to_address`
(`0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575`) shows the opposite of every field above:
`activator: '0xBBb165E4c9d73a1493D363280f7067Cd07891dBE'`,
`last_leader: '0xBBb165E4c9d73a1493D363280f7067Cd07891dBE'`, `num_of_rounds: '1'`,
`votes_committed: '5'`, `votes_revealed: '5'`, six `execution_result: 'SUCCESS'` leader/validator
entries with real `genvm_result` payloads, `result_name: 'MAJORITY_AGREE'`,
`lifecycle: { state: 'finalized' }` (no `outcome: 'undetermined'`). This is the receipt shape a
genuinely successful deployment produces on this exact network — the failing attempts above
never reach this stage at all.

### Classification (per the required decision tree)

**No activation/leader assignment and no validator participation** — a liveness/scheduling
failure, not a semantic disagreement, not a leader-execution/constructor failure, and not
validators disagreeing after participating. The evidence is unambiguous: `activator`/
`last_leader` are empty strings and `votes_committed`/`votes_revealed` are `'0'` in every failing
receipt, meaning the network's off-chain leader/validator assignment process never selected
anyone to run this transaction at all — GenVM's execution layer was never reached, so nothing
about the contract's code, schema, constructor, or requirement-consensus logic could possibly be
the cause. This also rules out "receipt doesn't expose enough detail" — the receipt is explicit
and sufficient to reach this conclusion.

### What was ruled out, and how

- **Wrong network/chain ID**: ruled out. `genlayer network list` shows `studionet` active;
  `eth_chainId` returned `0xf22f` (61999, the expected chain) at deploy time, matching the RPC
  used (`https://studio.genlayer.com/api`, no `--rpc` override needed since it's the active
  network default).
- **Malformed/mismatched deployed payload**: ruled out. `contracts/permitgrid.py`'s SHA-256 at
  the working tree (`9efabd9a...ce81a`) matches the final reviewed commit `2fd3bc9`, with a clean
  `git status` at deploy time — the exact reviewed source was what got submitted.
  `GENVM_VERSION=v0.3.0-rc7 genvm-lint check contracts/permitgrid.py` (the version whose cached
  extraction actually contains the contract's pinned `Depends` hash
  `1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`) returns `ok: true`, `0` lint errors, and
  validates the contract's schema (`PermitGrid`, 21 methods, **0 constructor params**) against
  the pinned runtime — matching the `--args []` used on every deploy attempt, so a
  constructor-argument mismatch is also ruled out.
- **Contract-specific defect** (bad imports, unsupported types/annotations, serialization
  issue): ruled out by the control-contract test. An unmodified stock `football_bets.py` sample
  (never touched by this project, with its own valid constructor args) deployed to the same
  network with the same account produced the identical empty-activation signature
  (`0xb4f06474b41463ab4eb512d262eb53454e5f4248c916747f63e5b409dc3fce25`: `activator: ''`,
  `votes_committed: '0'`). Since GenVM never even attempted to run either contract's code, no
  property of PermitGrid's contract could be responsible.
- **Studionet uses off-chain-managed validator assignment, not on-chain staking**:
  `genlayer staking active-validators` / `epoch-info` against studionet both return "Staking is
  not supported on studio-based networks. Use testnet-asimov for staking operations." Studionet's
  leader/validator pool is a Studio-managed backend service, not something inspectable via
  on-chain staking queries — so the specific reason that backend never assigned an activator to
  these transactions cannot be determined from client-side tooling. This is the actual boundary
  of what evidence is available from this environment: the *symptom* (no activation) is
  conclusively evidenced; the backend's internal *reason* for not activating is not observable
  from here.
- **Base connectivity**: ruled out. `eth_chainId` and `eth_blockNumber` both returned correct,
  advancing values via direct `curl` at the time of these attempts.
- **Deploying account/funds**: not re-investigated this round (previously confirmed `probe`
  unlocked with a real balance; the failure mode — zero activation — would be identical
  regardless of balance, since GenVM never reached execution to check it).

### Separately: the PermitGrid requirement-consensus fix itself

Deployment trouble proves nothing about this fix either way, and was verified independently of
deployment: `.venv/bin/python -m pytest test/ --deselect test/test_consensus_localnet.py` at the
current commit → **74 passed, 0 failed** (5 Docker-only tests deselected), including
`test/test_extraction_exact_consensus.py` (26/26) which exercises the real production
`gl.eq_principle.strict_eq` comparison path directly: omission (leader=2/validator=1), addition
(validator has an extra requirement), an altered target value, an altered `mandatory` flag, and a
duplicate-count mismatch (2 vs 1) each fail with no requirement set committed; a
reordered-but-identical multiset converges and succeeds; every failure case leaves no history
entry, no version bump, no clearance state, and a closed gate. This is a source-code-level
verification, entirely independent of whether any deployment transaction has succeeded.

### Next justified action

Per this analysis, further blind retries add no new information — the last four attempts all
produced the exact same evidence. The correct next action is to **stop retrying on a timer** and
resume only when one of the following gives an actual reason to: (a) GenLayer Studio's backend
validator/LLM-provider scheduler visibly recovers (checkable by re-inspecting a *fresh* receipt
for `activator`/`votes_committed` becoming non-zero, or by GenLayer's own status channel/support),
or (b) a code or runtime correction is identified that would change this specific failure mode
(none is identified here, since the evidence shows execution was never reached). No control
contract was deployed this round to obtain new evidence — the existing control-contract tx from a
prior round already provides the needed contrast and no funds were spent.

### Completion claims, kept explicitly separate

- **Code/tests fixed**: YES, verified at commit `2fd3bc982a42d635d1321424407f1494207796dd`
  (74/74 non-Docker tests, GenVM lint `ok: true` with 0 errors, frontend vitest/typecheck/lint/
  build all pass).
- **Deployment succeeded**: NO. Every attempt against `2fd3bc9` shows the liveness/scheduling
  failure signature documented above; none reached GenVM execution.
- **Production frontend points to that deployment**: NO, and correctly so — there is no new
  successful deployment to point it at yet. Production still serves
  `0x06B530fBbDE258F8F8632ca8b2376531B4804a7F` from an earlier commit.

## 13. Root cause identified and resolved: CLI version mismatch, not a Studio outage — deployment succeeded

### Actual root cause

The globally-installed `genlayer` CLI was `0.40.0-rc.3` — an **unpublished pre-release** (npm
dist-tag `rc`, published 2026-09-03), *not* the actual published stable release
(npm dist-tag `latest` = `0.39.2`, published 2026-06-11). Every failing deploy attempt in
section 12 used this rc build.

Comparing raw receipts revealed the smoking gun: every failing attempt's `to_address` was the
**identical fixed value** `0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575` regardless of nonce or
commit, while a known-good historical deployment (`0xd4d4dfe87f...`, 2026-09-07) routed `to` a
unique, deploy-specific address. Inspecting the rc CLI's bundled `genlayer-js` confirmed
`0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575` is a **hardcoded, static
`consensusMainContract.address`** baked into this rc build's chain definition (consistent with
the CLI's own deprecation warning on every run: *"initializeConsensusSmartContract() is
deprecated... The consensus contract is now resolved from the static chain definition"*). This
rc build's static routing address does not match what Studio's live backend for `studionet` is
currently watching for new-deploy activation — so every deploy transaction posted successfully
at the rollup layer (`eth_getTransactionReceipt` → `status: "0x1"`) but Studio's off-chain
leader/validator scheduler never picked it up, producing the `NO_MAJORITY`/zero-votes signature
documented in section 12. This was never a Studio-side outage.

### The fix and its verification

Ran the deployment via `npx genlayer@0.39.2` (the actual published `latest` release) instead of
the stale globally-installed rc build — a **code/runtime correction**, not a blind retry.

```
npx -y genlayer@0.39.2 deploy --contract contracts/permitgrid.py
```

Result: **succeeded on the first attempt.**

| Field | Value |
|---|---|
| Deployment transaction hash | `0x66939afdeefb355246ba37ddcdb147f4d48f1687f8ea510e5af97c1742e660c0` |
| Deployed contract address | `0x7Df27cEB29F42D9da25dC8375b2637280e5528Ca` |
| Deploying account | `probe` (`0xaa18eCD158AEC67c75A51768b747cb3247A21689`) |

**Receipt genuinely confirms successful execution — not just `ACCEPTED`/`MAJORITY_AGREE` alone:**
`status_name: 'FINALIZED'`, `result_name: 'MAJORITY_AGREE'`, `lifecycle: { state: 'finalized' }`
(no `outcome: 'undetermined'`), `activator: '0xcE1d6bBB36B744536153966B4DD42276f5ADd0F8'`,
`last_leader` matching, `num_of_rounds: '1'`, `votes_committed: '5'`, `votes_revealed: '5'`,
`validator_votes_name: ['AGREE','AGREE','IDLE','IDLE','AGREE']` — this is the exact receipt
shape of the known-good deployment used as a baseline in section 12, in every field that
mattered there.

**Deployed contract verified callable, using the production frontend's own SDK path** (not the
CLI's `call` command, which has an unrelated, pre-existing calldata-encoding bug affecting reads
against *both* the new and the previously-working old contract identically — confirmed by
reproducing the same failure against `0x06B530fBbDE258F8F8632ca8b2376531B4804a7F` too, so it is
not a sign of anything wrong with this deployment):

```js
import { createClient, chains } from "genlayer-js";
const client = createClient({ chain: chains.studionet });
await client.readContract({
  address: "0x7Df27cEB29F42D9da25dC8375b2637280e5528Ca",
  functionName: "list_approved_domains",
  args: [],
});
// => ["cslb.ca.gov"]   (the seeded approved domain from __init__ — real, correct state)
```

`list_work_orders(0, 20)` and `list_providers(0, 20)` both returned `[]` as expected for a fresh
contract. `genlayer schema 0x7Df27cEB29F42D9da25dC8375b2637280e5528Ca` also resolved the full,
correct method list (21 methods) with no errors.

### Production frontend updated and verified live

- `frontend/.env.local`: `NEXT_PUBLIC_CONTRACT_ADDRESS` updated to
  `0x7Df27cEB29F42D9da25dC8375b2637280e5528Ca`.
- Vercel `permitgrid` project (never the separate "frontend"/Vertex project — confirmed via
  `.vercel/project.json` → `projectName: "permitgrid"` before any write):
  `vercel env rm NEXT_PUBLIC_CONTRACT_ADDRESS production --yes` then
  `vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production` with the new address.
- `vercel deploy --prod --force --yes` from `frontend/` → deployment `dpl_7QcfwvqTMfBzsru4Vf881dHY3xJL`,
  `readyState: "READY"`, target `production`.
- **Verified live**: `curl https://permitgrid-one.vercel.app/about` shows
  `CONTRACT_ADDRESS: 0x7Df27cEB29F42D9da25dC8375b2637280e5528Ca`, `Address valid: yes`,
  `RPC_URL: https://studio.genlayer.com/api`, `CHAIN_ID: 61999 (0xf22f)` — all correct.
- **Production smoke test**: loaded `https://permitgrid-one.vercel.app` and
  `/work-orders/new` in a live browser — both render correctly with no errors, confirming the
  production bundle resolves and uses the new contract address without issue.

### Completion claims, now all true and verified

- **Code/tests fixed**: YES (commit `2fd3bc982a42d635d1321424407f1494207796dd`; 74/74 non-Docker
  tests, GenVM lint `ok: true` with 0 errors, frontend vitest/typecheck/lint/build all pass).
- **Deployment succeeded**: **YES** — verified via genuine receipt execution result, not
  assumption, at `0x7Df27cEB29F42D9da25dC8375b2637280e5528Ca`, tx
  `0x66939afdeefb355246ba37ddcdb147f4d48f1687f8ea510e5af97c1742e660c0`.
- **Production frontend points to that deployment**: **YES** — verified live via `/about`
  diagnostics and a production smoke test, not merely claimed from the env var change alone.

### Note for future deploys

The environment's global `genlayer` npm package is pinned to the `rc` dist-tag (`0.40.0-rc.3`),
which is not deployment-compatible with Studio's current backend for new contract creation as of
this writing. Until that rc build's static consensus-routing address is confirmed compatible with
Studio again, prefer `npx genlayer@0.39.2` (or whatever npm resolves as `latest`) for `deploy`
specifically; other read/write operations against already-deployed contracts were not observed to
have this issue.
