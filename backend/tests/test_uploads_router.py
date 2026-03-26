from pathlib import Path

import pytest
from fastapi import HTTPException

import app.gateway.routers.uploads as uploads_router
from deerflow.config.paths import Paths


def test_get_uploads_dir_calls_thread_access_check(tmp_path, monkeypatch: pytest.MonkeyPatch):
    calls: list[str] = []

    class FakeAuthzService:
        def assert_thread_access(self, thread_id: str) -> None:
            calls.append(thread_id)

    monkeypatch.setattr(uploads_router, "get_authz_service", lambda: FakeAuthzService())
    monkeypatch.setattr(uploads_router, "get_paths", lambda: Paths(tmp_path))

    uploads_dir = uploads_router.get_uploads_dir("thread-1")

    assert calls == ["thread-1"]
    assert uploads_dir == Path(tmp_path) / "threads" / "thread-1" / "user-data" / "uploads"
    assert uploads_dir.exists()


def test_get_uploads_dir_rejects_unauthorized_thread(tmp_path, monkeypatch: pytest.MonkeyPatch):
    class FakeAuthzService:
        def assert_thread_access(self, thread_id: str) -> None:
            raise HTTPException(
                status_code=403,
                detail="Access denied: thread does not belong to the current agent.",
            )

    monkeypatch.setattr(uploads_router, "get_authz_service", lambda: FakeAuthzService())
    monkeypatch.setattr(uploads_router, "get_paths", lambda: Paths(tmp_path))

    with pytest.raises(HTTPException) as exc_info:
        uploads_router.get_uploads_dir("thread-1")

    assert exc_info.value.status_code == 403
    assert "current agent" in exc_info.value.detail
