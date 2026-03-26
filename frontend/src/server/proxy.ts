import { env } from "@/env";
import { db } from "@/server/db";
import type { AppSession } from "@/server/auth/session";
import { getWorkspaceAgentRuntimeBindings } from "@/server/workspace-agents";

type ProxyTarget = "gateway" | "langgraph";
const DEV_PROXY_SECRET = "deerflow-dev-proxy-secret";
const DEFAULT_AGENT_SLUG = "default-agent";
type AgentRuntimeBindings = {
  skillBindingsManaged: boolean;
  allowedSkillNames: string[] | null;
  toolBindingsManaged: boolean;
  allowedToolGroups: string[] | null;
};

function resolveBaseUrl(target: ProxyTarget): string {
  // Server-side proxying must target the internal services directly.
  // Public NEXT_PUBLIC_* URLs are for browser clients and may point back to nginx,
  // which can create loops and lose auth context.
  if (target === "gateway") {
    return "http://127.0.0.1:8001";
  }
  return "http://127.0.0.1:2024";
}

function ensureJsonObject(
  value: unknown,
): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractAgentSlugFromReferer(referer: string | null): string | null {
  if (!referer) {
    return null;
  }

  try {
    const pathname = new URL(referer).pathname;
    const match = pathname.match(/^\/workspace\/agents\/([^/]+)(?:\/|$)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

async function resolveAgentForRequest(
  session: AppSession,
  agentSlug: string | null,
) {
  if (!agentSlug) {
    return null;
  }

  return db.agent.findFirst({
    where: {
      workspace: session.workspaceId
        ? { id: session.workspaceId }
        : { slug: session.workspace },
      OR: [{ slug: agentSlug }, { name: agentSlug }],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      isDefault: true,
    },
  });
}

export async function buildProxyRequest(
  request: Request,
  session: AppSession,
  path: string,
  target: ProxyTarget,
): Promise<{
  url: string;
  init: RequestInit;
  resolvedAgentName?: string | null;
  resolvedAgentId?: string | null;
}> {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("cookie");
  headers.delete("connection");
  headers.delete("proxy-connection");
  headers.delete("keep-alive");
  headers.delete("upgrade");
  headers.delete("transfer-encoding");

  headers.set(
    "x-deerflow-proxy-secret",
    env.DEER_FLOW_PROXY_SHARED_SECRET ?? DEV_PROXY_SECRET,
  );
  headers.set("x-deerflow-user-id", session.userId);
  headers.set("x-deerflow-user-email", session.email);
  headers.set("x-deerflow-workspace", session.workspace);
  if (session.name) {
    headers.set("x-deerflow-user-name", session.name);
  }

  const requestUrl = new URL(request.url);
  const requestedAgentNameFromQuery =
    requestUrl.searchParams.get("agent_name")?.trim() || null;
  const requestedAgentNameFromReferer = extractAgentSlugFromReferer(
    request.headers.get("referer"),
  );
  let requestedAgentName =
    requestedAgentNameFromQuery ?? requestedAgentNameFromReferer ?? null;
  if (target === "langgraph" && !requestedAgentName) {
    requestedAgentName = DEFAULT_AGENT_SLUG;
  }
  let resolvedAgentName: string | null = null;
  let resolvedAgentId: string | null = null;
  const preResolvedAgent = await resolveAgentForRequest(session, requestedAgentName);
  if (preResolvedAgent) {
    resolvedAgentName = preResolvedAgent.slug;
    resolvedAgentId = preResolvedAgent.id;
    requestedAgentName = preResolvedAgent.slug;
  } else if (requestedAgentName) {
    resolvedAgentName = requestedAgentName;
  }

  if (resolvedAgentName) {
    headers.set("x-deerflow-agent-name", resolvedAgentName);
  } else {
    headers.delete("x-deerflow-agent-name");
  }
  if (resolvedAgentId) {
    headers.set("x-deerflow-agent-id", resolvedAgentId);
  } else {
    headers.delete("x-deerflow-agent-id");
  }

  let runtimeBindings: AgentRuntimeBindings | null = null;

  let body: BodyInit | undefined;
  const contentType = headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (request.method !== "GET" && request.method !== "HEAD") {
    if (isJson) {
      const parsed = ensureJsonObject(await request.json().catch(() => ({})));
      const context = ensureJsonObject(parsed.context);
      const metadata = ensureJsonObject(parsed.metadata);
      const requestedAgentNameFromBody =
        (typeof context.agent_name === "string" && context.agent_name) ||
        (typeof metadata.agent_name === "string" && metadata.agent_name) ||
        null;
      const agent = await resolveAgentForRequest(
        session,
        requestedAgentNameFromBody ?? requestedAgentName,
      );
      if (target === "langgraph" && agent?.id) {
        runtimeBindings = await getWorkspaceAgentRuntimeBindings(
          session,
          agent.id,
        );
      } else {
        runtimeBindings = null;
      }

      metadata.user_id = session.userId;
      metadata.user_email = session.email;
      metadata.workspace = session.workspace;
      if (requestedAgentNameFromBody ?? requestedAgentName) {
        metadata.agent_name =
          agent?.slug ?? requestedAgentNameFromBody ?? requestedAgentName;
      }
      if (agent?.id) {
        metadata.agent_id = agent.id;
      }
      parsed.metadata = metadata;

      if (target === "langgraph") {
        context.user_id = session.userId;
        context.user_email = session.email;
        context.user_name = session.name;
        context.workspace = session.workspace;
        if (requestedAgentNameFromBody ?? requestedAgentName) {
          context.agent_name =
            agent?.slug ?? requestedAgentNameFromBody ?? requestedAgentName;
        }
        if (agent?.id) {
          context.agent_id = agent.id;
        }
        if (runtimeBindings?.skillBindingsManaged) {
          context.allowed_skill_names = runtimeBindings.allowedSkillNames ?? [];
          context.skill_bindings_managed = true;
        }
        if (runtimeBindings?.toolBindingsManaged) {
          context.allowed_tool_groups = runtimeBindings.allowedToolGroups ?? [];
          context.tool_bindings_managed = true;
        }
        parsed.context = context;
      }

      if (runtimeBindings?.skillBindingsManaged) {
        metadata.allowed_skill_names = runtimeBindings.allowedSkillNames ?? [];
        metadata.skill_bindings_managed = true;
      }
      if (runtimeBindings?.toolBindingsManaged) {
        metadata.allowed_tool_groups = runtimeBindings.allowedToolGroups ?? [];
        metadata.tool_bindings_managed = true;
      }

      resolvedAgentName =
        (typeof metadata.agent_name === "string" && metadata.agent_name) ||
        (typeof context.agent_name === "string" && context.agent_name) ||
        resolvedAgentName;
      resolvedAgentId =
        (typeof metadata.agent_id === "string" && metadata.agent_id) ||
        (typeof context.agent_id === "string" && context.agent_id) ||
        resolvedAgentId;

      if (resolvedAgentName) {
        headers.set("x-deerflow-agent-name", resolvedAgentName);
      } else {
        headers.delete("x-deerflow-agent-name");
      }
      if (resolvedAgentId) {
        headers.set("x-deerflow-agent-id", resolvedAgentId);
      } else {
        headers.delete("x-deerflow-agent-id");
      }

      body = JSON.stringify(parsed);
    } else {
      body = await request.arrayBuffer();
    }
  }

  const url = new URL(
    `${resolveBaseUrl(target)}${path}${new URL(request.url).search}`,
  );

  return {
    url: url.toString(),
    init: {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    },
    resolvedAgentName,
    resolvedAgentId,
  };
}

export function createProxyResponse(upstream: Response): Response {
  const headers = new Headers(upstream.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
