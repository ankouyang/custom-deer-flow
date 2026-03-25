from __future__ import annotations

import json
from pathlib import Path


def _registry_file() -> Path:
    from deerflow.config.paths import Paths

    return Paths().storage_root_dir / "thread-workspaces.json"


def get_workspace_for_thread(thread_id: str) -> str | None:
    path = _registry_file()
    if not path.exists():
        return None

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None

    value = data.get(thread_id)
    return value if isinstance(value, str) and value else None
