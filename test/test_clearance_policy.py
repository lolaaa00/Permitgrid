"""
Deterministic unit tests for PermitGrid's clearance derivation and
validation helpers.

These tests import the pure-Python logic directly (no GenVM sandbox, no
Docker, no localnet) and are safe to run in any environment with plain
pytest. They exercise the same `_derive_clearance` function the deployed
contract uses, and the deterministic bounds/URL/enum validators.

Consensus-path (extraction / assessment) and live-chain tests require the
GenLayer localnet (`genlayer up`, Docker) or Studionet and are documented
separately — see README.md "Testing" section for exact status.
"""

import importlib.util
import os
import sys
import types
import pytest

CONTRACT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "contracts", "permitgrid.py"
)


def _load_contract_module():
    """Load permitgrid.py without requiring the real `genlayer` GenVM
    package (which only exists inside the sandbox). We stub out the pieces
    the module needs at import time."""

    fake_genlayer = types.ModuleType("genlayer")

    class _FakeAddress(str):
        @property
        def as_hex(self):
            return str(self)

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
            pass

        @staticmethod
        def get_webpage(url, mode="text"):
            return ""

        @staticmethod
        def exec_prompt(task):
            return "{}"

        @staticmethod
        def eq_principle_prompt_comparative(fn, principle=""):
            return fn()

    def _allow_storage(cls):
        return cls

    class _TreeMap(dict):
        def get_or_insert_default(self, key):
            if key not in self:
                self[key] = DynArrayStub()
            return self[key]

    class DynArrayStub(list):
        pass

    def _dynarray_factory(*_args, **_kwargs):
        return DynArrayStub()

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

    def _fake_star_import():
        return {
            "gl": _FakeGL,
            "allow_storage": _allow_storage,
            "Address": _FakeAddress,
            "DynArray": fake_genlayer.DynArray,
            "TreeMap": fake_genlayer.TreeMap,
            "u256": int,
        }

    fake_genlayer.__all__ = list(_fake_star_import().keys())
    for name, val in _fake_star_import().items():
        setattr(fake_genlayer, name, val)

    sys.modules["genlayer"] = fake_genlayer

    spec = importlib.util.spec_from_file_location("permitgrid_contract", CONTRACT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pg = _load_contract_module()


def _req(rid, rtype, mandatory=True, target="X"):
    return types.SimpleNamespace(
        requirement_id=rid, type=rtype, mandatory=mandatory, target_value=target
    )


def _item(rid, result):
    return types.SimpleNamespace(requirement_id=rid, result=result)


# --------------------------------------------------------------- CLEARED --


def test_all_pass_yields_cleared():
    reqs = [
        _req("REQ-01", "LICENCE_STATUS"),
        _req("REQ-02", "LICENCE_CLASS"),
        _req("REQ-03", "JURISDICTION_MATCH"),
        _req("REQ-04", "COMPANY_REGISTRATION"),
    ]
    items = [_item(r.requirement_id, "PASS") for r in reqs]
    assert pg._derive_clearance(reqs, items) == "CLEARED"


def test_not_applicable_does_not_block_cleared():
    reqs = [_req("REQ-01", "LICENCE_STATUS"), _req("REQ-02", "SPECIAL_ENDORSEMENT")]
    items = [_item("REQ-01", "PASS"), _item("REQ-02", "NOT_APPLICABLE")]
    assert pg._derive_clearance(reqs, items) == "CLEARED"


# --------------------------------------------------------- EXPIRED/SCOPE --


def test_expired_licence_status_wins_precedence():
    reqs = [
        _req("REQ-01", "LICENCE_STATUS"),
        _req("REQ-02", "SPECIAL_ENDORSEMENT"),
    ]
    items = [_item("REQ-01", "FAIL"), _item("REQ-02", "FAIL")]
    # EXPIRED_OR_INACTIVE must win over ADDITIONAL_CREDENTIAL_REQUIRED
    assert pg._derive_clearance(reqs, items) == "EXPIRED_OR_INACTIVE"


def test_out_of_scope_licence_class_fail():
    reqs = [_req("REQ-01", "LICENCE_CLASS")]
    items = [_item("REQ-01", "FAIL")]
    assert pg._derive_clearance(reqs, items) == "OUT_OF_SCOPE"


def test_out_of_scope_jurisdiction_partial():
    reqs = [_req("REQ-01", "JURISDICTION_MATCH")]
    items = [_item("REQ-01", "PARTIAL")]
    assert pg._derive_clearance(reqs, items) == "OUT_OF_SCOPE"


def test_out_of_scope_beats_additional_credential():
    reqs = [
        _req("REQ-01", "EQUIPMENT_CAPACITY_CLASS"),
        _req("REQ-02", "SPECIAL_ENDORSEMENT"),
    ]
    items = [_item("REQ-01", "FAIL"), _item("REQ-02", "FAIL")]
    assert pg._derive_clearance(reqs, items) == "OUT_OF_SCOPE"


# ---------------------------------------------- ADDITIONAL_CREDENTIAL_REQ --


def test_missing_endorsement_additional_credential_required():
    reqs = [_req("REQ-01", "SPECIAL_ENDORSEMENT")]
    items = [_item("REQ-01", "FAIL")]
    assert pg._derive_clearance(reqs, items) == "ADDITIONAL_CREDENTIAL_REQUIRED"


def test_missing_professional_registration_partial():
    reqs = [_req("REQ-01", "PROFESSIONAL_REGISTRATION")]
    items = [_item("REQ-01", "PARTIAL")]
    assert pg._derive_clearance(reqs, items) == "ADDITIONAL_CREDENTIAL_REQUIRED"


# ------------------------------------------------------- REGULATORY_CONFLICT


def test_conflicting_evidence():
    reqs = [_req("REQ-01", "COMPANY_REGISTRATION")]
    items = [_item("REQ-01", "CONFLICTING_EVIDENCE")]
    assert pg._derive_clearance(reqs, items) == "REGULATORY_CONFLICT"


def test_conflict_loses_to_expired():
    reqs = [_req("REQ-01", "LICENCE_STATUS"), _req("REQ-02", "COMPANY_REGISTRATION")]
    items = [_item("REQ-01", "FAIL"), _item("REQ-02", "CONFLICTING_EVIDENCE")]
    assert pg._derive_clearance(reqs, items) == "EXPIRED_OR_INACTIVE"


# ------------------------------------------------------- INSUFFICIENT_EVID


def test_insufficient_evidence_no_decisive_failure():
    reqs = [_req("REQ-01", "COMPANY_REGISTRATION")]
    items = [_item("REQ-01", "INSUFFICIENT_EVIDENCE")]
    assert pg._derive_clearance(reqs, items) == "INSUFFICIENT_EVIDENCE"


def test_insufficient_evidence_beats_supervision():
    reqs = [
        _req("REQ-01", "SUPERVISION", mandatory=False),
        _req("REQ-02", "COMPANY_REGISTRATION"),
    ]
    items = [_item("REQ-01", "PARTIAL"), _item("REQ-02", "INSUFFICIENT_EVIDENCE")]
    assert pg._derive_clearance(reqs, items) == "INSUFFICIENT_EVIDENCE"


# ------------------------------------------------------- SUPERVISION_REQ --


def test_supervision_required_when_optional_supervision_fails():
    reqs = [
        _req("REQ-01", "LICENCE_STATUS"),
        _req("REQ-02", "SUPERVISION", mandatory=False),
    ]
    items = [_item("REQ-01", "PASS"), _item("REQ-02", "FAIL")]
    assert pg._derive_clearance(reqs, items) == "SUPERVISION_REQUIRED"


def test_mandatory_supervision_fail_also_supervision_required():
    reqs = [_req("REQ-01", "SUPERVISION", mandatory=True)]
    items = [_item("REQ-01", "FAIL")]
    assert pg._derive_clearance(reqs, items) == "SUPERVISION_REQUIRED"


# ---------------------------------------------------------- validators ----


def test_bound_str_rejects_empty():
    with pytest.raises(ValueError):
        pg._bound_str("x", "   ")


def test_bound_str_rejects_oversized():
    with pytest.raises(ValueError):
        pg._bound_str("x", "a" * (pg.MAX_STRING_LEN + 1))


def test_bound_id_rejects_bad_chars():
    with pytest.raises(ValueError):
        pg._bound_id("work_order_id", "bad id with spaces")


def test_validate_url_rejects_http():
    with pytest.raises(ValueError):
        pg._validate_url("http://example.com")


def test_validate_url_rejects_localhost():
    with pytest.raises(ValueError):
        pg._validate_url("https://localhost/reg")


def test_validate_url_rejects_private_ip():
    with pytest.raises(ValueError):
        pg._validate_url("https://192.168.1.5/reg")


def test_validate_url_rejects_credential_bearing():
    with pytest.raises(ValueError):
        pg._validate_url("https://user:pass@example.com")


def test_validate_url_accepts_https():
    assert (
        pg._validate_url("https://example.gov/registry")
        == "https://example.gov/registry"
    )


def test_validate_sources_rejects_duplicate_urls():
    with pytest.raises(ValueError):
        pg._validate_sources(
            [
                {"url": "https://a.gov/x", "role": "LICENSING_AUTHORITY"},
                {"url": "https://a.gov/x", "role": "OTHER"},
            ],
            pg.SOURCE_ROLES,
            8,
        )


def test_validate_sources_rejects_bad_role():
    with pytest.raises(ValueError):
        pg._validate_sources(
            [{"url": "https://a.gov/x", "role": "NOT_A_ROLE"}], pg.SOURCE_ROLES, 8
        )


def test_validate_sources_rejects_over_cap():
    sources = [{"url": f"https://a.gov/{i}", "role": "OTHER"} for i in range(10)]
    with pytest.raises(ValueError):
        pg._validate_sources(sources, pg.SOURCE_ROLES, 8)


def test_parse_json_object_strips_fences_and_extracts():
    raw = '```json\n{"a": 1}\n```'
    assert pg._parse_json_object(raw) == {"a": 1}


def test_parse_json_object_rejects_no_json():
    with pytest.raises(ValueError):
        pg._parse_json_object("no json here")
