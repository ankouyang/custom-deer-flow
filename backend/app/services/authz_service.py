from __future__ import annotations

from fastapi import HTTPException, status

from deerflow.config.paths import get_paths
from deerflow.config.thread_scope_registry import get_thread_scope
from deerflow.config.workspace_registry import get_workspace_for_thread
from deerflow.context import get_current_user_context


class AuthZService:
    """Minimal authorization checks for workspace-scoped gateway routes."""

    def assert_agent_access(self, agent_name: str) -> None:
        context = get_current_user_context()
        if context is None:
            return

        normalized = agent_name.strip().lower()
        if not normalized:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="agent_name must not be empty.",
            )

        agent_dir = get_paths().agent_dir(normalized)
        if not agent_dir.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Agent '{normalized}' not found in the current workspace.",
            )

    def assert_thread_access(self, thread_id: str) -> None:
        context = get_current_user_context()
        if context is None:
            return

        scope = get_thread_scope(thread_id) or {}
        thread_workspace = scope.get("workspace") or get_workspace_for_thread(thread_id)
        if not thread_workspace:
            # Allow threads that do not yet have a local scope entry; the
            # underlying thread/path validation will still apply.
            return

        if thread_workspace != context.workspace:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: thread does not belong to the current workspace.",
            )

        requested_agent_name = (context.agent_name or "").strip().lower()
        thread_agent_name = str(scope.get("agentName") or "").strip().lower()
        if requested_agent_name and thread_agent_name and requested_agent_name != thread_agent_name:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: thread does not belong to the current agent.",
            )


_authz_service: AuthZService | None = None


def get_authz_service() -> AuthZService:
    global _authz_service
    if _authz_service is None:
        _authz_service = AuthZService()
    return _authz_service
