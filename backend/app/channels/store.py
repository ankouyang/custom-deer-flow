"""ChannelStore — persists IM chat-to-DeerFlow thread mappings."""

from __future__ import annotations

import json
import logging
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class ChannelStore:
    """JSON-file-backed store that maps IM conversations to DeerFlow threads.

    Data layout (on disk)::

        {
            "<channel_name>:<chat_id>": {
                "thread_id": "<uuid>",
                "user_id": "<platform_user>",
                "created_at": 1700000000.0,
                "updated_at": 1700000000.0
            },
            ...
        }

    The store is intentionally simple — a single JSON file that is atomically
    rewritten on every mutation. For production workloads with high concurrency,
    this can be swapped for a proper database backend.
    """

    def __init__(self, path: str | Path | None = None) -> None:
        self._explicit_path = Path(path) if path is not None else None
        self._data_by_path: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    # -- persistence -------------------------------------------------------

    def _path(self) -> Path:
        if self._explicit_path is not None:
            path = self._explicit_path
        else:
            from deerflow.config.paths import get_paths

            path = Path(get_paths().base_dir) / "channels" / "store.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def _get_data(self) -> dict[str, dict[str, Any]]:
        path = self._path()
        key = str(path.resolve())
        if key not in self._data_by_path:
            self._data_by_path[key] = self._load(path)
        return self._data_by_path[key]

    def _load(self, path: Path) -> dict[str, dict[str, Any]]:
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                logger.warning("Corrupt channel store at %s, starting fresh", path)
        return {}

    def _save(self) -> None:
        path = self._path()
        data = self._get_data()
        fd = tempfile.NamedTemporaryFile(
            mode="w",
            dir=path.parent,
            suffix=".tmp",
            delete=False,
        )
        try:
            json.dump(data, fd, indent=2)
            fd.close()
            Path(fd.name).replace(path)
        except BaseException:
            fd.close()
            Path(fd.name).unlink(missing_ok=True)
            raise

    # -- key helpers -------------------------------------------------------

    @staticmethod
    def _key(channel_name: str, chat_id: str, topic_id: str | None = None) -> str:
        if topic_id:
            return f"{channel_name}:{chat_id}:{topic_id}"
        return f"{channel_name}:{chat_id}"

    # -- public API --------------------------------------------------------

    def get_thread_id(self, channel_name: str, chat_id: str, topic_id: str | None = None) -> str | None:
        """Look up the DeerFlow thread_id for a given IM conversation/topic."""
        entry = self._get_data().get(self._key(channel_name, chat_id, topic_id))
        return entry["thread_id"] if entry else None

    def set_thread_id(
        self,
        channel_name: str,
        chat_id: str,
        thread_id: str,
        *,
        topic_id: str | None = None,
        user_id: str = "",
    ) -> None:
        """Create or update the mapping for an IM conversation/topic."""
        with self._lock:
            data = self._get_data()
            key = self._key(channel_name, chat_id, topic_id)
            now = time.time()
            existing = data.get(key)
            data[key] = {
                "thread_id": thread_id,
                "user_id": user_id,
                "created_at": existing["created_at"] if existing else now,
                "updated_at": now,
            }
            self._save()

    def remove(self, channel_name: str, chat_id: str, topic_id: str | None = None) -> bool:
        """Remove a mapping.

        If ``topic_id`` is provided, only that specific conversation/topic mapping is removed.
        If ``topic_id`` is omitted, all mappings whose key starts with
        ``"<channel_name>:<chat_id>"`` (including topic-specific ones) are removed.

        Returns True if at least one mapping was removed.
        """
        with self._lock:
            data = self._get_data()
            # Remove a specific conversation/topic mapping.
            if topic_id is not None:
                key = self._key(channel_name, chat_id, topic_id)
                if key in data:
                    del data[key]
                    self._save()
                    return True
                return False

            # Remove all mappings for this channel/chat_id (base and any topic-specific keys).
            prefix = self._key(channel_name, chat_id)
            keys_to_delete = [k for k in data if k == prefix or k.startswith(prefix + ":")]
            if not keys_to_delete:
                return False

            for k in keys_to_delete:
                del data[k]
            self._save()
            return True

    def list_entries(self, channel_name: str | None = None) -> list[dict[str, Any]]:
        """List all stored mappings, optionally filtered by channel."""
        results = []
        for key, entry in self._get_data().items():
            parts = key.split(":", 2)
            ch = parts[0]
            chat = parts[1] if len(parts) > 1 else ""
            topic = parts[2] if len(parts) > 2 else None
            if channel_name and ch != channel_name:
                continue
            item: dict[str, Any] = {"channel_name": ch, "chat_id": chat, **entry}
            if topic is not None:
                item["topic_id"] = topic
            results.append(item)
        return results
