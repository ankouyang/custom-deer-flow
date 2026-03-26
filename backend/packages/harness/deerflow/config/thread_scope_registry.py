from __future__ import annotations

import json
from pathlib import Path
from typing import TypedDict


class ThreadScope(TypedDict, total=False):
    workspace: str
    agentId: str | None
    agentName: str | None


def _registry_file() -> Path:
    from deerflow.config.paths import Paths

    return Paths().storage_root_dir / "thread-scopes.json"


def get_thread_scope(thread_id: str) -> ThreadScope | None:
    path = _registry_file()
    if not path.exists():
        return None

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None

    value = data.get(thread_id)
    if not isinstance(value, dict):
        return None

    scope: ThreadScope = {}
    workspace = value.get("workspace")
    if isinstance(workspace, str) and workspace:
        scope["workspace"] = workspace

    agent_id = value.get("agentId")
    if isinstance(agent_id, str) and agent_id:
        scope["agentId"] = agent_id

    agent_name = value.get("agentName")
    if isinstance(agent_name, str) and agent_name:
        scope["agentName"] = agent_name

    return scope or None
