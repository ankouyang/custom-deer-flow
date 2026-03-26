from deerflow.agents.lead_agent import prompt as prompt_module


def test_get_memory_context_uses_layered_memory(monkeypatch):
    class MemoryConfig:
        enabled = True
        injection_enabled = True
        max_injection_tokens = 2000

    monkeypatch.setattr(
        "deerflow.config.memory_config.get_memory_config",
        lambda: MemoryConfig(),
    )
    monkeypatch.setattr(
        "deerflow.agents.memory.get_layered_memory_data",
        lambda agent_name=None: {
            "workspace": {
                "user": {
                    "workContext": {"summary": "Shared context"},
                },
                "history": {},
                "facts": [],
            },
            "agent": {
                "user": {},
                "history": {},
                "facts": [
                    {"content": "Private fact", "category": "knowledge", "confidence": 0.9},
                ],
            },
        },
    )

    result = prompt_module._get_memory_context("default-agent")

    assert "<memory>" in result
    assert "Workspace Shared Memory:" in result
    assert "Shared context" in result
    assert "Agent Private Memory:" in result
    assert "Private fact" in result
