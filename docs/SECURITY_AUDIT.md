# PermitGrid security & reliability audit

Findings from a focused security/reliability review of the standalone product (not a hackathon
submission). Every finding below was reproduced with a failing test before being fixed, on branch
`security-hardening-audit`. See `docs/HISTORY_LIFECYCLE.md` for the one finding deliberately left
as a documented proposal rather than an implemented fix, and `DEPLOYMENT.md` for the resulting
redeployment record.

## Findings, most severe first

### P0 — `extract_requirements` and `assess_provider` had no caller authorization

**Before this fix:** any wallet could call `extract_requirements(work_order_id)` for any work
order, and `assess_provider(work_order_id, provider_id)` for any pair — both are `@gl.public.write`
methods with no `gl.message.sender_address` check at all, unlike every other mutating method
(`update_regulatory_sources`, `update_credentials` were already creator-gated).

**Impact:** an unrelated third party could force expensive consensus rounds against someone
else's work order/provider pairing, consume their append-only history slots, and — since
`extract_requirements` also changes `status`/`requirement_version` — mutate work-order state a
work order's own creator did not ask for.

**Fix:**
- `extract_requirements`: now requires `gl.message.sender_address == wo.creator`.
- `assess_provider`: now requires the caller to be `wo.creator` OR `provider.creator` — either
  side of the pairing may request the assessment (preserving the legitimate "provider proves
  their own clearance against a work order they didn't create" flow that `/clearance/new`
  supports), but an unrelated third party may not.
- Every `@gl.public.write` method's authorization rule is now documented in one place: the
  docstring on the `PermitGrid` class itself.

**Tests:** `test/test_security_hardening.py::test_extract_requirements_rejects_non_creator`,
`::test_extract_requirements_allows_creator`,
`::test_assess_provider_rejects_unrelated_caller`,
`::test_assess_provider_allows_work_order_creator`,
`::test_assess_provider_allows_provider_creator`, plus regression tests confirming
`update_regulatory_sources`/`update_credentials`'s existing creator-only checks are unchanged.

### P0/P1 — history-exhaustion griefing via the same unauthorized calls

**Before this fix:** the P0 gap above meant an unauthorized caller could exhaust the 100-entry
`requirement_history`/`clearance_history` caps for a pairing they had no stake in.

**Fix:** a direct consequence of the P0 fix — the `raise` now happens before any history mutation,
so an unauthorized call can never reach `history.append(...)`/`hist.append(...)`.

**Tests:** the same P0 tests above additionally assert `len(requirement_history[...])`/
`len(clearance_history[...])` is unchanged after a rejected unauthorized call.

**Residual risk (low severity, documented, not fixed in this pass):** a legitimate creator/
provider can still exhaust their *own* cap through 100+ genuinely repeated actions on their own
entity. This is self-limited (no cross-party griefing) and naturally rate-limited by real
consensus cost. See `docs/HISTORY_LIFECYCLE.md` for a concrete, not-yet-implemented archival
migration design, kept out of this pass per the instruction not to force a risky rewrite.

### P1 — evidence-domain revocation was not enforced at fetch time

**Before this fix:** `_validate_sources` (and therefore the approved-domain allowlist check) only
ran at registration/update time (`register_work_order`, `update_regulatory_sources`,
`update_credentials`). Once a source URL was stored, `extract_requirements`/`assess_provider`
would keep fetching it forever, even after `remove_approved_domain` revoked that host.

**Impact:** domain revocation — the admin's main lever for reacting to a compromised or
decommissioned regulatory/credential source — did not actually stop future fetches of
already-registered URLs on that domain, contradicting its own purpose.

**Fix:** new `_require_sources_still_approved(sources, approved_domains)`, called in both
`extract_requirements` and `assess_provider` immediately before their nondeterministic fetch
block, against the *current* `approved_domains` state. Raises a clear, deterministic
`SOURCE_DOMAIN_REVOKED: ...` error — fails closed, before any consensus round is spent (this
check is pure/deterministic, so it produces the same result for the leader and every validator).
Re-adding the domain restores the ability to fetch.

**Tests:** `test_extract_requirements_blocked_after_domain_revoked`,
`test_extract_requirements_works_again_after_domain_restored`,
`test_assess_provider_blocked_after_credential_domain_revoked`,
`test_assess_provider_works_again_after_credential_domain_restored`.

### P1 — no optimistic version protection before expensive consensus work

**Before this fix:** neither `extract_requirements` nor `assess_provider` accepted an expected
version, so a caller who read stale state (e.g. a UI whose copy of `source_version` is out of
date because another update raced ahead) would only find out after spending a full consensus
round, when the post-write readback failed on the frontend side.

**Fix:** optional, backward-compatible expected-version parameters (default `0` = "skip this
check"):
- `extract_requirements(work_order_id, expected_source_version=0)`
- `assess_provider(work_order_id, provider_id, expected_requirement_version=0, expected_source_version=0, expected_credential_version=0)`

Each is checked once before entering the nondeterministic block (fails fast, before consensus is
spent) and re-checked again immediately before the state-mutating commit (defense against
anything changing during the non-instantaneous consensus round). Frontend callers
(`frontend/src/lib/contract.ts`, `frontend/src/app/work-order/[id]/view.tsx`,
`frontend/src/app/clearance/new/page.tsx`) were updated to pass the versions they just read,
rather than relying on any assumption about default-argument omission over the RPC layer.

**Tests:** `test_extract_requirements_rejects_stale_expected_source_version`,
`test_extract_requirements_accepts_matching_expected_source_version`,
`test_extract_requirements_default_expected_version_skips_check`,
`test_assess_provider_rejects_stale_expected_requirement_version`,
`test_assess_provider_rejects_stale_expected_credential_version`,
`test_assess_provider_accepts_matching_expected_versions`.

### P2 — no admin-key recovery path

**Before this fix:** `admin: Address` was set once in `__init__` with no way to ever change it. A
lost key or a typo'd future setter would have permanently locked every admin-only method
(`add_approved_domain`/`remove_approved_domain`) with no recourse.

**Fix:** two-step rotation — `propose_admin(new_admin)` (current-admin-only, rejects an
empty/malformed address via an explicit `0x`+40-hex check, rejects proposing the current admin
again) and `accept_admin()` (callable only by the exact pending address). A new
`get_pending_admin()` view (empty string when none pending) supports displaying rotation state.

**Tests:** `test_propose_admin_rejects_non_admin`, `test_propose_admin_rejects_malformed_address`,
`test_propose_admin_rejects_same_as_current`, `test_accept_admin_rejects_without_proposal`,
`test_accept_admin_rejects_wrong_caller`, `test_full_admin_rotation_transfers_privileges`
(confirms the old admin loses, and the new admin gains, `add_approved_domain` access).

### P2 — URL validation gaps: IP literals, imprecise userinfo check

**Before this fix:** `_extract_host`/`_validate_url` used manual string slicing. This missed
IPv6 literal hosts (`https://[::1]/x`), decimal/hex-obfuscated IPv4 literals
(`https://2130706433/x` == `127.0.0.1`), and any *public* IP literal used directly as a host
(the private-IP regex only ever covered private ranges) — and its blanket `"@" in url` check
over-rejected a legitimate `@` inside a query string while under-specifying real userinfo
rejection.

**Fix:** refactored to use Python's deterministic standard parser (`urllib.parse.urlsplit`):
precise userinfo rejection via `.username`/`.password`, `.hostname` instead of manual slicing,
and a new `_is_ip_literal_host` check (via `ipaddress.ip_address` plus an explicit decimal/hex
fallback, since `ipaddress` deliberately does not parse non-canonical integer forms) that rejects
*any* literal IP address as a source host — regulatory/credential authorities are always named
domains. Documented explicitly: this cannot prevent DNS rebinding or verify TLS at fetch time;
that's the GenVM host's runtime responsibility, not a pre-fetch string check's.

**Tests:** `test_validate_url_rejects_ipv6_literal`, `test_validate_url_rejects_decimal_ip_obfuscation`,
`test_validate_url_rejects_public_ip_literal`, `test_validate_url_accepts_at_sign_in_query_string`,
`test_validate_url_still_rejects_real_userinfo`.

## Positive end-to-end fixture

`test/test_positive_clearance_fixture.py` — a deterministic (mocked-fetch) fixture, explicitly
labelled as synthetic (`SYNTHETIC_REGISTRY_DOMAIN`, never actually fetched, never to be presented
as real), proving: valid credential → `CLEARED` → gate `true`; wrong identity → not cleared;
missing evidence → raises; a source update → `STALE` → successful reassessment → `CLEARED` again
at the new versions. This is **not** a live multi-validator consensus run — that remains
`test/test_consensus_localnet.py`'s job (needs Docker).

## Considered, not changed: ID squatting

`work_order_id`/`provider_id` are caller-chosen slugs with no per-creator namespacing, so a
popular slug can be "squatted" by registering it first (duplicate-key rejection already prevents
anyone else from later reusing or overwriting it). Considered a namespacing fix
(`f"{creator}:{id}"`) and rejected it: it would break every existing ID/URL and isn't needed to
close an actual security gap. The real identity anchor everywhere in this contract is the
`creator: Address` field (checked on every mutating call) and the assessment's own IDENTITY RULE
(the LLM must match evidence to the specific registered entity, not the slug) — squatting a slug
is a UX annoyance, not a mechanism for forging a clearance or impersonating a real entity's
on-chain identity. No code change made; recorded here as the reasoning for that judgment call.

## Unresolved risks

- **History-cap self-exhaustion** — see `docs/HISTORY_LIFECYCLE.md`.
- **DNS rebinding / TLS identity at fetch time** — out of this contract's enforcement boundary;
  it's the GenVM host/validator runtime's responsibility, not something a pre-fetch string check
  can guarantee. Documented in `_validate_url`'s own docstring.
- **Public-suffix admin-trust edge case** — `add_approved_domain` accepts any syntactically valid
  multi-label domain, including one that happens to be a public suffix (e.g. a state's own `.gov`
  registrar zone). The admin is trusted not to add an overly broad suffix; this is a documented
  operational constraint, not a code-level guard, since distinguishing "real final domain" from
  "public suffix" deterministically would require bundling/maintaining a Public Suffix List,
  which is out of scope for this pass.
- **`genlayer-py`/`genlayer-test`/`web3` Python dependencies are meaningfully behind upstream**
  (see the dependency-audit section of the final report) — not a known CVE, but a real staleness
  gap; no major-version upgrade performed without separately verifying compatibility, per this
  audit's own instruction.
