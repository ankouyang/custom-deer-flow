import pytest
from fastapi import HTTPException

from app.services.authz_service import AuthZService
from deerflow.config.paths import Paths
from deerflow.context import UserContext, clear_user_context, set_user_context


@pytest.fixture(autouse=True)
def clear_context():
    token = None
    try:
        yield
    finally:
        clear_user_context(token)


def set_context(
    *,
    workspace: str,
    agent_name: str | None = None,
    agent_id: str | None = None,
):
    return set_user_context(
        UserContext(
            user_id="user-1",
            email="user@example.com",
            workspace=workspace,
            name="Test User",
            agent_name=agent_name,
            agent_id=agent_id,
        ),
    )


def test_assert_thread_access_allows_matching_workspace_and_agent(monkeypatch: pytest.MonkeyPatch):
    service = AuthZService()
    token = set_context(workspace="ws-a", agent_name="agent-a")

    monkeypatch.setattr(
        "app.services.authz_service.get_thread_scope",
        lambda thread_id: {
            "workspace": "ws-a",
            "agentName": "agent-a",
            "agentId": "agent-a-id",
        },
    )
    monkeypatch.setattr(
        "app.services.authz_service.get_workspace_for_thread",
        lambda thread_id: None,
    )

    try:
        service.assert_thread_access("thread-1")
    finally:
        clear_user_context(token)


def test_assert_thread_access_rejects_workspace_mismatch(monkeypatch: pytest.MonkeyPatch):
    service = AuthZService()
    token = set_context(workspace="ws-a")

    monkeypatch.setattr(
        "app.services.authz_service.get_thread_scope",
        lambda thread_id: {"workspace": "ws-b"},
    )
    monkeypatch.setattr(
        "app.services.authz_service.get_workspace_for_thread",
        lambda thread_id: None,
    )

    try:
        with pytest.raises(HTTPException) as exc_info:
            service.assert_thread_access("thread-1")
    finally:
        clear_user_context(token)

    assert exc_info.value.status_code == 403
    assert "current workspace" in exc_info.value.detail


def test_assert_thread_access_rejects_agent_mismatch(monkeypatch: pytest.MonkeyPatch):
    service = AuthZService()
    token = set_context(workspace="ws-a", agent_name="agent-a")

    monkeypatch.setattr(
        "app.services.authz_service.get_thread_scope",
        lambda thread_id: {
            "workspace": "ws-a",
            "agentName": "agent-b",
            "agentId": "agent-b-id",
        },
    )
    monkeypatch.setattr(
        "app.services.authz_service.get_workspace_for_thread",
        lambda thread_id: None,
    )

    try:
        with pytest.raises(HTTPException) as exc_info:
            service.assert_thread_access("thread-1")
    finally:
        clear_user_context(token)

    assert exc_info.value.status_code == 403
    assert "current agent" in exc_info.value.detail


def test_assert_thread_access_allows_legacy_thread_without_agent_scope(monkeypatch: pytest.MonkeyPatch):
    service = AuthZService()
    token = set_context(workspace="ws-a", agent_name="agent-a")

    monkeypatch.setattr(
        "app.services.authz_service.get_thread_scope",
        lambda thread_id: {"workspace": "ws-a", "agentName": None, "agentId": None},
    )
    monkeypatch.setattr(
        "app.services.authz_service.get_workspace_for_thread",
        lambda thread_id: None,
    )

    try:
        service.assert_thread_access("thread-1")
    finally:
        clear_user_context(token)


def test_assert_agent_access_rejects_missing_agent(monkeypatch: pytest.MonkeyPatch, tmp_path):
    service = AuthZService()
    token = set_context(workspace="ws-a")

    monkeypatch.setattr(
        "app.services.authz_service.get_paths",
        lambda: Paths(tmp_path),
    )

    try:
        with pytest.raises(HTTPException) as exc_info:
            service.assert_agent_access("agent-a")
    finally:
        clear_user_context(token)

    assert exc_info.value.status_code == 404
    assert "not found" in exc_info.value.detail
