from __future__ import annotations

import logging
import re
import shutil
from pathlib import Path

import yaml
from fastapi import HTTPException

from deerflow.config.agents_config import (
    AgentConfig,
    list_custom_agents,
    load_agent_config,
    load_agent_soul,
)
from deerflow.config.paths import get_paths

logger = logging.getLogger(__name__)

AGENT_NAME_PATTERN = re.compile(r"^[A-Za-z0-9-]+$")


class AgentService:
    """Service layer for filesystem-backed custom agents."""

    def _agent_dir(self, name: str, *, base_dir: Path | None = None) -> Path:
        paths = get_paths() if base_dir is None else None
        if base_dir is not None:
            return base_dir / "agents" / name
        return paths.agent_dir(name)

    def validate_agent_name(self, name: str) -> None:
        if not AGENT_NAME_PATTERN.match(name):
            raise HTTPException(
                status_code=422,
                detail=f"Invalid agent name '{name}'. Must match ^[A-Za-z0-9-]+$ (letters, digits, and hyphens only).",
            )

    def normalize_agent_name(self, name: str) -> str:
        return name.lower()

    def list_agents(self) -> list[AgentConfig]:
        return list_custom_agents()

    def check_agent_name(
        self,
        name: str,
        *,
        base_dir: Path | None = None,
    ) -> dict[str, str | bool]:
        self.validate_agent_name(name)
        normalized = self.normalize_agent_name(name)
        available = not self._agent_dir(normalized, base_dir=base_dir).exists()
        return {"available": available, "name": normalized}

    def get_agent(self, name: str) -> tuple[AgentConfig, str | None]:
        self.validate_agent_name(name)
        normalized = self.normalize_agent_name(name)
        try:
            return load_agent_config(normalized), load_agent_soul(normalized)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail=f"Agent '{normalized}' not found")

    def create_agent(
        self,
        *,
        name: str,
        description: str = "",
        model: str | None = None,
        tool_groups: list[str] | None = None,
        soul: str = "",
        base_dir: Path | None = None,
    ) -> tuple[AgentConfig, str | None]:
        self.validate_agent_name(name)
        normalized = self.normalize_agent_name(name)
        agent_dir = self._agent_dir(normalized, base_dir=base_dir)

        if agent_dir.exists():
            raise HTTPException(status_code=409, detail=f"Agent '{normalized}' already exists")

        try:
            agent_dir.mkdir(parents=True, exist_ok=True)

            config_data: dict = {"name": normalized}
            if description:
                config_data["description"] = description
            if model is not None:
                config_data["model"] = model
            if tool_groups is not None:
                config_data["tool_groups"] = tool_groups

            config_file = agent_dir / "config.yaml"
            with open(config_file, "w", encoding="utf-8") as f:
                yaml.dump(config_data, f, default_flow_style=False, allow_unicode=True)

            (agent_dir / "SOUL.md").write_text(soul, encoding="utf-8")

            logger.info("Created agent '%s' at %s", normalized, agent_dir)
            return load_agent_config(normalized), load_agent_soul(normalized)
        except HTTPException:
            raise
        except Exception as e:
            if agent_dir.exists():
                shutil.rmtree(agent_dir)
            logger.error("Failed to create agent '%s': %s", name, e, exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to create agent: {str(e)}")

    def update_agent(
        self,
        *,
        name: str,
        description: str | None = None,
        model: str | None = None,
        tool_groups: list[str] | None = None,
        soul: str | None = None,
        base_dir: Path | None = None,
    ) -> tuple[AgentConfig, str | None]:
        self.validate_agent_name(name)
        normalized = self.normalize_agent_name(name)

        try:
            agent_cfg = load_agent_config(normalized)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail=f"Agent '{normalized}' not found")

        agent_dir = self._agent_dir(normalized, base_dir=base_dir)

        try:
            config_changed = any(v is not None for v in [description, model, tool_groups])
            if config_changed:
                updated: dict = {
                    "name": agent_cfg.name,
                    "description": description if description is not None else agent_cfg.description,
                }
                new_model = model if model is not None else agent_cfg.model
                if new_model is not None:
                    updated["model"] = new_model

                new_tool_groups = tool_groups if tool_groups is not None else agent_cfg.tool_groups
                if new_tool_groups is not None:
                    updated["tool_groups"] = new_tool_groups

                with open(agent_dir / "config.yaml", "w", encoding="utf-8") as f:
                    yaml.dump(updated, f, default_flow_style=False, allow_unicode=True)

            if soul is not None:
                (agent_dir / "SOUL.md").write_text(soul, encoding="utf-8")

            logger.info("Updated agent '%s'", normalized)
            return load_agent_config(normalized), load_agent_soul(normalized)
        except HTTPException:
            raise
        except Exception as e:
            logger.error("Failed to update agent '%s': %s", normalized, e, exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to update agent: {str(e)}")

    def delete_agent(self, name: str, *, base_dir: Path | None = None) -> None:
        self.validate_agent_name(name)
        normalized = self.normalize_agent_name(name)
        agent_dir = self._agent_dir(normalized, base_dir=base_dir)

        if not agent_dir.exists():
            raise HTTPException(status_code=404, detail=f"Agent '{normalized}' not found")

        try:
            shutil.rmtree(agent_dir)
            logger.info("Deleted agent '%s' from %s", normalized, agent_dir)
        except Exception as e:
            logger.error("Failed to delete agent '%s': %s", normalized, e, exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to delete agent: {str(e)}")


_agent_service: AgentService | None = None


def get_agent_service() -> AgentService:
    global _agent_service
    if _agent_service is None:
        _agent_service = AgentService()
    return _agent_service
