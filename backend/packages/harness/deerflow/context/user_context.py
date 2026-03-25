from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass


@dataclass(frozen=True)
class UserContext:
    user_id: str
    email: str
    workspace: str
    name: str | None = None


_user_context: ContextVar[UserContext | None] = ContextVar(
    "deerflow_user_context",
    default=None,
)


def set_user_context(context: UserContext) -> Token[UserContext | None]:
    return _user_context.set(context)


def clear_user_context(token: Token[UserContext | None] | None = None) -> None:
    if token is not None:
        try:
            _user_context.reset(token)
            return
        except ValueError:
            pass
    _user_context.set(None)


def get_current_user_context() -> UserContext | None:
    return _user_context.get()


def get_current_workspace() -> str | None:
    context = get_current_user_context()
    return context.workspace if context else None
