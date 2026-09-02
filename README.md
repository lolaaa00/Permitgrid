# PermitGrid

**A consensus-backed regulated-work clearance protocol, built as a GenLayer Intelligent Contract.**

PermitGrid answers one question on-chain, with no trusted off-chain judge:

> Is this provider actually authorised to perform this exact work scope, in this jurisdiction, under the currently configured licensing and regulatory rules?

## The problem

A provider can be licensed without being authorised for every job. Regulated
work depends on licence class, jurisdiction, licence status, professional
registration, company registration, special endorsements, equipment/capacity
class, and supervision rules — usually spread across regulator pages,
licensing classifications, public registers, and technical guidance. A
deterministic smart contract cannot reliably interpret that natural-language
material on its own, a provider should not be able to self-declare
clearance, and a single marketplace or dispatcher should not be the sole
neutral authority either.

## How it works

```
work order
  -> regulatory requirement extraction        (GenLayer consensus stage A)
  -> frozen, versioned requirement set
  -> provider credential evidence
  -> requirement-by-requirement scope assessment (GenLayer consensus stage B)
  -> deterministic work clearance
  -> fail-closed assignment gate: is_provider_cleared(...)
```

**Consensus stage A — requirement extraction.** Given a work order's exact
scope, jurisdiction, and a set of configured public regulatory sources,
GenLayer validators independently fetch those sources and derive a
structured, bounded requirement set (licence class, professional
registration, company registration, special endorsements, jurisdiction
match, supervision, equipment/capacity class). Validators are required to
verify substance — not just that the leader returned syntactically valid
JSON — and equivalence is judged on material decision fields
(`type`, `mandatory`, `target_value`), not identical prose.

**Consensus stage B — provider scope assessment.** Given the frozen
requirement set and a provider's configured public credential evidence
(licence registry, professional register, company register, endorsement
register, certification register, public profile), validators independently
fetch that evidence, establish provider identity, and assess every
requirement, returning one bounded result per requirement: `PASS`,
`PARTIAL`, `FAIL`, `INSUFFICIENT_EVIDENCE`, `NOT_APPLICABLE`, or
`CONFLICTING_EVIDENCE`.

**Deterministic clearance derivation.** The LLM never returns the overall
clearance directly. After consensus, ordinary Python code in the contract
(`_derive_clearance`) walks the per-requirement results with a fixed
precedence — `EXPIRED_OR_INACTIVE` > `OUT_OF_SCOPE` >
`ADDITIONAL_CREDENTIAL_REQUIRED` > `REGULATORY_CONFLICT` >
`INSUFFICIENT_EVIDENCE` > `SUPERVISION_REQUIRED` > `CLEARED` — and produces
one of those seven states.

**Versioning and staleness.** Regulatory source updates bump
`source_version`; requirement rebuilds bump `requirement_version`;
credential updates bump `credential_version`. Every one of these bumps
immediately invalidates the assignment gate — the contract never lets an
assessment computed against old versions silently satisfy a newer version.
Requirement sets and clearance assessments are append-only histories; a
credential/requirement update never rewrites or deletes a past result.

**Fail-closed gate.**

```python
is_provider_cleared(
    work_order_id, provider_id,
    expected_requirement_version, expected_credential_version,
) -> bool
```

returns `True` only when the latest assessment is `CLEARED` *and* its
requirement/source/credential versions all match both the work order's/
provider's current versions *and* the caller's expected versions. Anything
else — missing data, any other clearance state, any version mismatch —
returns `False`.

**Prompt-injection resistance.** All fetched regulatory and credential
content is treated strictly as untrusted data, both in the contract's
instructions to the LLM and in the deterministic post-processing: enum
values outside the allowed set are coerced to conservative defaults
(`OTHER` / `INSUFFICIENT_EVIDENCE`), and a missing per-requirement result is
never silently treated as a pass.

## Repository layout

```
contracts/permitgrid.py        the Intelligent Contract (GenVM / Python)
test/test_clearance_policy.py  deterministic unit tests (no network needed)
test/test_consensus_localnet.py  gltest consensus-path + lifecycle tests
                                  (require Docker + `genlayer up`)
frontend/                      Next.js frontend (genlayer-js, injected wallet)
tools/, config/, deploy/       GenLayer CLI/project scaffolding
gltest.config.yaml             localnet / Studionet network config for gltest
```

## Running the contract tests

Deterministic unit tests (pure Python, no Docker, no network):

```bash
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m pytest test/test_clearance_policy.py -q
```

Consensus-path and full-lifecycle tests (`test/test_consensus_localnet.py`)
require a running GenLayer localnet:

```bash
genlayer up        # starts Docker containers: validators + LLM provider
gltest test/test_consensus_localnet.py
```

## Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_CONTRACT_ADDRESS after deploy
npm run dev
```

The frontend requires an injected EIP-1193 wallet (e.g. MetaMask) connected
to GenLayer Studionet (chain id `61999`) and reads/writes only real chain
state — there is no off-chain clearance backend.

## Studionet

```
RPC       https://studio.genlayer.com/api
Chain ID  61999
Currency  GEN
Explorer  https://explorer-studio.genlayer.com
```

See `HANDOFF.md` for current deployment status and any live transaction
evidence.

## Non-goals

PermitGrid does not rank contractors, measure reputation, handle payments,
provide insurance, resolve disputes, award tenders, issue real-world
licences, or replace professional/legal safety review. It reaches
validator consensus over configured public sources — it does not itself
issue or legally certify licences.
