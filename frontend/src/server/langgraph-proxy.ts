import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getServerSession } from "@/server/auth/session";
import { buildProxyRequest, createProxyResponse } from "@/server/proxy";
import { registerThreadWorkspace } from "@/server/workspace-storage";

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
      return metadataUserId === sessionUserId;
    }

    const threadData = thread.values?.thread_data;
    const candidatePaths = [
      threadData?.workspace_path,
      threadData?.uploads_path,
      threadData?.outputs_path,
    ];
    return candidatePaths.some(
      (value) => typeof value === "string" && value.includes(workspaceMarker),
    );
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
  const { url, init } = await buildProxyRequest(
    request,
    session,
    path,
    "langgraph",
  );
  const upstream = await fetch(url, init);

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
    return filterThreadSearch(upstream, session.userId, session.workspace);
  }

  return createProxyResponse(upstream);
}
