"""Tests for lead agent runtime model resolution behavior."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from deerflow.agents.lead_agent import agent as lead_agent_module
from deerflow.config.app_config import AppConfig
from deerflow.config.model_config import ModelConfig
from deerflow.config.sandbox_config import SandboxConfig
from deerflow.config.summarization_config import SummarizationConfig, set_summarization_config


def _make_app_config(models: list[ModelConfig]) -> AppConfig:
    return AppConfig(
        models=models,
        sandbox=SandboxConfig(use="deerflow.sandbox.local:LocalSandboxProvider"),
    )


def _make_model(name: str, *, supports_thinking: bool) -> ModelConfig:
    return ModelConfig(
        name=name,
        display_name=name,
        description=None,
        use="langchain_openai:ChatOpenAI",
        model=name,
        supports_thinking=supports_thinking,
        supports_vision=False,
    )


def test_resolve_model_name_falls_back_to_default(monkeypatch, caplog):
    app_config = _make_app_config(
        [
            _make_model("default-model", supports_thinking=False),
            _make_model("other-model", supports_thinking=True),
        ]
    )

    monkeypatch.setattr(lead_agent_module, "get_app_config", lambda: app_config)

    with caplog.at_level("WARNING"):
        resolved = lead_agent_module._resolve_model_name("missing-model")

    assert resolved == "default-model"
    assert "fallback to default model 'default-model'" in caplog.text


def test_resolve_model_name_uses_default_when_none(monkeypatch):
    app_config = _make_app_config(
        [
            _make_model("default-model", supports_thinking=False),
            _make_model("other-model", supports_thinking=True),
        ]
    )

    monkeypatch.setattr(lead_agent_module, "get_app_config", lambda: app_config)

    resolved = lead_agent_module._resolve_model_name(None)

    assert resolved == "default-model"


def test_resolve_model_name_raises_when_no_models_configured(monkeypatch):
    app_config = _make_app_config([])

    monkeypatch.setattr(lead_agent_module, "get_app_config", lambda: app_config)

    with pytest.raises(
        ValueError,
        match="No chat models are configured",
    ):
        lead_agent_module._resolve_model_name("missing-model")


def test_make_lead_agent_disables_thinking_when_model_does_not_support_it(monkeypatch):
    app_config = _make_app_config([_make_model("safe-model", supports_thinking=False)])

    import deerflow.tools as tools_module

    monkeypatch.setattr(lead_agent_module, "get_app_config", lambda: app_config)
    monkeypatch.setattr(tools_module, "get_available_tools", lambda **kwargs: [])
    monkeypatch.setattr(lead_agent_module, "_build_middlewares", lambda config, model_name, agent_name=None: [])

    captured: dict[str, object] = {}

    def _fake_create_chat_model(*, name, thinking_enabled, reasoning_effort=None):
        captured["name"] = name
        captured["thinking_enabled"] = thinking_enabled
        captured["reasoning_effort"] = reasoning_effort
        return object()

    monkeypatch.setattr(lead_agent_module, "create_chat_model", _fake_create_chat_model)
    monkeypatch.setattr(lead_agent_module, "create_agent", lambda **kwargs: kwargs)

    result = lead_agent_module.make_lead_agent(
        {
            "configurable": {
                "model_name": "safe-model",
                "thinking_enabled": True,
                "is_plan_mode": False,
                "subagent_enabled": False,
            }
        }
    )

    assert captured["name"] == "safe-model"
    assert captured["thinking_enabled"] is False
    assert result["model"] is not None


def test_build_middlewares_uses_resolved_model_name_for_vision(monkeypatch):
    app_config = _make_app_config(
        [
            _make_model("stale-model", supports_thinking=False),
            ModelConfig(
                name="vision-model",
                display_name="vision-model",
                description=None,
                use="langchain_openai:ChatOpenAI",
                model="vision-model",
                supports_thinking=False,
                supports_vision=True,
            ),
        ]
    )

    monkeypatch.setattr(lead_agent_module, "get_app_config", lambda: app_config)
    monkeypatch.setattr(lead_agent_module, "_create_summarization_middleware", lambda: None)
    monkeypatch.setattr(lead_agent_module, "_create_todo_list_middleware", lambda is_plan_mode: None)

    middlewares = lead_agent_module._build_middlewares(
        {"configurable": {"model_name": "stale-model", "is_plan_mode": False, "subagent_enabled": False}},
        model_name="vision-model",
    )

    assert any(isinstance(m, lead_agent_module.ViewImageMiddleware) for m in middlewares)


def test_create_summarization_middleware_enforces_minimum_keep(monkeypatch):
    set_summarization_config(
        SummarizationConfig(
            enabled=True,
            keep={"type": "messages", "value": 10},
        )
    )

    captured: dict[str, object] = {}

    class FakeSummarizationMiddleware:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(lead_agent_module, "create_chat_model", lambda thinking_enabled=False: MagicMock())
    monkeypatch.setattr(lead_agent_module, "SummarizationMiddleware", FakeSummarizationMiddleware)

    lead_agent_module._create_summarization_middleware()

    assert captured["keep"] == ("messages", 30)


def test_make_lead_agent_uses_default_agent_slug_when_missing(monkeypatch):
    app_config = _make_app_config([_make_model("safe-model", supports_thinking=False)])

    import deerflow.tools as tools_module

    monkeypatch.setattr(lead_agent_module, "get_app_config", lambda: app_config)
    monkeypatch.setattr(tools_module, "get_available_tools", lambda **kwargs: [])
    monkeypatch.setattr(lead_agent_module, "load_agent_config", lambda agent_name: None)
    monkeypatch.setattr(lead_agent_module, "apply_prompt_template", lambda **kwargs: "")

    captured: dict[str, object] = {}

    def _fake_build_middlewares(config, model_name, agent_name=None):
        captured["agent_name"] = agent_name
        return []

    monkeypatch.setattr(lead_agent_module, "_build_middlewares", _fake_build_middlewares)
    monkeypatch.setattr(lead_agent_module, "create_chat_model", lambda **kwargs: object())
    monkeypatch.setattr(lead_agent_module, "create_agent", lambda **kwargs: kwargs)

    result = lead_agent_module.make_lead_agent(
        {
            "configurable": {
                "is_plan_mode": False,
                "subagent_enabled": False,
            }
        }
    )

    assert captured["agent_name"] == "default-agent"
    assert result["middleware"] == []


def test_make_lead_agent_uses_runtime_skill_and_tool_bindings(monkeypatch):
    app_config = _make_app_config([_make_model("safe-model", supports_thinking=False)])

    import deerflow.tools as tools_module

    monkeypatch.setattr(lead_agent_module, "get_app_config", lambda: app_config)
    monkeypatch.setattr(
        lead_agent_module,
        "load_agent_config",
        lambda agent_name: type(
            "AgentConfig",
            (),
            {
                "model": None,
                "tool_groups": ["legacy-group"],
            },
        )(),
    )

    captured: dict[str, object] = {}

    def _fake_get_available_tools(**kwargs):
        captured["tool_groups"] = kwargs.get("groups")
        return []

    monkeypatch.setattr(tools_module, "get_available_tools", _fake_get_available_tools)
    monkeypatch.setattr(lead_agent_module, "_build_middlewares", lambda config, model_name, agent_name=None: [])
    monkeypatch.setattr(lead_agent_module, "create_chat_model", lambda **kwargs: object())
    monkeypatch.setattr(lead_agent_module, "create_agent", lambda **kwargs: kwargs)

    def _fake_apply_prompt_template(**kwargs):
        captured["available_skills"] = kwargs.get("available_skills")
        return ""

    monkeypatch.setattr(lead_agent_module, "apply_prompt_template", _fake_apply_prompt_template)

    lead_agent_module.make_lead_agent(
        {
            "configurable": {
                "is_plan_mode": False,
                "subagent_enabled": False,
                "skill_bindings_managed": True,
                "allowed_skill_names": ["skill-a", "skill-b", "skill-a"],
                "tool_bindings_managed": True,
                "allowed_tool_groups": ["bash", "file:read", "bash"],
            }
        }
    )

    assert captured["tool_groups"] == ["bash", "file:read"]
    assert captured["available_skills"] == {"skill-a", "skill-b"}


def test_make_lead_agent_allows_explicit_empty_runtime_bindings(monkeypatch):
    app_config = _make_app_config([_make_model("safe-model", supports_thinking=False)])

    import deerflow.tools as tools_module

    monkeypatch.setattr(lead_agent_module, "get_app_config", lambda: app_config)
    monkeypatch.setattr(
        lead_agent_module,
        "load_agent_config",
        lambda agent_name: type(
            "AgentConfig",
            (),
            {
                "model": None,
                "tool_groups": ["legacy-group"],
            },
        )(),
    )

    captured: dict[str, object] = {}

    def _fake_get_available_tools(**kwargs):
        captured["tool_groups"] = kwargs.get("groups")
        return []

    monkeypatch.setattr(tools_module, "get_available_tools", _fake_get_available_tools)
    monkeypatch.setattr(lead_agent_module, "_build_middlewares", lambda config, model_name, agent_name=None: [])
    monkeypatch.setattr(lead_agent_module, "create_chat_model", lambda **kwargs: object())
    monkeypatch.setattr(lead_agent_module, "create_agent", lambda **kwargs: kwargs)

    def _fake_apply_prompt_template(**kwargs):
        captured["available_skills"] = kwargs.get("available_skills")
        return ""

    monkeypatch.setattr(lead_agent_module, "apply_prompt_template", _fake_apply_prompt_template)

    lead_agent_module.make_lead_agent(
        {
            "configurable": {
                "is_plan_mode": False,
                "subagent_enabled": False,
                "skill_bindings_managed": True,
                "allowed_skill_names": [],
                "tool_bindings_managed": True,
                "allowed_tool_groups": [],
            }
        }
    )

    assert captured["tool_groups"] == []
    assert captured["available_skills"] == set()
