import type { Agent as DbAgent } from "@prisma/client";

import { env } from "@/env";
import { db } from "@/server/db";
import type { AppSession } from "@/server/auth/session";

const DEV_PROXY_SECRET = "deerflow-dev-proxy-secret";

type GatewayAgent = {
  name: string;
  description: string;
  model: string | null;
  tool_groups: string[] | null;
  soul?: string | null;
};

type GatewayAgentPayload = {
  agents: GatewayAgent[];
};

function gatewayBaseUrl() {
  return "http://127.0.0.1:8001";
}

function buildGatewayHeaders(session: AppSession, contentType?: string) {
  const headers = new Headers();
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
  if (contentType) {
    headers.set("content-type", contentType);
  }
  return headers;
}

function mapDbAgent(agent: DbAgent & { config: { modelName: string | null } | null; memory: object | null }) {
  return {
    id: agent.id,
    workspaceId: agent.workspaceId,
    name: agent.name,
    slug: agent.slug,
    type: agent.type,
    source: agent.source,
    description: agent.description,
    isDefault: agent.isDefault,
    status: agent.status,
    createdBy: agent.createdBy,
    config: agent.config
      ? {
          modelName: agent.config.modelName,
        }
      : null,
    hasMemory: agent.memory != null,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

async function fetchGatewayAgents(session: AppSession): Promise<GatewayAgent[]> {
  const response = await fetch(`${gatewayBaseUrl()}/api/agents`, {
    method: "GET",
    headers: buildGatewayHeaders(session),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to load gateway agents: ${response.status}`);
  }
  const payload = (await response.json()) as GatewayAgentPayload;
  return payload.agents;
}

export async function syncWorkspaceAgents(session: AppSession) {
  if (!session.workspaceId) {
    return [];
  }

  const gatewayAgents = await fetchGatewayAgents(session);

  for (const gatewayAgent of gatewayAgents) {
    await db.agent.upsert({
      where: {
        workspaceId_slug: {
          workspaceId: session.workspaceId,
          slug: gatewayAgent.name,
        },
      },
      create: {
        workspaceId: session.workspaceId,
        name: gatewayAgent.name,
        slug: gatewayAgent.name,
        type: "CUSTOM",
        source: "USER_CREATED",
        description: gatewayAgent.description,
        isDefault: false,
        status: "ACTIVE",
        createdBy: session.userId,
        config: {
          create: {
            modelName: gatewayAgent.model ?? null,
            soulPrompt: gatewayAgent.soul ?? null,
            sandboxPolicyJson: {},
            memoryPolicyJson: {},
            toolPolicyJson: {},
            skillPolicyJson: {},
            extraConfigJson: {},
          },
        },
      },
      update: {
        name: gatewayAgent.name,
        description: gatewayAgent.description,
        status: "ACTIVE",
        config: {
          upsert: {
            create: {
              modelName: gatewayAgent.model ?? null,
              soulPrompt: gatewayAgent.soul ?? null,
              sandboxPolicyJson: {},
              memoryPolicyJson: {},
              toolPolicyJson: {},
              skillPolicyJson: {},
              extraConfigJson: {},
            },
            update: {
              modelName: gatewayAgent.model ?? null,
              soulPrompt: gatewayAgent.soul ?? null,
            },
          },
        },
      },
    });
  }

  const agents = await db.agent.findMany({
    where: { workspaceId: session.workspaceId },
    include: { config: true, memory: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return agents.map(mapDbAgent);
}

export async function createWorkspaceAgent(
  session: AppSession,
  request: {
    name: string;
    description?: string;
    model?: string | null;
    tool_groups?: string[] | null;
    soul?: string;
  },
) {
  if (!session.workspaceId) {
    throw new Error("Missing workspace id in session.");
  }

  const response = await fetch(`${gatewayBaseUrl()}/api/agents`, {
    method: "POST",
    headers: buildGatewayHeaders(session, "application/json"),
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      detail?: string;
    };
    throw new Error(payload.detail ?? `Failed to create agent: ${response.status}`);
  }

  await syncWorkspaceAgents(session);
  const agent = await db.agent.findUniqueOrThrow({
    where: {
      workspaceId_slug: {
        workspaceId: session.workspaceId,
        slug: request.name,
      },
    },
    include: { config: true, memory: true },
  });
  return mapDbAgent(agent);
}

export async function updateWorkspaceAgent(
  session: AppSession,
  agentSlug: string,
  request: {
    description?: string | null;
    model?: string | null;
    tool_groups?: string[] | null;
    soul?: string | null;
  },
) {
  if (!session.workspaceId) {
    throw new Error("Missing workspace id in session.");
  }

  const response = await fetch(`${gatewayBaseUrl()}/api/agents/${agentSlug}`, {
    method: "PUT",
    headers: buildGatewayHeaders(session, "application/json"),
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      detail?: string;
    };
    throw new Error(payload.detail ?? `Failed to update agent: ${response.status}`);
  }

  await syncWorkspaceAgents(session);
  const agent = await db.agent.findUniqueOrThrow({
    where: {
      workspaceId_slug: {
        workspaceId: session.workspaceId,
        slug: agentSlug,
      },
    },
    include: { config: true, memory: true },
  });
  return mapDbAgent(agent);
}

export async function deleteWorkspaceAgent(
  session: AppSession,
  agentSlug: string,
) {
  if (!session.workspaceId) {
    throw new Error("Missing workspace id in session.");
  }

  const existing = await db.agent.findUnique({
    where: {
      workspaceId_slug: {
        workspaceId: session.workspaceId,
        slug: agentSlug,
      },
    },
  });

  if (existing?.isDefault) {
    throw new Error("Default agent cannot be deleted.");
  }

  const response = await fetch(`${gatewayBaseUrl()}/api/agents/${agentSlug}`, {
    method: "DELETE",
    headers: buildGatewayHeaders(session),
  });

  if (!response.ok && response.status !== 404) {
    const payload = (await response.json().catch(() => ({}))) as {
      detail?: string;
    };
    throw new Error(payload.detail ?? `Failed to delete agent: ${response.status}`);
  }

  if (existing) {
    await db.agent.delete({
      where: {
        workspaceId_slug: {
          workspaceId: session.workspaceId,
          slug: agentSlug,
        },
      },
    });
  }
}
