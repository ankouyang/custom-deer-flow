from __future__ import annotations

from pathlib import Path

from deerflow.config.paths import Paths, get_paths
from deerflow.config.thread_scope_registry import get_thread_scope
from deerflow.config.workspace_registry import get_workspace_for_thread


class PathManager:
    """Workspace-aware path helper for thread-scoped gateway operations."""

    def __init__(self, paths: Paths | None = None) -> None:
        self._paths = paths or get_paths()

    def get_thread_workspace(self, thread_id: str) -> str | None:
        scope = get_thread_scope(thread_id) or {}
        return scope.get("workspace") or get_workspace_for_thread(thread_id)

    def thread_dir(self, thread_id: str) -> Path:
        return self._paths.thread_dir(thread_id)

    def sandbox_work_dir(self, thread_id: str) -> Path:
        return self._paths.sandbox_work_dir(thread_id)

    def sandbox_uploads_dir(self, thread_id: str) -> Path:
        return self._paths.sandbox_uploads_dir(thread_id)

    def sandbox_outputs_dir(self, thread_id: str) -> Path:
        return self._paths.sandbox_outputs_dir(thread_id)

    def sandbox_user_data_dir(self, thread_id: str) -> Path:
        return self._paths.sandbox_user_data_dir(thread_id)

    def resolve_virtual_path(self, thread_id: str, virtual_path: str) -> Path:
        return self._paths.resolve_virtual_path(thread_id, virtual_path)

    def delete_thread_dir(self, thread_id: str) -> None:
        self._paths.delete_thread_dir(thread_id)


_path_manager: PathManager | None = None


def get_path_manager() -> PathManager:
    global _path_manager
    if _path_manager is None:
        _path_manager = PathManager()
    return _path_manager
