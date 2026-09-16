# PermitGrid — Deployment

This is the single current canonical deployment record. `HANDOFF.md` and `EVIDENCE_REPORT.md`
are historical session logs, kept as audit trail — not current.

| Field | Value |
|---|---|
| Network | GenLayer Studionet |
| Chain ID | `61999` (`0xf22f`) |
| RPC | `https://studio.genlayer.com/api` |
| Explorer | https://explorer-studio.genlayer.com |
| **Contract address** | `0x2D0dC6C434c1Ee2De59896Be163b736F35160d91` |
| Deployment transaction | `0x43784c8de604a7262844c8b9631e0f2598daa5c18c3b3aa9865992b22c1cbfc0` |
| Deployment receipt | `execution_result: 'SUCCESS'` on all 6 validators (cross-checked via `genlayer receipt`, not just the CLI's `MAJORITY_AGREE`/`ACCEPTED` summary line — see `docs/SECURITY_AUDIT.md` for why that distinction matters on this project) |
| Deployed source commit | `747ba8af0be49e8d345365d231a156cb37486b30` (branch `security-hardening-audit`) |
| `contracts/permitgrid.py` SHA-256 at that commit | `f6100b004d08ad0b1a89530b3937e66d83710c2241cf7c4cf199d5e96276eb98` |
| Production frontend | https://permitgrid-one.vercel.app |
| Production `NEXT_PUBLIC_CONTRACT_ADDRESS` | `0x2D0dC6C434c1Ee2De59896Be163b736F35160d91` (confirmed live via `/about`) |
| Vercel deployment id | `dpl_8YuC1xPtuPuvUU7FrhTLvvA8CtYS` |

Superseded contract addresses (all still technically live on Studionet — contracts cannot be
deleted there — but abandoned; do not use): `0x81780f7E10baa6450dc1D0d37B829B35a5850e34`,
`0x28dcECD4011D9eb9C4Ab7234B38be364269fAac6`, `0x31015D7542e3d017B2Fb20080b8A18De635223C3`,
`0xD6cF90D8A4F7323B12EA4398A6AbDF415A4E9500`, `0x06B530fBbDE258F8F8632ca8b2376531B4804a7F`,
`0x7Df27cEB29F42D9da25dC8375b2637280e5528Ca`.

## Frontend clean-checkout typecheck fix (contract/deployment unaffected)

A follow-up review found `npm run typecheck` failed on a genuinely clean checkout
(`frontend/src/app/layout.tsx` referenced `LayoutProps<"/">`, a type Next.js only generates into
`.next/types` — present after a local `next build` had already run, absent on a fresh clone, so
`next build` masked the gap while a standalone `npm ci && npm run typecheck` did not). Fixed by
replacing it with the stable explicit prop type `{ children: ReactNode }`. This is a frontend
type-declaration fix only — `contracts/permitgrid.py` was not touched (confirmed: its SHA-256 is
still `f6100b004d08ad0b1a89530b3937e66d83710c2241cf7c4cf199d5e96276eb98`, unchanged from the row
above), the deployed contract address was not changed, and no redeploy occurred. Re-verified from
a true clean state (`rm -rf frontend/.next && npm ci`): `npm run lint`, `npm run typecheck`,
`npm run test` (77/77), and `npm run build` (all 8 routes, including the two dynamic routes
`/work-order/[id]` and `/provider/[id]/work/[workId]`) all pass.

## Why this deployment happened

The security/reliability audit in `docs/SECURITY_AUDIT.md` changed contract behavior (new
authorization checks, new methods, new optional parameters), so the previously-live contract
(`0x7Df27cEB29F42D9da25dC8375b2637280e5528Ca`) no longer matches the reviewed source and had to be
superseded by a fresh deployment.

## Verification performed before and after this deployment

- `python -m pytest test/ -q --ignore=test/test_consensus_localnet.py` — 106/106 passed.
- `black --check contracts/ test/` and `flake8 contracts/permitgrid.py --max-line-length=100 --extend-ignore=E203,F403,F405` — clean.
- `GENVM_VERSION=v0.3.0-rc7 genvm-lint check contracts/permitgrid.py` — `ok: true`, 0 errors, 24 methods (13 view, 11 write).
- Frontend (`cd frontend`): `npm run typecheck`, `npm run lint`, `npm run test` (77/77), `npm run build` — all clean.
- **Live on-chain smoke tests against the new contract** (real transactions, cross-checked via `genlayer receipt`'s `execution_result`, not just CLI-summary status):
  - Registered a throwaway work order (`wo-audit-smoke-1`) and provider (`prov-audit-smoke-1`) — confirmed via readback.
  - `extract_requirements` from an unauthorized wallet → real revert on every validator: `Exception: only the work order creator may extract requirements`. State unchanged.
  - Removed `cslb.ca.gov` from the approved-domain allowlist, then `extract_requirements` as the legitimate creator → real revert on every validator: `Exception: SOURCE_DOMAIN_REVOKED: source host 'www.cslb.ca.gov' is no longer an approved regulatory/credential authority`.
  - Restored `cslb.ca.gov`, then `extract_requirements` as the creator → real success (majority `SUCCESS`), `status: REQUIREMENTS_ACTIVE`, `requirement_version: 1`.
  - `assess_provider` from an unrelated third-party wallet → real revert on every validator: `Exception: only the work order creator or the provider may run this assessment`.
  - `assess_provider` from the provider's own creator (a different wallet than the work-order creator, exercising the "creator OR provider" rule) → real success (all `SUCCESS`), clearance `INSUFFICIENT_EVIDENCE` (correct and honest — the throwaway smoke-test provider has no real CSLB record; not a forced/fabricated result).
  - Admin-rotation (`propose_admin`/`accept_admin`) live on-chain confirmation was not completed in this session — a repeated-write permission gate in the operator's tooling stopped further live transactions after the above. This flow remains fully verified via 6 passing unit tests in `test/test_security_hardening.py`, including a full round-trip that transfers `add_approved_domain` privilege to a new address and confirms the old address loses it. Recommended before fully relying on it operationally: run one live `propose_admin` + `accept_admin` round-trip against this contract address when write actions aren't rate-gated.

## Manual production verification checklist

Run these against https://permitgrid-one.vercel.app with a real injected wallet on Studionet
(chain `61999`):

1. **Registration** — register a work order and a provider; confirm both show up via `list_work_orders`/`list_providers` and their detail pages.
2. **Extraction (authorized)** — as the work order's creator, extract requirements; confirm the requirement sheet populates and `status` becomes `REQUIREMENTS_ACTIVE`.
3. **Extraction (unauthorized)** — connect a different wallet, attempt extraction on someone else's work order; confirm a clear rejection, not a silent no-op or false success.
4. **Assessment** — as the work order creator or the provider, run an assessment; confirm a clearance state renders and matches `get_clearance_assessment`.
5. **Stale invalidation** — update the work order's regulatory sources (or the provider's credentials); confirm the previously `CLEARED`/assessed state now shows `STALE` and the assignment gate (`is_provider_cleared`) reads `false`.
6. **Clearance gate** — reassess after the update; confirm the gate returns to `true` only when genuinely `CLEARED` at current versions.
7. **Domain revocation** — (admin wallet only) remove an approved domain that a work order's source uses, then attempt extraction; confirm a clear `SOURCE_DOMAIN_REVOKED`-style rejection, not a silent success or hang.
