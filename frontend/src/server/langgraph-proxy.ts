import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getServerSession } from "@/server/auth/session";
import { buildProxyRequest, createProxyResponse } from "@/server/proxy";
import { registerThreadScope, registerThreadWorkspace } from "@/server/workspace-storage";

type ThreadSearchPayload = Array<{
  metadata?: Record<string, unknown>;
  values?: {
    thread_data?: {
      workspace_path?: string | null;
      uploads_path?: string | null;
      outputs_path?: string | null;
    } | null;
  } | null;
}>;

function buildJsonHeaders(upstream: Response): Headers {
  const headers = new Headers(upstream.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.set("content-type", "application/json; charset=utf-8");
  return headers;
}

async function filterThreadSearch(
  upstream: Response,
  sessionUserId: string,
  sessionWorkspace: string,
  agentName?: string | null,
  agentId?: string | null,
): Promise<Response> {
  if (!upstream.ok) {
    return createProxyResponse(upstream);
  }

  const payload = (await upstream.json().catch(() => null)) as
    | ThreadSearchPayload
    | null;
  if (!Array.isArray(payload)) {
    return new Response(JSON.stringify(payload), {
      status: upstream.status,
      headers: buildJsonHeaders(upstream),
    });
  }

  const workspaceMarker = `/workspaces/${sessionWorkspace}/`;
  const filtered = payload.filter((thread) => {
    const metadataUserId = thread.metadata?.user_id;
    if (typeof metadataUserId === "string" && metadataUserId.length > 0) {
      if (metadataUserId !== sessionUserId) {
        return false;
      }
      const metadataAgentId = thread.metadata?.agent_id;
      if (
        typeof agentId === "string" &&
        agentId.length > 0 &&
        metadataAgentId !== agentId
      ) {
        return false;
      }
      const metadataAgentName = thread.metadata?.agent_name;
      if (
        typeof agentName === "string" &&
        agentName.length > 0 &&
        metadataAgentName !== agentName
      ) {
        return false;
      }
      return true;
    }

    const threadData = thread.values?.thread_data;
    const candidatePaths = [
      threadData?.workspace_path,
      threadData?.uploads_path,
      threadData?.outputs_path,
    ];
    const inWorkspace = candidatePaths.some(
      (value) => typeof value === "string" && value.includes(workspaceMarker),
    );
    if (!inWorkspace) {
      return false;
    }

    const metadataAgentId = thread.metadata?.agent_id;
    if (
      typeof agentId === "string" &&
      agentId.length > 0 &&
      typeof metadataAgentId === "string" &&
      metadataAgentId !== agentId
    ) {
      return false;
    }

    const metadataAgentName = thread.metadata?.agent_name;
    if (
      typeof agentName === "string" &&
      agentName.length > 0 &&
      typeof metadataAgentName === "string" &&
      metadataAgentName !== agentName
    ) {
      return false;
    }

    return true;
  });

  return new Response(JSON.stringify(filtered), {
    status: upstream.status,
    headers: buildJsonHeaders(upstream),
  });
}

export async function handleLanggraphProxy(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const session = await getServerSession();
  if (!session) {
    const cookieStore = await cookies();
    console.warn("[langgraph proxy] missing session", {
      path: new URL(request.url).pathname,
      hasSessionCookie: cookieStore.has("deerflow_session"),
      cookieNames: cookieStore.getAll().map((cookie) => cookie.name),
      rawCookieHeader: request.headers.get("cookie"),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await context.params;
  const path = `/${(params.path ?? []).join("/")}`;
  const { url, init, resolvedAgentId, resolvedAgentName } = await buildProxyRequest(
    request,
    session,
    path,
    "langgraph",
  );
  const upstream = await fetch(url, init);

  const threadRunMatch = path.match(/^\/threads\/([^/]+)\/runs(?:\/stream)?$/);
  const scopedThreadId = threadRunMatch?.[1];
  if (
    request.method === "POST" &&
    typeof scopedThreadId === "string" &&
    scopedThreadId.length > 0
  ) {
    await registerThreadScope({
      workspace: session.workspace,
      threadId: scopedThreadId,
      agentId: resolvedAgentId ?? null,
      agentName: resolvedAgentName ?? null,
    });
  }

  if (
    request.method === "POST" &&
    path === "/threads" &&
    upstream.ok &&
    upstream.headers.get("content-type")?.includes("application/json")
  ) {
    const payload = (await upstream.json().catch(() => null)) as
      | { thread_id?: string }
      | null;
    const threadId = payload?.thread_id;
    if (typeof threadId === "string" && threadId.length > 0) {
      await registerThreadWorkspace(session.workspace, threadId);
    }
    return new Response(JSON.stringify(payload), {
      status: upstream.status,
      headers: buildJsonHeaders(upstream),
    });
  }

  if (
    request.method === "POST" &&
    path === "/threads/search" &&
    upstream.headers.get("content-type")?.includes("application/json")
  ) {
    return filterThreadSearch(
      upstream,
      session.userId,
      session.workspace,
      resolvedAgentName,
      resolvedAgentId,
    );
  }

  return createProxyResponse(upstream);
}
