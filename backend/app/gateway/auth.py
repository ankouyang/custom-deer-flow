from __future__ import annotations

import os
import secrets
from collections.abc import Awaitable, Callable
from pathlib import Path

from fastapi import HTTPException, Request, status
from starlette.responses import JSONResponse, Response
from dotenv import load_dotenv

from deerflow.context import UserContext, clear_user_context, set_user_context
from deerflow.config.paths import Paths

PROXY_SECRET_HEADER = "x-deerflow-proxy-secret"
USER_ID_HEADER = "x-deerflow-user-id"
USER_EMAIL_HEADER = "x-deerflow-user-email"
USER_NAME_HEADER = "x-deerflow-user-name"
WORKSPACE_HEADER = "x-deerflow-workspace"

load_dotenv()
load_dotenv(Path(__file__).resolve().parents[3] / ".env")


def _get_proxy_secret() -> str:
    secret = os.getenv("DEER_FLOW_PROXY_SHARED_SECRET", "").strip()
    if not secret and os.getenv("ENV", "").lower() != "production" and os.getenv("PYTHON_ENV", "").lower() != "production":
        return "deerflow-dev-proxy-secret"
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="DEER_FLOW_PROXY_SHARED_SECRET is not configured.",
        )
    return secret


def build_user_context(request: Request) -> UserContext:
    provided_secret = request.headers.get(PROXY_SECRET_HEADER, "")
    expected_secret = _get_proxy_secret()
    if not secrets.compare_digest(provided_secret, expected_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized request.",
        )

    user_id = request.headers.get(USER_ID_HEADER, "").strip()
    email = request.headers.get(USER_EMAIL_HEADER, "").strip()
    workspace = request.headers.get(WORKSPACE_HEADER, "").strip()
    name = request.headers.get(USER_NAME_HEADER, "").strip() or None

    if not user_id or not email or not workspace:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authenticated user headers.",
        )

    return UserContext(
        user_id=user_id,
        email=email,
        name=name,
        workspace=Paths.normalize_workspace(workspace),
    )


async def user_context_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    protected = request.url.path.startswith("/api/")
    if not protected:
        return await call_next(request)

    token = None
    try:
        token = set_user_context(build_user_context(request))
        return await call_next(request)
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )
    finally:
        clear_user_context(token)
