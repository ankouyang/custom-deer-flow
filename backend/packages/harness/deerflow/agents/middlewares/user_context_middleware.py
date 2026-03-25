from typing import override

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langgraph.runtime import Runtime

from deerflow.context import UserContext, clear_user_context, set_user_context
from deerflow.config.paths import Paths


class UserContextMiddleware(AgentMiddleware[AgentState]):
    """Bind runtime user/workspace info to the current execution context."""

    @override
    def before_agent(self, state: AgentState, runtime: Runtime) -> dict | None:
        context = runtime.context or {}
        workspace = context.get("workspace")
        user_id = context.get("user_id")
        email = context.get("user_email")
        name = context.get("user_name")

        if workspace and user_id and email:
            set_user_context(
                UserContext(
                    user_id=str(user_id),
                    email=str(email),
                    name=str(name) if name else None,
                    workspace=Paths.normalize_workspace(str(workspace)),
                )
            )
        return None

    @override
    def after_agent(self, state: AgentState, runtime: Runtime) -> dict | None:
        clear_user_context()
        return None
