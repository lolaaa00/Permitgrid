"""
Exact-multiset extraction-consensus regression tests.

This is a distinct, more faithful executable seam than the single-call
stub used elsewhere in this project's test suite. Because the extraction
equivalence comparison is now fully deterministic (see
`_canonical_requirement_multiset`/`_normalize_target`/`_normalize_type` in
contracts/permitgrid.py), the actual consensus DECISION — not just the
prompt text asking for it — can be faithfully replicated in plain pytest:
this file's fake `gl.eq_principle.prompt_comparative` genuinely calls the
real `extract()` closure TWICE (once standing in for the leader, once for
an independent validator), each time with a different queued
`gl.nondet.exec_prompt` response, and then applies the exact same
mechanical equality check on the real `consensus_key` field both real
calls computed — same rule the real principle text instructs an LLM
comparator to apply, just executed directly in Python instead of via an
LLM, which is possible precisely because that comparison was deliberately
made deterministic.

What this does NOT prove: that a real LLM validator, given the same
regulatory source text, would independently produce a JSON extraction
whose `consensus_key` genuinely matches or mismatches as these fixtures
assert — that still requires a real multi-validator GenVM run (Docker +
`genlayer up`, see test/test_consensus_localnet.py). What this DOES prove,
for real, with no mocks around the decision logic itself: that the
contract's actual consensus-comparison RULE — exact multiset equality on
(type, mandatory, normalized_target), cardinality preserved, no
tolerance — behaves exactly as specified for a fixed pair of leader/
validator outputs, and that a genuine mismatch commits nothing.
"""

import importlib.util
import json
import os
import sys
import types

import pytest

CONTRACT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "contracts", "permitgrid.py"
)


def _load_contract_module():
    fake_genlayer = types.ModuleType("genlayer")

    class _FakeAddress(str):
        @property
        def as_hex(self):
            return str(self)

    class _web:
        render = staticmethod(lambda url, mode="text": "benign content")

    class _nondet:
        web = _web
        exec_prompt = staticmethod(lambda task: "{}")

    class _eq_principle:
        @staticmethod
        def prompt_comparative(fn, principle=""):
            """Faithful two-call seam — see module docstring. Calls `fn`
            twice (leader, then validator), compares their real
            `consensus_key` fields with exact equality (mirroring the
            no-tolerance mechanical rule given to the real LLM comparator),
            and raises on any mismatch — simulating GenVM's revert-the-
            whole-transaction behavior on validator disagreement."""
            leader_raw = fn()
            validator_raw = fn()
            leader_key = json.loads(leader_raw).get("consensus_key")
            validator_key = json.loads(validator_raw).get("consensus_key")
            if leader_key != validator_key:
                raise Exception(
                    "CONSENSUS_NON_CONVERGENCE: validators disagree on the "
                    "extracted requirement set"
                )
            return leader_raw

    class _FakeGL:
        class message:
            sender_address = _FakeAddress("0x0000000000000000000000000000000000dEaD")
            datetime = "2026-01-01T00:00:00Z"

        class public:
            @staticmethod
            def write(fn):
                return fn

            @staticmethod
            def view(fn):
                return fn

        class Contract:
            def __new__(cls):
                obj = object.__new__(cls)
                for klass in reversed(cls.__mro__):
                    for name, type_obj in getattr(klass, "__annotations__", {}).items():
                        if type_obj is _TreeMap:
                            setattr(obj, name, _TreeMap())
                        elif type_obj is DynArrayStub:
                            setattr(obj, name, DynArrayStub())
                return obj

        nondet = _nondet
        eq_principle = _eq_principle

    def _allow_storage(cls):
        return cls

    class _TreeMap(dict):
        def get_or_insert_default(self, key):
            if key not in self:
                self[key] = DynArrayStub()
            return self[key]

    class DynArrayStub(list):
        pass

    class _DynArraySubscriptable:
        def __getitem__(self, item):
            return DynArrayStub

        def __call__(self, *args, **kwargs):
            return DynArrayStub()

    class _TreeMapSubscriptable:
        def __getitem__(self, item):
            return _TreeMap

    fake_genlayer.gl = _FakeGL
    fake_genlayer.allow_storage = _allow_storage
    fake_genlayer.Address = _FakeAddress
    fake_genlayer.DynArray = _DynArraySubscriptable()
    fake_genlayer.TreeMap = _TreeMapSubscriptable()
    fake_genlayer.u256 = int
    fake_genlayer.__all__ = [
        "gl",
        "allow_storage",
        "Address",
        "DynArray",
        "TreeMap",
        "u256",
    ]
    for name in fake_genlayer.__all__:
        setattr(fake_genlayer, name, getattr(fake_genlayer, name))

    sys.modules["genlayer"] = fake_genlayer

    spec = importlib.util.spec_from_file_location(
        "permitgrid_contract_exact_consensus", CONTRACT_PATH
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module._TreeMap = _TreeMap
    module.DynArrayStub = DynArrayStub
    return module


pg = _load_contract_module()

SOURCES = [{"url": "https://reg.example.gov/rules", "role": "LICENSING_AUTHORITY"}]
CREDENTIAL_SOURCES = [
    {"url": "https://cred.example.gov/lookup", "role": "LICENCE_REGISTRY"}
]


def _new_contract():
    c = pg.PermitGrid()
    c.approved_domains["example.gov"] = True
    return c


def _register_work_order(c, wo_id="WO-1"):
    c.register_work_order(
        wo_id,
        "title",
        "ELECTRICAL_HV",
        "Lagos, Nigeria",
        "exact scope",
        "industrial facility",
        "contractor",
        SOURCES,
    )


def _register_provider(c, pid="PRV-1", name="Test Electric Co"):
    c.register_provider(pid, name)
    c.create_credential_submission(pid, CREDENTIAL_SOURCES)


def _req(rid, rtype, target, mandatory=True, scope="s", verif="v"):
    return {
        "requirement_id": rid,
        "type": rtype,
        "mandatory": mandatory,
        "target_value": target,
        "scope_summary": scope,
        "verification_target": verif,
    }


def _reqs_json(*reqs):
    return json.dumps({"requirements": list(reqs)})


def _extract_two_call(c, wo_id, leader_json, validator_json):
    """Queues the leader's and validator's raw exec_prompt responses (each
    consumed by exactly one of the two real `extract()` calls the fake
    `prompt_comparative` above makes) and runs the real
    `extract_requirements` write method."""
    queue = [leader_json, validator_json]

    def _next(task):
        return queue.pop(0)

    pg.gl.nondet.exec_prompt = staticmethod(_next)
    c.extract_requirements(wo_id)


def _assert_no_commit(c, wo_id):
    wo = c.get_work_order(wo_id)
    assert wo["status"] != "REQUIREMENTS_ACTIVE"
    assert wo["requirement_version"] == 0
    assert c.get_requirement_history(wo_id) == []


# ---- 1. leader has two requirements, validator has one -------------------


def test_leader_two_requirements_validator_one_disagrees_no_commit():
    c = _new_contract()
    _register_work_order(c)
    leader = _reqs_json(
        _req("REQ-01", "LICENCE_CLASS", "C-10"),
        _req("REQ-02", "LICENCE_STATUS", "Active"),
    )
    validator = _reqs_json(_req("REQ-01", "LICENCE_CLASS", "C-10"))
    with pytest.raises(Exception, match="CONSENSUS_NON_CONVERGENCE"):
        _extract_two_call(c, "WO-1", leader, validator)
    _assert_no_commit(c, "WO-1")


# ---- 2. validator has an extra requirement --------------------------------


def test_validator_extra_requirement_disagrees_no_commit():
    c = _new_contract()
    _register_work_order(c)
    leader = _reqs_json(_req("REQ-01", "LICENCE_CLASS", "C-10"))
    validator = _reqs_json(
        _req("REQ-01", "LICENCE_CLASS", "C-10"),
        _req("REQ-02", "COMPANY_REGISTRATION", "Active"),
    )
    with pytest.raises(Exception, match="CONSENSUS_NON_CONVERGENCE"):
        _extract_two_call(c, "WO-1", leader, validator)
    _assert_no_commit(c, "WO-1")


# ---- 3. same type, different target values --------------------------------


def test_same_type_different_target_disagrees_no_commit():
    c = _new_contract()
    _register_work_order(c)
    leader = _reqs_json(_req("REQ-01", "LICENCE_CLASS", "C-10"))
    validator = _reqs_json(_req("REQ-01", "LICENCE_CLASS", "C-20"))
    with pytest.raises(Exception, match="CONSENSUS_NON_CONVERGENCE"):
        _extract_two_call(c, "WO-1", leader, validator)
    _assert_no_commit(c, "WO-1")


# ---- 4. same type/target, different mandatory -----------------------------


def test_same_type_target_different_mandatory_disagrees_no_commit():
    c = _new_contract()
    _register_work_order(c)
    leader = _reqs_json(_req("REQ-01", "LICENCE_CLASS", "C-10", mandatory=True))
    validator = _reqs_json(_req("REQ-01", "LICENCE_CLASS", "C-10", mandatory=False))
    with pytest.raises(Exception, match="CONSENSUS_NON_CONVERGENCE"):
        _extract_two_call(c, "WO-1", leader, validator)
    _assert_no_commit(c, "WO-1")


# ---- 5. duplicate requirements: count mismatch ----------------------------


def test_duplicate_requirement_count_mismatch_disagrees_no_commit():
    """A duplicate requirement present twice on one side and once on the
    other is a genuine disagreement — duplicates are counted, never
    deduplicated away."""
    c = _new_contract()
    _register_work_order(c)
    leader = _reqs_json(
        _req("REQ-01", "LICENCE_CLASS", "C-10"),
        _req("REQ-02", "LICENCE_CLASS", "C-10"),  # same triple, twice
    )
    validator = _reqs_json(_req("REQ-01", "LICENCE_CLASS", "C-10"))  # only once
    with pytest.raises(Exception, match="CONSENSUS_NON_CONVERGENCE"):
        _extract_two_call(c, "WO-1", leader, validator)
    _assert_no_commit(c, "WO-1")


# ---- 6. reordered but identical: consensus succeeds -----------------------


def test_reordered_identical_requirements_converges():
    c = _new_contract()
    _register_work_order(c)
    a = _req("REQ-01", "LICENCE_CLASS", "C-10")
    b = _req("REQ-02", "LICENCE_STATUS", "Active")
    leader = _reqs_json(a, b)
    validator = _reqs_json(b, a)  # reversed order, same multiset
    _extract_two_call(c, "WO-1", leader, validator)
    wo = c.get_work_order("WO-1")
    assert wo["status"] == "REQUIREMENTS_ACTIVE"
    assert wo["requirement_version"] == 1
    rs = c.get_requirement_set("WO-1", 0)
    assert len(rs["requirements"]) == 2


# ---- 7. differing incidental fields only: consensus succeeds --------------


def test_differing_incidental_fields_only_converges():
    """Different requirement_id/scope_summary/verification_target wording,
    and target_value differing only by case/whitespace (normalized to the
    same value), must not block consensus — those fields are deliberately
    out of comparison scope, and normalization is deterministic."""
    c = _new_contract()
    _register_work_order(c)
    leader = _reqs_json(
        _req(
            "REQ-01",
            "LICENCE_CLASS",
            "  C-10  ",
            scope="wiring work",
            verif="check license class",
        )
    )
    validator = _reqs_json(
        _req(
            "REQ-A",
            "LICENCE_CLASS",
            "c-10",
            scope="totally different phrasing of the same finding",
            verif="a differently worded verification target",
        )
    )
    _extract_two_call(c, "WO-1", leader, validator)
    wo = c.get_work_order("WO-1")
    assert wo["status"] == "REQUIREMENTS_ACTIVE"
    assert wo["requirement_version"] == 1


# ---- 8. disagreement leaves a fully clean, fail-closed state --------------


def test_disagreement_leaves_clean_fail_closed_state():
    c = _new_contract()
    _register_work_order(c)
    _register_provider(c)
    leader = _reqs_json(_req("REQ-01", "LICENCE_CLASS", "C-10"))
    validator = _reqs_json(_req("REQ-01", "LICENCE_CLASS", "C-20"))
    with pytest.raises(Exception, match="CONSENSUS_NON_CONVERGENCE"):
        _extract_two_call(c, "WO-1", leader, validator)

    wo = c.get_work_order("WO-1")
    assert wo["status"] != "REQUIREMENTS_ACTIVE"
    assert wo["requirement_version"] == 0
    assert c.get_requirement_history("WO-1") == []
    assert c.get_clearance_history("WO-1", "PRV-1") == []
    assert c.get_clearance_state("WO-1", "PRV-1") == "UNASSESSED"
    assert c.is_provider_cleared("WO-1", "PRV-1", 0, 1) is False
    # assess_provider must be structurally unreachable: the work order
    # never reached REQUIREMENTS_ACTIVE.
    with pytest.raises(Exception, match="no active requirement set"):
        c.assess_provider("WO-1", "PRV-1")


# ---- 9. a source update invalidates the active requirement set -----------


def test_source_update_invalidates_active_requirement_set_until_replaced():
    c = _new_contract()
    _register_work_order(c)

    req = _req("REQ-01", "LICENCE_CLASS", "C-10")
    _extract_two_call(c, "WO-1", _reqs_json(req), _reqs_json(req))
    wo = c.get_work_order("WO-1")
    assert wo["status"] == "REQUIREMENTS_ACTIVE"
    assert wo["requirement_version"] == 1
    assert wo["source_version"] == 1

    # Update the regulatory sources: source_version bumps, status must
    # leave REQUIREMENTS_ACTIVE even though the old requirement-history
    # entry (still readable) is now stamped with a stale source_version.
    c.update_regulatory_sources(
        "WO-1",
        [{"url": "https://reg2.example.gov/rules", "role": "LICENSING_AUTHORITY"}],
    )
    wo2 = c.get_work_order("WO-1")
    assert wo2["status"] != "REQUIREMENTS_ACTIVE"
    assert wo2["source_version"] == 2
    stale_rs = c.get_requirement_set("WO-1", 0)
    assert stale_rs["source_version"] != wo2["source_version"]

    # A successful replacement extraction restores REQUIREMENTS_ACTIVE at
    # the new source_version, with a new, current requirement_version.
    req2 = _req("REQ-01", "LICENCE_CLASS", "C-10")
    _extract_two_call(c, "WO-1", _reqs_json(req2), _reqs_json(req2))
    wo3 = c.get_work_order("WO-1")
    assert wo3["status"] == "REQUIREMENTS_ACTIVE"
    assert wo3["requirement_version"] == 2
    fresh_rs = c.get_requirement_set("WO-1", 0)
    assert fresh_rs["source_version"] == wo3["source_version"] == 2


# ---- normalization unit tests (deterministic, pure Python) ---------------


def test_normalize_target_unicode_case_whitespace():
    assert pg._normalize_target("  C-10  ") == "c-10"
    assert pg._normalize_target("C-10") == pg._normalize_target("c-10")
    assert pg._normalize_target("C-10") == pg._normalize_target(" C-10 ")
    assert pg._normalize_target("C  -  10") == "c - 10"
    # NFKC: fullwidth digits normalize to ASCII digits.
    assert pg._normalize_target("Ｃ-１０") == "c-10"


def test_normalize_target_does_not_expand_abbreviations():
    """Explicitly NOT normalized to the same value — no semantic/
    abbreviation matching in this deterministic function."""
    assert pg._normalize_target("C-10") != pg._normalize_target("C10 Electrical")


def test_normalize_type_uppercases_and_strips():
    assert pg._normalize_type("  licence_class  ") == "LICENCE_CLASS"


def test_canonical_multiset_preserves_duplicate_counts():
    reqs = [
        {"type": "LICENCE_CLASS", "mandatory": True, "target_value": "C-10"},
        {"type": "LICENCE_CLASS", "mandatory": True, "target_value": "C-10"},
        {"type": "LICENCE_STATUS", "mandatory": True, "target_value": "Active"},
    ]
    multiset = pg._canonical_requirement_multiset(reqs)
    by_target = {e["normalized_target"]: e["count"] for e in multiset}
    assert by_target["c-10"] == 2
    assert by_target["active"] == 1


def test_canonical_multiset_order_independent():
    a = [
        {"type": "LICENCE_CLASS", "mandatory": True, "target_value": "C-10"},
        {"type": "LICENCE_STATUS", "mandatory": True, "target_value": "Active"},
    ]
    b = list(reversed(a))
    assert pg._canonical_requirement_multiset(a) == pg._canonical_requirement_multiset(
        b
    )
