import { getBackendBaseURL } from "@/core/config";

import type { Agent, CreateAgentRequest, UpdateAgentRequest } from "./types";

type WorkspaceAgentResponse = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  type: "PLATFORM" | "CUSTOM";
  source: "SYSTEM_BUILTIN" | "USER_CREATED" | "CLONED";
  description: string | null;
  isDefault: boolean;
  status: "ACTIVE" | "DISABLED" | "ARCHIVED";
  createdBy: string;
  hasMemory: boolean;
  config: {
    modelName: string | null;
  } | null;
};

export type AgentSkillBinding = {
  id: string;
  skillName: string;
  skillScope: string;
  enabled: boolean;
  configJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AgentToolBinding = {
  id: string;
  toolName: string;
  toolGroup: string;
  enabled: boolean;
  policyJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function mapWorkspaceAgent(agent: WorkspaceAgentResponse): Agent {
  return {
    id: agent.id,
    workspaceId: agent.workspaceId,
    name: agent.slug,
    slug: agent.slug,
    displayName: agent.name,
    description: agent.description ?? "",
    model: agent.config?.modelName ?? null,
    tool_groups: null,
    type: agent.type,
    source: agent.source,
    isDefault: agent.isDefault,
    status: agent.status,
    createdBy: agent.createdBy,
    hasMemory: agent.hasMemory,
  };
}

export async function listAgents(): Promise<Agent[]> {
  const res = await fetch(`${getBackendBaseURL()}/api/workspaces/current/agents`);
  if (!res.ok) throw new Error(`Failed to load agents: ${res.statusText}`);
  const data = (await res.json()) as { agents: WorkspaceAgentResponse[] };
  return data.agents.map(mapWorkspaceAgent);
}

export async function getAgent(name: string): Promise<Agent> {
  const res = await fetch(
    `${getBackendBaseURL()}/api/workspaces/current/agents/${encodeURIComponent(name)}`,
  );
  if (!res.ok) throw new Error(`Agent '${name}' not found`);
  return res.json() as Promise<Agent>;
}

export async function createAgent(request: CreateAgentRequest): Promise<Agent> {
  const res = await fetch(`${getBackendBaseURL()}/api/workspaces/current/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      detail?: string;
      error?: string;
    };
    throw new Error(
      err.detail ?? err.error ?? `Failed to create agent: ${res.statusText}`,
    );
  }
  return res.json() as Promise<Agent>;
}

export async function updateAgent(
  name: string,
  request: UpdateAgentRequest,
): Promise<Agent> {
  const res = await fetch(
    `${getBackendBaseURL()}/api/workspaces/current/agents/${encodeURIComponent(name)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      detail?: string;
      error?: string;
    };
    throw new Error(
      err.detail ?? err.error ?? `Failed to update agent: ${res.statusText}`,
    );
  }
  return res.json() as Promise<Agent>;
}

export async function deleteAgent(name: string): Promise<void> {
  const res = await fetch(
    `${getBackendBaseURL()}/api/workspaces/current/agents/${encodeURIComponent(name)}`,
    {
      method: "DELETE",
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      detail?: string;
      error?: string;
    };
    throw new Error(
      err.detail ?? err.error ?? `Failed to delete agent: ${res.statusText}`,
    );
  }
}

export async function checkAgentName(
  name: string,
): Promise<{ available: boolean; name: string }> {
  const res = await fetch(
    `${getBackendBaseURL()}/api/workspaces/current/agents/check?name=${encodeURIComponent(name)}`,
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      detail?: string;
      error?: string;
    };
    throw new Error(
      err.detail ?? err.error ?? `Failed to check agent name: ${res.statusText}`,
    );
  }
  return res.json() as Promise<{ available: boolean; name: string }>;
}

export async function getAgentSkills(
  name: string,
): Promise<{ managed: boolean; skills: AgentSkillBinding[] }> {
  const res = await fetch(
    `${getBackendBaseURL()}/api/workspaces/current/agents/${encodeURIComponent(name)}?resource=skills`,
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      detail?: string;
      error?: string;
    };
    throw new Error(
      err.detail ?? err.error ?? `Failed to load agent skills: ${res.statusText}`,
    );
  }
  return res.json() as Promise<{ managed: boolean; skills: AgentSkillBinding[] }>;
}

export async function updateAgentSkills(
  name: string,
  skills: string[],
): Promise<{ managed: boolean; skills: AgentSkillBinding[] }> {
  const res = await fetch(
    `${getBackendBaseURL()}/api/workspaces/current/agents/${encodeURIComponent(name)}?resource=skills`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skills }),
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      detail?: string;
      error?: string;
    };
    throw new Error(
      err.detail ?? err.error ?? `Failed to update agent skills: ${res.statusText}`,
    );
  }
  return res.json() as Promise<{ managed: boolean; skills: AgentSkillBinding[] }>;
}

export async function getAgentTools(
  name: string,
): Promise<{ managed: boolean; tools: AgentToolBinding[] }> {
  const res = await fetch(
    `${getBackendBaseURL()}/api/workspaces/current/agents/${encodeURIComponent(name)}?resource=tools`,
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      detail?: string;
      error?: string;
    };
    throw new Error(
      err.detail ?? err.error ?? `Failed to load agent tools: ${res.statusText}`,
    );
  }
  return res.json() as Promise<{ managed: boolean; tools: AgentToolBinding[] }>;
}

export async function updateAgentTools(
  name: string,
  toolGroups: string[],
): Promise<{ managed: boolean; tools: AgentToolBinding[] }> {
  const res = await fetch(
    `${getBackendBaseURL()}/api/workspaces/current/agents/${encodeURIComponent(name)}?resource=tools`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool_groups: toolGroups }),
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      detail?: string;
      error?: string;
    };
    throw new Error(
      err.detail ?? err.error ?? `Failed to update agent tools: ${res.statusText}`,
    );
  }
  return res.json() as Promise<{ managed: boolean; tools: AgentToolBinding[] }>;
}
