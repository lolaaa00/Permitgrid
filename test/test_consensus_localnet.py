"""
GenLayer localnet consensus-path tests for PermitGrid.

These tests exercise the real non-deterministic consensus paths
(`extract_requirements`, `assess_provider`) against a running GenLayer
localnet, using `gltest` (pytest + genlayer-js under the hood). They
require:

  1. Docker running locally
  2. `genlayer up` (starts the localnet simulator + validators + LLM
     provider container)

They are NOT run as part of `test/test_clearance_policy.py`, which is pure
Python and requires neither Docker nor a network.

STATUS (see README.md "Testing" section for the authoritative statement):
this environment does not have Docker installed, so these tests could not
be executed here. They are included as real, runnable test code — not as
a placeholder — for anyone who runs them with `genlayer up` first, then
`gltest test/test_consensus_localnet.py`.
"""

import pytest
from gltest import get_contract_factory, default_account
from gltest.helpers import load_fixture
from gltest.assertions import tx_execution_succeeded, tx_execution_failed

LICENCE_SOURCE = "https://example-licensing-authority.gov/registry"
COMPANY_SOURCE = "https://example-company-registry.gov/lookup"
ENDORSEMENT_SOURCE = "https://example-endorsement-register.gov/hv"


def deploy_contract():
    factory = get_contract_factory("PermitGrid")
    contract = factory.deploy()
    assert contract.list_work_orders(args=[0, 20]) == []
    assert contract.list_providers(args=[0, 20]) == []
    return contract


def _register_work_order(contract):
    result = contract.register_work_order(
        args=[
            "WO-HV-001",
            "11kV switchgear inspection and maintenance",
            "ELECTRICAL_HV",
            "Lagos, Nigeria",
            "11 kV switchgear inspection and maintenance, industrial facility, contractor role",
            "industrial facility",
            "contractor",
            [
                {"url": LICENCE_SOURCE, "role": "LICENSING_AUTHORITY"},
                {"url": COMPANY_SOURCE, "role": "COMPANY_REGISTRY_RULES"},
            ],
        ]
    )
    assert tx_execution_succeeded(result)
    return contract.get_work_order(args=["WO-HV-001"])


def _register_provider(contract):
    result = contract.register_provider(
        args=["PRV-001", "Example Technical Services Ltd"]
    )
    assert tx_execution_succeeded(result)
    cred_result = contract.create_credential_submission(
        args=["PRV-001", [{"url": ENDORSEMENT_SOURCE, "role": "ENDORSEMENT_REGISTER"}]]
    )
    assert tx_execution_succeeded(cred_result)
    return contract.get_provider(args=["PRV-001"])


def test_register_work_order_and_provider():
    contract = load_fixture(deploy_contract)
    wo = _register_work_order(contract)
    assert wo["status"] == "NEEDS_REQUIREMENTS"
    assert wo["source_version"] == 1
    assert wo["requirement_version"] == 0

    provider = _register_provider(contract)
    assert provider["credential_version"] == 1


def test_duplicate_work_order_key_rejected():
    contract = load_fixture(deploy_contract)
    _register_work_order(contract)
    dup = contract.register_work_order(
        args=[
            "WO-HV-001",
            "duplicate",
            "ELECTRICAL_HV",
            "Lagos, Nigeria",
            "duplicate scope",
            "industrial facility",
            "contractor",
            [{"url": LICENCE_SOURCE, "role": "LICENSING_AUTHORITY"}],
        ]
    )
    assert tx_execution_failed(dup)


def test_non_https_source_rejected():
    contract = load_fixture(deploy_contract)
    result = contract.register_work_order(
        args=[
            "WO-BAD-URL",
            "bad url work order",
            "ELECTRICAL_HV",
            "Lagos, Nigeria",
            "scope",
            "industrial facility",
            "contractor",
            [{"url": "http://insecure.example.gov/registry", "role": "LICENSING_AUTHORITY"}],
        ]
    )
    assert tx_execution_failed(result)


def test_extract_requirements_real_consensus():
    """Runs the real requirement-extraction consensus stage against live
    public regulatory-style URLs. Requires localnet + configured LLM
    provider keys for genlayer up. This is the live proof for Consensus A."""
    contract = load_fixture(deploy_contract)
    _register_work_order(contract)

    result = contract.extract_requirements(
        args=["WO-HV-001"], wait_interval=10000, wait_retries=30
    )
    assert tx_execution_succeeded(result)

    wo = contract.get_work_order(args=["WO-HV-001"])
    assert wo["status"] == "REQUIREMENTS_ACTIVE"
    assert wo["requirement_version"] == 1

    req_set = contract.get_requirement_set(args=["WO-HV-001", 0])
    assert req_set["version"] == 1
    assert len(req_set["requirements"]) >= 1
    for r in req_set["requirements"]:
        assert r["type"] in (
            "LICENCE_CLASS",
            "LICENCE_STATUS",
            "PROFESSIONAL_REGISTRATION",
            "COMPANY_REGISTRATION",
            "SPECIAL_ENDORSEMENT",
            "JURISDICTION_MATCH",
            "SUPERVISION",
            "EQUIPMENT_CAPACITY_CLASS",
            "OTHER",
        )


def test_full_lifecycle_and_stale_invalidation():
    """End-to-end: extraction -> assessment -> is_provider_cleared ->
    credential update -> stale -> reassess. Mirrors the live Studionet
    lifecycle proof, run here against localnet."""
    contract = load_fixture(deploy_contract)
    _register_work_order(contract)
    _register_provider(contract)

    extract_result = contract.extract_requirements(
        args=["WO-HV-001"], wait_interval=10000, wait_retries=30
    )
    assert tx_execution_succeeded(extract_result)
    wo = contract.get_work_order(args=["WO-HV-001"])
    req_version = wo["requirement_version"]

    assess_result = contract.assess_provider(
        args=["WO-HV-001", "PRV-001"], wait_interval=10000, wait_retries=30
    )
    assert tx_execution_succeeded(assess_result)

    provider = contract.get_provider(args=["PRV-001"])
    cred_version = provider["credential_version"]

    state = contract.get_clearance_state(args=["WO-HV-001", "PRV-001"])
    assert state in (
        "CLEARED",
        "SUPERVISION_REQUIRED",
        "ADDITIONAL_CREDENTIAL_REQUIRED",
        "OUT_OF_SCOPE",
        "EXPIRED_OR_INACTIVE",
        "INSUFFICIENT_EVIDENCE",
        "REGULATORY_CONFLICT",
    )

    gate_before = contract.is_provider_cleared(
        args=["WO-HV-001", "PRV-001", req_version, cred_version]
    )
    if state == "CLEARED":
        assert gate_before is True
    else:
        assert gate_before is False

    # Credential update must invalidate the gate immediately, even before
    # reassessment.
    update_result = contract.update_credentials(
        args=[
            "PRV-001",
            [{"url": ENDORSEMENT_SOURCE, "role": "ENDORSEMENT_REGISTER"}],
        ],
        wait_interval=10000,
        wait_retries=30,
    )
    assert tx_execution_succeeded(update_result)
    provider_after = contract.get_provider(args=["PRV-001"])
    new_cred_version = provider_after["credential_version"]
    assert new_cred_version == cred_version + 1

    gate_after_update = contract.is_provider_cleared(
        args=["WO-HV-001", "PRV-001", req_version, cred_version]
    )
    assert gate_after_update is False  # old credential version is stale

    stale_state = contract.get_clearance_state(args=["WO-HV-001", "PRV-001"])
    assert stale_state == "STALE"

    # Reassess against the new credential version.
    reassess_result = contract.assess_provider(
        args=["WO-HV-001", "PRV-001"], wait_interval=10000, wait_retries=30
    )
    assert tx_execution_succeeded(reassess_result)

    final_state = contract.get_clearance_state(args=["WO-HV-001", "PRV-001"])
    assert final_state != "STALE"

    history = contract.get_clearance_history(args=["WO-HV-001", "PRV-001"])
    assert len(history) == 2  # append-only: both assessments retained
