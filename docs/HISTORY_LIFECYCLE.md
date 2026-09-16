# History lifecycle: `MAX_HISTORY_ENTRIES` — current limitation and a proposed (not implemented) migration

## Current state

`contracts/permitgrid.py` caps three append-only histories at
`MAX_HISTORY_ENTRIES = 100` entries each:

- `requirement_history[work_order_id]` — one entry per successful `extract_requirements` call.
- `credential_history[provider_id]` — one entry per `update_credentials`/`create_credential_submission` call.
- `clearance_history[work_order_id::provider_id]` — one entry per successful `assess_provider` call.

Once a cap is hit, the corresponding write raises (`"requirement history cap reached"` /
`"credential history cap reached"` / `"clearance history cap reached"`) rather than silently
dropping or overwriting anything — this is correct fail-closed behavior (never lose history
silently), but it does mean that entity permanently cannot record a new entry once its cap is
reached.

## Why this is now lower severity than before this audit

Before this pass, `extract_requirements`/`assess_provider` had no caller authorization at all —
any wallet could exhaust another party's history cap for free (a real griefing vector). Both are
now restricted (work-order-creator-only, and work-order-creator-or-provider-creator,
respectively — see `docs/SECURITY_AUDIT.md`), so an unrelated third party can no longer consume
anyone else's history slots. The only remaining exposure is a legitimate creator/provider
exhausting *their own* cap through 100+ genuinely repeated actions on the same entity — self-
limited, not cross-party griefing, and each call also costs real GenVM consensus (multiple
validators + LLM calls), which is itself a natural rate limiter. This is assessed as **low
severity**, not requiring an emergency fix.

## Why no migration is implemented in this pass

GenVM contract storage (`TreeMap`/`DynArray` fields declared on the contract class) has no live
schema-migration primitive — adding a new storage shape means a new contract deployment with
fresh, empty storage; there is no in-place "add a field to an existing deployed contract's
storage" operation. Any real fix here is itself a deployment-and-migration project, not a
same-day code change, and forcing one in this pass risked exactly the kind of "risky rewrite"
this audit was asked to avoid. Per the audit's own instruction, this is documented as a concrete,
sized proposal instead.

## Proposed design (not implemented)

**Goal:** let a long-lived work order/provider keep going past 100 entries without ever
discarding history, and without a full contract rewrite.

1. **New storage**, added at the next contract redeploy that needs it:

   ```python
   @allow_storage
   @dataclass
   class ArchiveDigest:
       version_range_start: u256
       version_range_end: u256
       content_sha256: str       # sha256 of the canonical JSON of the archived entries
       archived_at: str

   archived_requirement_digests: TreeMap[str, DynArray[ArchiveDigest]]
   archived_credential_digests: TreeMap[str, DynArray[ArchiveDigest]]
   archived_clearance_digests: TreeMap[str, DynArray[ArchiveDigest]]
   ```

2. **New creator-gated write**, e.g. `archive_requirement_history(work_order_id, through_version)`:
   validates the caller is the work-order creator, takes every entry from index `0` through
   `through_version - 1` in `requirement_history[work_order_id]`, computes a deterministic
   `content_sha256` over their canonical JSON serialization, appends one `ArchiveDigest`
   recording the version range and that hash, and — only then — removes those entries from the
   live `DynArray` (shrinking it back below the cap) while leaving the digest as a permanent,
   append-only commitment that those exact entries existed and what they contained.

3. **Auditability is preserved via hash-commitment, not full on-chain replay**: anyone who kept
   the original off-chain record (e.g. from an indexer, an event log, or their own copy) can prove
   it matches the archived range by recomputing the same hash; the chain itself no longer needs to
   store the full entries to prove they were exactly what was committed. This is a real,
   well-understood pattern (the same idea as a merkle/commitment-based rollup), not a novel
   invention, and it is honest about the tradeoff: a party with no independent copy of an archived
   entry cannot reconstruct its contents from the chain alone after archiving — only that
   *something* matching a specific hash existed. `get_requirement_history`/etc. would need to
   report archived ranges as "archived, digest `<hash>`" rather than the removed entries
   themselves.

4. **Trigger point**: this method would only be usable near the cap (e.g. gated to
   `len(history) >= MAX_HISTORY_ENTRIES - 10`), so it's an occasional maintenance action for a
   genuinely long-lived entity, not something exercised in normal use.

## Why this isn't done now

- It requires a new deployed contract address (new storage fields), which this pass's deployment
  is already doing for the P0/P1/P2 fixes — bundling an unvalidated, more speculative storage
  change into the same deploy raised the risk of the deploy the audit asked to keep focused.
- No real work order/provider in this project's actual usage has approached 100 entries — this is
  a forward-looking design for scale this product doesn't have yet, not an active incident.

**Recommendation**: revisit this specific proposal in a dedicated follow-up pass once/if any real
work order or provider approaches the 100-entry cap, rather than shipping it speculatively now.
