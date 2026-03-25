#!/usr/bin/env python3
"""Migrate legacy shared DeerFlow storage into a workspace-scoped directory.

This is intentionally conservative:
- It does not try to infer per-user ownership for old global data.
- It migrates the legacy shared root into one target workspace.
- By default, use `_legacy-global` so old data is preserved without assigning it
  to the wrong user.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
from pathlib import Path
from typing import Any

import ormsgpack

import sys

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from deerflow.config.paths import Paths  # noqa: E402


LEGACY_ITEMS = ("threads", "agents", "channels", "memory.json", "USER.md")
CHECKPOINT_FILES = ("checkpoints.db", "checkpoints.db-shm", "checkpoints.db-wal")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--workspace",
        default="legacy-global",
        help="Target workspace name. Defaults to legacy-global.",
    )
    parser.add_argument(
        "--source-root",
        default=str(BACKEND_ROOT / ".deer-flow"),
        help="Legacy DeerFlow storage root to migrate from.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show planned actions without writing changes.",
    )
    return parser.parse_args()


def replace_paths(value: Any, old_prefix: str, new_prefix: str) -> Any:
    if isinstance(value, str):
        return value.replace(old_prefix, new_prefix)
    if isinstance(value, list):
        return [replace_paths(item, old_prefix, new_prefix) for item in value]
    if isinstance(value, tuple):
        return tuple(replace_paths(item, old_prefix, new_prefix) for item in value)
    if isinstance(value, dict):
        return {
            replace_paths(key, old_prefix, new_prefix): replace_paths(val, old_prefix, new_prefix)
            for key, val in value.items()
        }
    return value


def merge_directory(src: Path, dst: Path, dry_run: bool) -> list[str]:
    actions: list[str] = []
    if not src.exists():
        return actions

    dst.mkdir(parents=True, exist_ok=True)
    for child in sorted(src.iterdir()):
        target = dst / child.name
        if child.is_dir():
            if target.exists() and target.is_dir():
                actions.extend(merge_directory(child, target, dry_run))
            else:
                actions.append(f"move dir {child} -> {target}")
                if not dry_run:
                    shutil.move(str(child), str(target))
        else:
            if target.exists():
                backup = target.with_name(f"{target.name}.legacy")
                actions.append(f"conflict file {target}, moving source to {backup}")
                if not dry_run:
                    shutil.move(str(child), str(backup))
            else:
                actions.append(f"move file {child} -> {target}")
                if not dry_run:
                    shutil.move(str(child), str(target))
    if not dry_run:
        try:
            src.rmdir()
        except OSError:
            pass
    return actions


def migrate_checkpoints_db(source_db: Path, target_db: Path, old_threads_dir: Path, new_threads_dir: Path, dry_run: bool) -> list[str]:
    actions: list[str] = []
    existing_target = target_db.exists() and target_db.stat().st_size > 0
    source_has_data = source_db.exists() and source_db.stat().st_size > 0

    if not source_has_data and not existing_target:
        return actions

    target_db.parent.mkdir(parents=True, exist_ok=True)
    if source_has_data:
        actions.append(f"move checkpoint db {source_db} -> {target_db}")
    else:
        actions.append(f"rewrite checkpoint db in place {target_db}")
    if dry_run:
        return actions

    if source_has_data:
        if target_db.exists():
            target_db.unlink()
        shutil.move(str(source_db), str(target_db))

    old_prefix = str(old_threads_dir.resolve())
    new_prefix = str(new_threads_dir.resolve())

    conn = sqlite3.connect(target_db)
    cur = conn.cursor()

    rows = cur.execute("SELECT rowid, checkpoint, type FROM checkpoints").fetchall()
    for rowid, payload, payload_type in rows:
        if payload_type != "msgpack" or payload is None:
            continue
        decoded = ormsgpack.unpackb(
            payload,
            ext_hook=lambda code, data: ormsgpack.Ext(code, data),
        )
        updated = replace_paths(decoded, old_prefix, new_prefix)
        if updated != decoded:
            cur.execute(
                "UPDATE checkpoints SET checkpoint = ? WHERE rowid = ?",
                (ormsgpack.packb(updated), rowid),
            )

    rows = cur.execute("SELECT rowid, value, type FROM writes").fetchall()
    for rowid, payload, payload_type in rows:
        if payload_type != "msgpack" or payload is None:
            continue
        decoded = ormsgpack.unpackb(
            payload,
            ext_hook=lambda code, data: ormsgpack.Ext(code, data),
        )
        updated = replace_paths(decoded, old_prefix, new_prefix)
        if updated != decoded:
            cur.execute(
                "UPDATE writes SET value = ? WHERE rowid = ?",
                (ormsgpack.packb(updated), rowid),
            )

    conn.commit()
    conn.close()
    return actions


def move_if_exists(src: Path, dst: Path, dry_run: bool) -> list[str]:
    if not src.exists():
        return []
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        if src.is_dir() and dst.is_dir():
            return merge_directory(src, dst, dry_run)
        backup = dst.with_name(f"{dst.name}.legacy")
        actions = [f"conflict at {dst}, moving source to {backup}"]
        if not dry_run:
            shutil.move(str(src), str(backup))
        return actions
    actions = [f"move {src} -> {dst}"]
    if not dry_run:
        shutil.move(str(src), str(dst))
    return actions


def main() -> int:
    args = parse_args()
    workspace = Paths.normalize_workspace(args.workspace)
    source_root = Path(args.source_root).resolve()
    storage_root = source_root
    target_root = storage_root / "workspaces" / workspace

    if not source_root.exists():
        print(f"Source root does not exist: {source_root}")
        return 1

    actions: list[str] = [f"workspace target: {workspace}", f"source root: {source_root}", f"target root: {target_root}"]

    for name in LEGACY_ITEMS:
        src = source_root / name
        dst = target_root / name
        actions.extend(move_if_exists(src, dst, args.dry_run))

    source_db = source_root / "checkpoints.db"
    target_db = target_root / "checkpoints.db"
    actions.extend(
        migrate_checkpoints_db(
            source_db,
            target_db,
            source_root / "threads",
            target_root / "threads",
            args.dry_run,
        )
    )

    for sidecar in ("checkpoints.db-shm", "checkpoints.db-wal"):
        src = source_root / sidecar
        dst = target_root / sidecar
        actions.extend(move_if_exists(src, dst, args.dry_run))

    if not args.dry_run:
        workspaces_dir = source_root / "workspaces"
        workspaces_dir.mkdir(parents=True, exist_ok=True)

    print(json.dumps(actions, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
