import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getServerSession } from "@/server/auth/session";
import { buildProxyRequest, createProxyResponse } from "@/server/proxy";
import { registerThreadScope } from "@/server/workspace-storage";
import { syncThreadArtifacts } from "@/server/workspace-thread-assets";
import { deleteWorkspaceThread, upsertWorkspaceThread } from "@/server/workspace-threads";

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

async function normalizeThreadStateError(
  upstream: Response,
  path: string,
  request: Request,
  session: Awaited<ReturnType<typeof getServerSession>>,
): Promise<Response> {
  if (upstream.status !== 500 || !/^\/threads\/[^/]+\/state$/.test(path)) {
    return createProxyResponse(upstream);
  }

  const threadId = path.match(/^\/threads\/([^/]+)\/state$/)?.[1];
  if (!threadId || !session) {
    return createProxyResponse(upstream);
  }

  try {
    const probeRequest = new Request(
      new URL("/api/lg/threads/search", request.url),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: [threadId],
          limit: 1,
          select: ["thread_id", "values", "metadata", "updated_at"],
        }),
      },
    );
    const probe = await buildProxyRequest(
      probeRequest,
      session,
      "/threads/search",
      "langgraph",
    );
    const probeUpstream = await fetch(probe.url, probe.init);
    const probePayload = (await probeUpstream.json().catch(() => null)) as
      | Array<{
          thread_id?: string;
          values?: Record<string, unknown> | null;
          metadata?: Record<string, unknown> | null;
          updated_at?: string | null;
        }>
      | null;
    if (
      probeUpstream.ok &&
      Array.isArray(probePayload) &&
      probePayload.length === 0
    ) {
      return new Response(
        JSON.stringify({ detail: `thread ${threadId} not found` }),
        {
          status: 404,
          headers: new Headers({
            "content-type": "application/json; charset=utf-8",
          }),
        },
      );
    }
    const thread = probePayload?.[0];
    if (probeUpstream.ok && thread?.thread_id) {
      return new Response(
        JSON.stringify({
          values: thread.values ?? {},
          next: [],
          checkpoint: {
            checkpoint_id: thread.thread_id,
            thread_id: thread.thread_id,
            checkpoint_ns: "",
            checkpoint_map: {},
          },
          metadata: thread.metadata ?? {},
          created_at: thread.updated_at ?? null,
          parent_checkpoint: null,
          tasks: [],
        }),
        {
          status: 200,
          headers: new Headers({
            "content-type": "application/json; charset=utf-8",
          }),
        },
      );
    }
  } catch {
    return createProxyResponse(upstream);
  }

  const bodyText = await upstream.text().catch(() => "Internal Server Error");
  return new Response(
    bodyText,
    {
      status: upstream.status,
      headers: new Headers({
        "content-type":
          upstream.headers.get("content-type") ?? "text/plain; charset=utf-8",
      }),
    },
  );
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

async function syncArtifactsFromThreadState(
  upstream: Response,
  path: string,
  session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>,
  agentId?: string | null,
): Promise<Response> {
  const stateMatch = path.match(/^\/threads\/([^/]+)\/state$/);
  if (
    !stateMatch ||
    !upstream.ok ||
    !upstream.headers.get("content-type")?.includes("application/json")
  ) {
    return createProxyResponse(upstream);
  }

  const payload = (await upstream.json().catch(() => null)) as
    | {
        values?: {
          artifacts?: unknown;
        } | null;
      }
    | null;
  const artifactPaths = Array.isArray(payload?.values?.artifacts)
    ? payload.values.artifacts.filter(
        (artifact): artifact is string =>
          typeof artifact === "string" && artifact.length > 0,
      )
    : [];

  if (artifactPaths.length > 0) {
    await syncThreadArtifacts(
      session,
      stateMatch[1]!,
      artifactPaths,
      agentId ?? null,
    );
  }

  return new Response(JSON.stringify(payload), {
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
  if (request.method === "POST" && path === "/threads") {
    console.info("[langgraph proxy] create thread start", {
      workspace: session.workspace,
      workspaceId: session.workspaceId,
      userId: session.userId,
      resolvedAgentId,
      resolvedAgentName,
      url: url.toString(),
    });
  }
  const upstream = await fetch(url, init);
  if (request.method === "POST" && path === "/threads") {
    console.info("[langgraph proxy] create thread upstream responded", {
      ok: upstream.ok,
      status: upstream.status,
      contentType: upstream.headers.get("content-type"),
    });
  }

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
    console.info("[langgraph proxy] create thread syncing local state");
    const payload = (await upstream.json().catch(() => null)) as
      | { thread_id?: string }
      | null;
    const threadId = payload?.thread_id;
    if (typeof threadId === "string" && threadId.length > 0) {
      console.info("[langgraph proxy] create thread register scope", {
        threadId,
      });
      await registerThreadScope({
        workspace: session.workspace,
        threadId,
        agentId: resolvedAgentId ?? null,
        agentName: resolvedAgentName ?? null,
      });
      console.info("[langgraph proxy] create thread upsert db", {
        threadId,
      });
      await upsertWorkspaceThread(session, {
        threadId,
        agentId: resolvedAgentId ?? null,
      });
      console.info("[langgraph proxy] create thread done", {
        threadId,
      });
    }
    return new Response(JSON.stringify(payload), {
      status: upstream.status,
      headers: buildJsonHeaders(upstream),
    });
  }

  const deleteThreadMatch =
    request.method === "DELETE"
      ? path.match(/^\/threads\/([^/]+)$/)
      : null;
  const deletedThreadId = deleteThreadMatch?.[1];
  if (deletedThreadId && upstream.ok) {
    await deleteWorkspaceThread(session, deletedThreadId);
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

  if (request.method === "GET" && /^\/threads\/[^/]+\/state$/.test(path)) {
    return syncArtifactsFromThreadState(
      await normalizeThreadStateError(upstream, path, request, session),
      path,
      session,
      resolvedAgentId,
    );
  }

  return normalizeThreadStateError(upstream, path, request, session);
}
