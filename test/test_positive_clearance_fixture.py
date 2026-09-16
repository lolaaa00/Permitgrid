"""
Positive end-to-end clearance fixture for PermitGrid.

Honest scope, stated up front: this is a deterministic pytest fixture with
`gl.nondet.web.render`/`gl.nondet.exec_prompt` mocked (same style as
`test_prompt_injection_resistance.py` and `test_security_hardening.py`) —
it proves the deterministic clearance-derivation and versioning/staleness
logic end to end by actually calling the real contract methods, but it is
NOT a live multi-validator GenVM consensus run. That remains
`test/test_consensus_localnet.py`'s job (needs Docker/`genlayer up`).

`SYNTHETIC_REGISTRY_DOMAIN` below is a clearly-labelled, entirely made-up
domain used only as fixture data — it is never actually fetched (the fetch
layer is mocked in this file) and must never be presented as, or confused
with, a real regulator or credential registry.
"""

import importlib.util
import os
import sys
import types

import pytest

CONTRACT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "contracts", "permitgrid.py"
)

SYNTHETIC_REGISTRY_DOMAIN = "synthetic-registry.permitgrid.test"


def _load_contract_module():
    fake_genlayer = types.ModuleType("genlayer")

    class _FakeAddress(str):
        @property
        def as_hex(self):
            return str(self)

    class _web:
        render = staticmethod(lambda url, mode="text": "")

    class _nondet:
        web = _web
        exec_prompt = staticmethod(lambda task: "{}")

    class _eq_principle:
        prompt_comparative = staticmethod(lambda fn, principle="": fn())
        strict_eq = staticmethod(lambda fn: fn())

    class _FakeGL:
        class message:
            sender_address = _FakeAddress("0x000000000000000000000000000000000000dEaD")
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
        "permitgrid_contract_positive_fixture", CONTRACT_PATH
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module._TreeMap = _TreeMap
    module.DynArrayStub = DynArrayStub
    return module


pg = _load_contract_module()

CREATOR = pg.Address("0x0000000000000000000000000000000000000aaa")
PROVIDER_OWNER = pg.Address("0x0000000000000000000000000000000000000bbb")

WORK_ORDER_SOURCES = [
    {
        "url": f"https://{SYNTHETIC_REGISTRY_DOMAIN}/rules/C-10",
        "role": "LICENSING_AUTHORITY",
    }
]
CREDENTIAL_SOURCES = [
    {
        "url": f"https://{SYNTHETIC_REGISTRY_DOMAIN}/lookup/acme-electric",
        "role": "LICENCE_REGISTRY",
    }
]

REQUIREMENTS_JSON = (
    '{"requirements": ['
    '{"type": "LICENCE_CLASS", "mandatory": true, "target_value": "C-10"},'
    '{"type": "LICENCE_STATUS", "mandatory": true, "target_value": "Active"}'
    "]}"
)


def _as(sender):
    pg.gl.message.sender_address = sender


def _new_contract():
    _as(CREATOR)
    c = pg.PermitGrid()
    c.approved_domains[SYNTHETIC_REGISTRY_DOMAIN] = True
    return c


def _register_work_order(c, wo_id="WO-1"):
    _as(CREATOR)
    c.register_work_order(
        wo_id,
        "Panel upgrade",
        "ELECTRICAL_HV",
        "California, USA",
        "200A residential service panel upgrade",
        "residential",
        "electrical contractor",
        WORK_ORDER_SOURCES,
    )


def _extract(
    c,
    wo_id,
    requirements_json=REQUIREMENTS_JSON,
    render_return="synthetic fixture content",
):
    _as(CREATOR)
    pg.gl.nondet.web.render = staticmethod(lambda url, mode="text": render_return)
    pg.gl.nondet.exec_prompt = staticmethod(lambda task: requirements_json)
    c.extract_requirements(wo_id)


def _register_provider(c, pid="PRV-1", name="Acme Electric Co"):
    _as(PROVIDER_OWNER)
    c.register_provider(pid, name)
    c.create_credential_submission(pid, CREDENTIAL_SOURCES)


def _assess(c, wo_id, pid, items_json, render_return="synthetic fixture evidence"):
    _as(CREATOR)
    pg.gl.nondet.web.render = staticmethod(lambda url, mode="text": render_return)
    pg.gl.nondet.exec_prompt = staticmethod(lambda task: items_json)
    c.assess_provider(wo_id, pid)


ALL_PASS_JSON = (
    '{"items": ['
    '{"requirement_id": "REQ-01", "result": "PASS", "reason_code": "MATCH", '
    '"evidence_state": "SUFFICIENT", "evidence_reference": "synthetic registry entry"},'
    '{"requirement_id": "REQ-02", "result": "PASS", "reason_code": "MATCH", '
    '"evidence_state": "SUFFICIENT", "evidence_reference": "synthetic registry entry"}'
    "]}"
)

WRONG_IDENTITY_JSON = (
    '{"items": ['
    '{"requirement_id": "REQ-01", "result": "INSUFFICIENT_EVIDENCE", '
    '"reason_code": "IDENTITY_MISMATCH", "evidence_state": "INSUFFICIENT", '
    '"evidence_reference": "registry entry names a different, similarly-named entity"},'
    '{"requirement_id": "REQ-02", "result": "INSUFFICIENT_EVIDENCE", '
    '"reason_code": "IDENTITY_MISMATCH", "evidence_state": "INSUFFICIENT", '
    '"evidence_reference": "registry entry names a different, similarly-named entity"}'
    "]}"
)


def test_full_positive_path_reaches_cleared_and_gate_true():
    c = _new_contract()
    _register_work_order(c)
    _extract(c, "WO-1")
    _register_provider(c)
    _assess(c, "WO-1", "PRV-1", ALL_PASS_JSON)

    assessment = c.get_clearance_assessment("WO-1", "PRV-1")
    assert assessment["clearance"] == "CLEARED"
    assert c.is_provider_cleared("WO-1", "PRV-1", 1, 1) is True


def test_wrong_identity_does_not_clear():
    c = _new_contract()
    _register_work_order(c)
    _extract(c, "WO-1")
    _register_provider(c)
    _assess(c, "WO-1", "PRV-1", WRONG_IDENTITY_JSON)

    assessment = c.get_clearance_assessment("WO-1", "PRV-1")
    assert assessment["clearance"] != "CLEARED"
    assert c.is_provider_cleared("WO-1", "PRV-1", 1, 1) is False


def test_missing_evidence_before_any_credential_submission_raises():
    c = _new_contract()
    _register_work_order(c)
    _extract(c, "WO-1")
    _as(PROVIDER_OWNER)
    c.register_provider("PRV-1", "Acme Electric Co")  # no credential submission yet

    with pytest.raises(Exception, match="no credential submission"):
        _assess(c, "WO-1", "PRV-1", ALL_PASS_JSON)


def test_source_update_causes_stale_clearance_then_successful_reassessment():
    c = _new_contract()
    _register_work_order(c)
    _extract(c, "WO-1")
    _register_provider(c)
    _assess(c, "WO-1", "PRV-1", ALL_PASS_JSON)
    assert c.is_provider_cleared("WO-1", "PRV-1", 1, 1) is True

    # Regulatory source update bumps source_version -> the existing CLEARED
    # entry no longer matches current versions -> STALE, gate false.
    _as(CREATOR)
    c.update_regulatory_sources("WO-1", WORK_ORDER_SOURCES)
    assert c.get_clearance_state("WO-1", "PRV-1") == "STALE"
    assert c.is_provider_cleared("WO-1", "PRV-1", 1, 1) is False

    # Re-extract against the new source version, then reassess -> CLEARED
    # again at the new, current versions.
    _extract(c, "WO-1")
    wo = c.get_work_order("WO-1")
    assert wo["requirement_version"] == 2
    assert wo["source_version"] == 2

    _assess(c, "WO-1", "PRV-1", ALL_PASS_JSON)
    assert c.get_clearance_state("WO-1", "PRV-1") == "CLEARED"
    assert c.is_provider_cleared("WO-1", "PRV-1", 2, 1) is True
