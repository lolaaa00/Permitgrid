"""
Security-hardening regression tests for PermitGrid, covering the audit
findings fixed in this pass: missing write authorization on
`extract_requirements`/`assess_provider`, history-exhaustion griefing via
those same unauthorized calls, evidence-domain revocation not being
re-checked at fetch time, missing optimistic-version protection, and the
new two-step admin-rotation flow. See `docs/SECURITY_AUDIT.md` for the
full write-up.

Pure Python, no Docker/network — same class of test as
`test_clearance_policy.py` / `test_prompt_injection_resistance.py`. Reuses
the accurate fake-GenVM harness (the one in `test_prompt_injection_resistance.py`,
not the older one in `test_clearance_policy.py`, which does not stub
`gl.nondet`/`gl.eq_principle` and therefore cannot exercise
`extract_requirements`/`assess_provider` at all).
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
        "permitgrid_contract_hardening", CONTRACT_PATH
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module._TreeMap = _TreeMap
    module.DynArrayStub = DynArrayStub
    return module


pg = _load_contract_module()

ADMIN = pg.Address("0x000000000000000000000000000000000000dEaD")
CREATOR_A = pg.Address("0x0000000000000000000000000000000000000aaa")
CREATOR_B = pg.Address("0x0000000000000000000000000000000000000bbb")
STRANGER = pg.Address("0x0000000000000000000000000000000000000ccc")

WORK_ORDER_SOURCES = [
    {"url": "https://reg.example.gov/rules", "role": "LICENSING_AUTHORITY"}
]
CREDENTIAL_SOURCES = [
    {"url": "https://cred.example.gov/lookup", "role": "LICENCE_REGISTRY"}
]

BENIGN_REQUIREMENTS_JSON = (
    '{"requirements": ['
    '{"type": "LICENCE_CLASS", "mandatory": true, "target_value": "C-10"},'
    '{"type": "LICENCE_STATUS", "mandatory": true, "target_value": "Active"}'
    "]}"
)

BENIGN_ASSESSMENT_JSON = (
    '{"items": ['
    '{"requirement_id": "REQ-01", "result": "PASS", "reason_code": "OK", '
    '"evidence_state": "SUFFICIENT", "evidence_reference": "x"},'
    '{"requirement_id": "REQ-02", "result": "PASS", "reason_code": "OK", '
    '"evidence_state": "SUFFICIENT", "evidence_reference": "x"}'
    "]}"
)


def _as(sender):
    pg.gl.message.sender_address = sender


def _new_contract(admin=ADMIN):
    _as(admin)
    c = pg.PermitGrid()
    c.approved_domains["example.gov"] = True
    return c


def _register_work_order(c, creator, wo_id="WO-1", sources=None):
    _as(creator)
    c.register_work_order(
        wo_id,
        "title",
        "ELECTRICAL_HV",
        "Lagos, Nigeria",
        "exact scope",
        "industrial facility",
        "contractor",
        sources if sources is not None else WORK_ORDER_SOURCES,
    )


def _register_provider(
    c, creator, pid="PRV-1", name="Bay Area Electric Co", sources=None
):
    _as(creator)
    c.register_provider(pid, name)
    c.create_credential_submission(
        pid, sources if sources is not None else CREDENTIAL_SOURCES
    )


def _extract_with_mock(
    c,
    sender,
    wo_id,
    exec_prompt_return=BENIGN_REQUIREMENTS_JSON,
    render_return="benign content",
    **kwargs
):
    _as(sender)
    pg.gl.nondet.web.render = staticmethod(lambda url, mode="text": render_return)
    pg.gl.nondet.exec_prompt = staticmethod(lambda task: exec_prompt_return)
    c.extract_requirements(wo_id, **kwargs)


def _assess_with_mock(
    c,
    sender,
    wo_id,
    pid,
    exec_prompt_return=BENIGN_ASSESSMENT_JSON,
    render_return="benign content",
    **kwargs
):
    _as(sender)
    pg.gl.nondet.web.render = staticmethod(lambda url, mode="text": render_return)
    pg.gl.nondet.exec_prompt = staticmethod(lambda task: exec_prompt_return)
    c.assess_provider(wo_id, pid, **kwargs)


# =========================================================================
# P0 — write authorization on extract_requirements / assess_provider
# =========================================================================


def test_extract_requirements_rejects_non_creator():
    c = _new_contract()
    _register_work_order(c, CREATOR_A)
    history_before = len(c.requirement_history["WO-1"])
    with pytest.raises(Exception, match="only the work order creator"):
        _extract_with_mock(c, STRANGER, "WO-1")
    assert len(c.requirement_history["WO-1"]) == history_before
    wo = c.get_work_order("WO-1")
    assert wo["status"] != "REQUIREMENTS_ACTIVE"


def test_extract_requirements_allows_creator():
    c = _new_contract()
    _register_work_order(c, CREATOR_A)
    _extract_with_mock(c, CREATOR_A, "WO-1")
    wo = c.get_work_order("WO-1")
    assert wo["status"] == "REQUIREMENTS_ACTIVE"
    assert wo["requirement_version"] == 1


def test_assess_provider_rejects_unrelated_caller():
    c = _new_contract()
    _register_work_order(c, CREATOR_A)
    _extract_with_mock(c, CREATOR_A, "WO-1")
    _register_provider(c, CREATOR_B)
    key = c._clearance_key("WO-1", "PRV-1")
    history_before = len(c.clearance_history.get(key, []))
    with pytest.raises(Exception, match="work order creator or the provider"):
        _assess_with_mock(c, STRANGER, "WO-1", "PRV-1")
    assert len(c.clearance_history.get(key, [])) == history_before


def test_assess_provider_allows_work_order_creator():
    c = _new_contract()
    _register_work_order(c, CREATOR_A)
    _extract_with_mock(c, CREATOR_A, "WO-1")
    _register_provider(c, CREATOR_B)
    _assess_with_mock(c, CREATOR_A, "WO-1", "PRV-1")
    assessment = c.get_clearance_assessment("WO-1", "PRV-1")
    assert assessment["clearance"] == "CLEARED"


def test_assess_provider_allows_provider_creator():
    c = _new_contract()
    _register_work_order(c, CREATOR_A)
    _extract_with_mock(c, CREATOR_A, "WO-1")
    _register_provider(c, CREATOR_B)
    _assess_with_mock(c, CREATOR_B, "WO-1", "PRV-1")
    assessment = c.get_clearance_assessment("WO-1", "PRV-1")
    assert assessment["clearance"] == "CLEARED"


def test_update_regulatory_sources_still_creator_only_regression():
    c = _new_contract()
    _register_work_order(c, CREATOR_A)
    _as(STRANGER)
    with pytest.raises(Exception, match="only the work order creator"):
        c.update_regulatory_sources("WO-1", WORK_ORDER_SOURCES)


def test_update_credentials_still_creator_only_regression():
    c = _new_contract()
    _register_provider(c, CREATOR_A)
    _as(STRANGER)
    with pytest.raises(Exception, match="only the provider creator"):
        c.update_credentials("PRV-1", CREDENTIAL_SOURCES)


# =========================================================================
# P1 — evidence-domain revocation enforced at fetch time, not just at
# registration time
# =========================================================================


def test_extract_requirements_blocked_after_domain_revoked():
    c = _new_contract()
    _register_work_order(c, CREATOR_A)
    del c.approved_domains["example.gov"]
    history_before = len(c.requirement_history["WO-1"])
    with pytest.raises(Exception, match="SOURCE_DOMAIN_REVOKED"):
        _extract_with_mock(c, CREATOR_A, "WO-1")
    assert len(c.requirement_history["WO-1"]) == history_before


def test_extract_requirements_works_again_after_domain_restored():
    c = _new_contract()
    _register_work_order(c, CREATOR_A)
    del c.approved_domains["example.gov"]
    with pytest.raises(Exception, match="SOURCE_DOMAIN_REVOKED"):
        _extract_with_mock(c, CREATOR_A, "WO-1")
    c.approved_domains["example.gov"] = True
    _extract_with_mock(c, CREATOR_A, "WO-1")
    wo = c.get_work_order("WO-1")
    assert wo["status"] == "REQUIREMENTS_ACTIVE"


def test_assess_provider_blocked_after_credential_domain_revoked():
    c = _new_contract()
    _register_work_order(c, CREATOR_A)
    _extract_with_mock(c, CREATOR_A, "WO-1")
    _register_provider(c, CREATOR_B)
    del c.approved_domains["example.gov"]
    key = c._clearance_key("WO-1", "PRV-1")
    history_before = len(c.clearance_history.get(key, []))
    with pytest.raises(Exception, match="SOURCE_DOMAIN_REVOKED"):
        _assess_with_mock(c, CREATOR_A, "WO-1", "PRV-1")
    assert len(c.clearance_history.get(key, [])) == history_before


def test_assess_provider_works_again_after_credential_domain_restored():
    c = _new_contract()
    _register_work_order(c, CREATOR_A)
    _extract_with_mock(c, CREATOR_A, "WO-1")
    _register_provider(c, CREATOR_B)
    del c.approved_domains["example.gov"]
    with pytest.raises(Exception, match="SOURCE_DOMAIN_REVOKED"):
        _assess_with_mock(c, CREATOR_A, "WO-1", "PRV-1")
    c.approved_domains["example.gov"] = True
    _assess_with_mock(c, CREATOR_A, "WO-1", "PRV-1")
    assessment = c.get_clearance_assessment("WO-1", "PRV-1")
    assert assessment["clearance"] == "CLEARED"


# =========================================================================
# P1 — optimistic version protection
# =========================================================================


def test_extract_requirements_rejects_stale_expected_source_version():
    c = _new_contract()
    _register_work_order(c, CREATOR_A)
    with pytest.raises(Exception, match="STALE_SOURCE_VERSION"):
        _extract_with_mock(c, CREATOR_A, "WO-1", expected_source_version=99)


def test_extract_requirements_accepts_matching_expected_source_version():
    c = _new_contract()
    _register_work_order(c, CREATOR_A)
    wo = c.get_work_order("WO-1")
    _extract_with_mock(
        c, CREATOR_A, "WO-1", expected_source_version=wo["source_version"]
    )
    assert c.get_work_order("WO-1")["requirement_version"] == 1


def test_extract_requirements_default_expected_version_skips_check():
    c = _new_contract()
    _register_work_order(c, CREATOR_A)
    _extract_with_mock(c, CREATOR_A, "WO-1")  # no expected_source_version passed
    assert c.get_work_order("WO-1")["requirement_version"] == 1


def test_assess_provider_rejects_stale_expected_requirement_version():
    c = _new_contract()
    _register_work_order(c, CREATOR_A)
    _extract_with_mock(c, CREATOR_A, "WO-1")
    _register_provider(c, CREATOR_B)
    key = c._clearance_key("WO-1", "PRV-1")
    history_before = len(c.clearance_history.get(key, []))
    with pytest.raises(Exception, match="STALE_REQUIREMENT_VERSION"):
        _assess_with_mock(
            c, CREATOR_A, "WO-1", "PRV-1", expected_requirement_version=99
        )
    assert len(c.clearance_history.get(key, [])) == history_before


def test_assess_provider_rejects_stale_expected_credential_version():
    c = _new_contract()
    _register_work_order(c, CREATOR_A)
    _extract_with_mock(c, CREATOR_A, "WO-1")
    _register_provider(c, CREATOR_B)
    with pytest.raises(Exception, match="STALE_CREDENTIAL_VERSION"):
        _assess_with_mock(c, CREATOR_A, "WO-1", "PRV-1", expected_credential_version=99)


def test_assess_provider_accepts_matching_expected_versions():
    c = _new_contract()
    _register_work_order(c, CREATOR_A)
    _extract_with_mock(c, CREATOR_A, "WO-1")
    _register_provider(c, CREATOR_B)
    wo = c.get_work_order("WO-1")
    provider = c.get_provider("PRV-1")
    _assess_with_mock(
        c,
        CREATOR_A,
        "WO-1",
        "PRV-1",
        expected_requirement_version=wo["requirement_version"],
        expected_source_version=wo["source_version"],
        expected_credential_version=provider["credential_version"],
    )
    assert c.get_clearance_assessment("WO-1", "PRV-1")["clearance"] == "CLEARED"


# =========================================================================
# P2 — two-step admin rotation
# =========================================================================


def test_propose_admin_rejects_non_admin():
    c = _new_contract()
    _as(STRANGER)
    with pytest.raises(Exception, match="only the contract admin"):
        c.propose_admin(str(CREATOR_A))


def test_propose_admin_rejects_malformed_address():
    c = _new_contract()
    _as(ADMIN)
    with pytest.raises(ValueError):
        c.propose_admin("not-an-address")
    with pytest.raises(ValueError):
        c.propose_admin("")


def test_propose_admin_rejects_same_as_current():
    c = _new_contract()
    _as(ADMIN)
    with pytest.raises(ValueError, match="must differ"):
        c.propose_admin(str(ADMIN))


def test_accept_admin_rejects_without_proposal():
    c = _new_contract()
    _as(CREATOR_A)
    with pytest.raises(Exception, match="no admin rotation is pending"):
        c.accept_admin()


def test_accept_admin_rejects_wrong_caller():
    c = _new_contract()
    _as(ADMIN)
    c.propose_admin(str(CREATOR_A))
    _as(STRANGER)
    with pytest.raises(Exception, match="only the pending admin"):
        c.accept_admin()


def test_full_admin_rotation_transfers_privileges():
    c = _new_contract()
    _as(ADMIN)
    c.propose_admin(str(CREATOR_A))
    assert c.get_pending_admin() == str(CREATOR_A)

    _as(CREATOR_A)
    c.accept_admin()
    assert c.get_pending_admin() == ""

    # Old admin has lost admin rights.
    _as(ADMIN)
    with pytest.raises(Exception, match="only the contract admin"):
        c.add_approved_domain("new-authority.gov")

    # New admin has them.
    _as(CREATOR_A)
    c.add_approved_domain("new-authority.gov")
    assert "new-authority.gov" in c.approved_domains


# =========================================================================
# P2 — URL validation hardening (IP literals, precise userinfo rejection)
# =========================================================================


def test_validate_url_rejects_ipv6_literal():
    with pytest.raises(ValueError):
        pg._validate_url("https://[::1]/x")
    with pytest.raises(ValueError):
        pg._validate_url("https://[2001:db8::1]/x")


def test_validate_url_rejects_decimal_ip_obfuscation():
    with pytest.raises(ValueError):
        pg._validate_url("https://2130706433/x")  # 127.0.0.1 as a decimal integer


def test_validate_url_rejects_public_ip_literal():
    with pytest.raises(ValueError):
        pg._validate_url("https://93.184.216.34/x")


def test_validate_url_accepts_at_sign_in_query_string():
    """A precise userinfo check (via urlsplit) accepts a legitimate '@' in
    the query string — the old blanket '"@" in url' check over-rejected
    this."""
    url = "https://example.gov/lookup?email=a@b.com"
    assert pg._validate_url(url) == url


def test_validate_url_still_rejects_real_userinfo():
    with pytest.raises(ValueError):
        pg._validate_url("https://user:pass@example.gov/x")
