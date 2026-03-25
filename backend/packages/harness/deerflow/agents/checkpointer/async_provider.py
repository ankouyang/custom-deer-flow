"""Async checkpointer factory.

Provides an **async context manager** for long-running async servers that need
proper resource cleanup.

Supported backends: memory, sqlite, postgres.

Usage (e.g. FastAPI lifespan)::

    from deerflow.agents.checkpointer.async_provider import make_checkpointer

    async with make_checkpointer() as checkpointer:
        app.state.checkpointer = checkpointer  # InMemorySaver if not configured

For sync usage see :mod:`deerflow.agents.checkpointer.provider`.
"""

from __future__ import annotations

import contextlib
import logging
from collections.abc import AsyncIterator
import asyncio

from langgraph.types import Checkpointer

from deerflow.agents.checkpointer.provider import (
    POSTGRES_CONN_REQUIRED,
    POSTGRES_INSTALL,
    SQLITE_INSTALL,
    _extract_thread_id,
    _resolve_sqlite_conn_str,
    _resolve_sqlite_conn_str_for_workspace,
)
from deerflow.config.app_config import get_app_config
from deerflow.context import get_current_workspace
from deerflow.config.workspace_registry import get_workspace_for_thread

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Async factory
# ---------------------------------------------------------------------------


class WorkspaceAwareAsyncSqliteSaver:
    """Route async SQLite checkpoint operations to a workspace-specific DB."""

    def __init__(self, raw_conn_str: str) -> None:
        self._raw_conn_str = raw_conn_str
        self._savers: dict[str | None, object] = {}
        self._contexts: dict[str | None, object] = {}
        self._lock = asyncio.Lock()

    async def _get_saver(self, config=None, *, thread_id: str | None = None):
        workspace = get_current_workspace()
        if not workspace:
            resolved_thread_id = thread_id or _extract_thread_id(config)
            if resolved_thread_id:
                workspace = get_workspace_for_thread(resolved_thread_id)
        async with self._lock:
            saver = self._savers.get(workspace)
            if saver is not None:
                return saver

            try:
                from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
            except ImportError as exc:
                raise ImportError(SQLITE_INSTALL) from exc

            conn_str = _resolve_sqlite_conn_str_for_workspace(
                self._raw_conn_str,
                workspace,
            )
            ctx = AsyncSqliteSaver.from_conn_string(conn_str)
            saver = await ctx.__aenter__()
            await saver.setup()
            self._contexts[workspace] = ctx
            self._savers[workspace] = saver
            logger.info(
                "Checkpointer: using workspace AsyncSqliteSaver (%s) for workspace=%s",
                conn_str,
                workspace or "__global__",
            )
            return saver

    async def aclose(self) -> None:
        async with self._lock:
            contexts = list(self._contexts.values())
            self._contexts.clear()
            self._savers.clear()

        for ctx in contexts:
            await ctx.__aexit__(None, None, None)

    async def aget(self, config):
        saver = await self._get_saver(config)
        return await saver.aget(config)

    async def aget_tuple(self, config):
        saver = await self._get_saver(config)
        return await saver.aget_tuple(config)

    async def aput(self, config, checkpoint, metadata, new_versions):
        saver = await self._get_saver(config)
        return await saver.aput(config, checkpoint, metadata, new_versions)

    async def aput_writes(self, config, writes, task_id, task_path=""):
        saver = await self._get_saver(config)
        return await saver.aput_writes(config, writes, task_id, task_path)

    async def alist(self, config, *, filter=None, before=None, limit=None):
        saver = await self._get_saver(config)
        async for item in saver.alist(
            config,
            filter=filter,
            before=before,
            limit=limit,
        ):
            yield item

    async def adelete_thread(self, thread_id: str):
        saver = await self._get_saver(thread_id=thread_id)
        return await saver.adelete_thread(thread_id)

    async def setup(self) -> None:
        return None


@contextlib.asynccontextmanager
async def _async_checkpointer(config) -> AsyncIterator[Checkpointer]:
    """Async context manager that constructs and tears down a checkpointer."""
    if config.type == "memory":
        from langgraph.checkpoint.memory import InMemorySaver

        yield InMemorySaver()
        return

    if config.type == "sqlite":
        saver = WorkspaceAwareAsyncSqliteSaver(config.connection_string or "store.db")
        try:
            yield saver
        finally:
            await saver.aclose()
        return

    if config.type == "postgres":
        try:
            from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        except ImportError as exc:
            raise ImportError(POSTGRES_INSTALL) from exc

        if not config.connection_string:
            raise ValueError(POSTGRES_CONN_REQUIRED)

        async with AsyncPostgresSaver.from_conn_string(config.connection_string) as saver:
            await saver.setup()
            yield saver
        return

    raise ValueError(f"Unknown checkpointer type: {config.type!r}")


# ---------------------------------------------------------------------------
# Public async context manager
# ---------------------------------------------------------------------------


@contextlib.asynccontextmanager
async def make_checkpointer() -> AsyncIterator[Checkpointer]:
    """Async context manager that yields a checkpointer for the caller's lifetime.
    Resources are opened on enter and closed on exit — no global state::

        async with make_checkpointer() as checkpointer:
            app.state.checkpointer = checkpointer

    Yields an ``InMemorySaver`` when no checkpointer is configured in *config.yaml*.
    """

    config = get_app_config()

    if config.checkpointer is None:
        from langgraph.checkpoint.memory import InMemorySaver

        yield InMemorySaver()
        return

    async with _async_checkpointer(config.checkpointer) as saver:
        yield saver
