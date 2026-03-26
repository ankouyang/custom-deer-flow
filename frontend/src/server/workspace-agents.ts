import type { Agent as DbAgent, Prisma } from "@prisma/client";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { db } from "@/server/db";
import type { AppSession } from "@/server/auth/session";

const AGENT_NAME_PATTERN = /^[A-Za-z0-9-]+$/;
const MEMORY_SCHEMA_VERSION = "1.0";

type LocalAgent = {
  name: string;
  description: string;
  model: string | null;
  tool_groups: string[] | null;
  soul?: string | null;
};

function normalizeAgentSlug(name: string) {
  return name.trim().toLowerCase();
}

function emptyMemoryPayload(): Prisma.InputJsonValue {
  return {
    version: MEMORY_SCHEMA_VERSION,
    lastUpdated: "",
    user: {
      workContext: { summary: "", updatedAt: "" },
      personalContext: { summary: "", updatedAt: "" },
      topOfMind: { summary: "", updatedAt: "" },
    },
    history: {
      recentMonths: { summary: "", updatedAt: "" },
      earlierContext: { summary: "", updatedAt: "" },
      longTermBackground: { summary: "", updatedAt: "" },
    },
    facts: [],
  } satisfies Prisma.InputJsonValue;
}

function validateAgentName(name: string) {
  if (!AGENT_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid agent name '${name}'. Must match ^[A-Za-z0-9-]+$ (letters, digits, and hyphens only).`,
    );
  }
}

function workspaceRoot(workspace: string) {
  return path.resolve(
    process.cwd(),
    "../backend/.deer-flow/workspaces",
    workspace,
  );
}

function agentDir(workspace: string, agentSlug: string) {
  return path.join(workspaceRoot(workspace), "agents", agentSlug);
}

function quoteYamlString(value: string) {
  return JSON.stringify(value);
}

function buildAgentConfigYaml(request: {
  name: string;
  description?: string | null;
  model?: string | null;
  tool_groups?: string[] | null;
}) {
  const lines = [`name: ${request.name}`];
  if (request.description) {
    lines.push(`description: ${quoteYamlString(request.description)}`);
  }
  if (request.model !== null && request.model !== undefined) {
    lines.push(`model: ${quoteYamlString(request.model)}`);
  }
  if (request.tool_groups && request.tool_groups.length > 0) {
    lines.push("tool_groups:");
    for (const group of request.tool_groups) {
      lines.push(`  - ${quoteYamlString(group)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function parseScalarYamlValue(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      return JSON.parse(trimmed.replace(/^'/, '"').replace(/'$/, '"'));
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function parseAgentConfigYaml(content: string): {
  description?: string;
  model?: string | null;
  tool_groups?: string[] | null;
} {
  const lines = content.split(/\r?\n/);
  const result: {
    description?: string;
    model?: string | null;
    tool_groups?: string[] | null;
  } = {};

  let inToolGroups = false;
  const toolGroups: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed === "tool_groups:") {
      inToolGroups = true;
      continue;
    }

    if (inToolGroups && trimmed.startsWith("- ")) {
      toolGroups.push(parseScalarYamlValue(trimmed.slice(2)));
      continue;
    }

    inToolGroups = false;
    const separator = trimmed.indexOf(":");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = parseScalarYamlValue(trimmed.slice(separator + 1));
    if (key === "description") {
      result.description = value;
    } else if (key === "model") {
      result.model = value || null;
    }
  }

  if (toolGroups.length > 0) {
    result.tool_groups = toolGroups;
  }

  return result;
}

async function writeAgentFiles(
  session: AppSession,
  agentSlug: string,
  request: {
    description?: string | null;
    model?: string | null;
    tool_groups?: string[] | null;
    soul?: string | null;
  },
) {
  const dir = agentDir(session.workspace, agentSlug);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "config.yaml"),
    buildAgentConfigYaml({
      name: agentSlug,
      description: request.description ?? "",
      model: request.model ?? null,
      tool_groups: request.tool_groups ?? null,
    }),
    "utf-8",
  );
  await writeFile(path.join(dir, "SOUL.md"), request.soul ?? "", "utf-8");
  try {
    await readFile(path.join(dir, "memory.json"), "utf-8");
  } catch {
    await writeFile(
      path.join(dir, "memory.json"),
      JSON.stringify(emptyMemoryPayload(), null, 2),
      "utf-8",
    );
  }
}

async function ensureAgentMemoryFile(session: AppSession, agentSlug: string) {
  const dir = agentDir(session.workspace, agentSlug);
  await mkdir(dir, { recursive: true });
  try {
    await readFile(path.join(dir, "memory.json"), "utf-8");
  } catch {
    await writeFile(
      path.join(dir, "memory.json"),
      JSON.stringify(emptyMemoryPayload(), null, 2),
      "utf-8",
    );
  }
}

async function ensureAgentMemoryRecord(agentId: string) {
  await db.agentMemory.upsert({
    where: { agentId },
    create: {
      agentId,
      memorySchemaVersion: MEMORY_SCHEMA_VERSION,
      memoryJson: emptyMemoryPayload(),
    },
    update: {},
  });
}

async function readAgentSoulFile(session: AppSession, agentSlug: string) {
  try {
    return await readFile(path.join(agentDir(session.workspace, agentSlug), "SOUL.md"), "utf-8");
  } catch {
    return "";
  }
}

async function readAgentConfigFile(session: AppSession, agentSlug: string) {
  try {
    const content = await readFile(
      path.join(agentDir(session.workspace, agentSlug), "config.yaml"),
      "utf-8",
    );
    return parseAgentConfigYaml(content);
  } catch {
    return {};
  }
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

function parseManagedFlag(policy: Prisma.JsonValue | null | undefined) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return false;
  }

  return policy.managed === true;
}

async function listLocalWorkspaceAgents(session: AppSession): Promise<LocalAgent[]> {
  const agentsRoot = path.join(workspaceRoot(session.workspace), "agents");
  let entries: Array<{ isDirectory(): boolean; name: string }> = [];

  try {
    entries = (await readdir(agentsRoot, {
      withFileTypes: true,
      encoding: "utf8",
    })) as Array<{ isDirectory(): boolean; name: string }>;
  } catch {
    return [];
  }

  const agents: LocalAgent[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const agentSlug = entry.name;
    const config = await readAgentConfigFile(session, agentSlug);
    const soul = await readAgentSoulFile(session, agentSlug);

    agents.push({
      name: normalizeAgentSlug(agentSlug),
      description: config.description ?? "",
      model: config.model ?? null,
      tool_groups: config.tool_groups ?? null,
      soul,
    });
  }

  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

async function listWorkspaceAgentsFromDb(session: AppSession) {
  if (!session.workspaceId) {
    return [];
  }

  const agents = await db.agent.findMany({
    where: { workspaceId: session.workspaceId },
    include: { config: true, memory: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  for (const agent of agents) {
    await ensureAgentMemoryFile(session, agent.slug);
    if (!agent.memory) {
      await ensureAgentMemoryRecord(agent.id);
    }
  }

  const refreshedAgents = await db.agent.findMany({
    where: { workspaceId: session.workspaceId },
    include: { config: true, memory: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return refreshedAgents.map(mapDbAgent);
}

export async function syncWorkspaceAgents(
  session: AppSession,
  options?: { mode?: "always" | "if_empty" },
) {
  if (!session.workspaceId) {
    return [];
  }

  if (options?.mode === "if_empty") {
    const existingAgents = await listWorkspaceAgentsFromDb(session);
    if (existingAgents.length > 0) {
      return existingAgents;
    }
  }

  const localAgents = await listLocalWorkspaceAgents(session);

  for (const localAgent of localAgents) {
    await ensureAgentMemoryFile(session, localAgent.name);
    await db.agent.upsert({
      where: {
        workspaceId_slug: {
          workspaceId: session.workspaceId,
          slug: localAgent.name,
        },
      },
      create: {
        workspaceId: session.workspaceId,
        name: localAgent.name,
        slug: localAgent.name,
        type: "CUSTOM",
        source: "USER_CREATED",
        description: localAgent.description,
        isDefault: false,
        status: "ACTIVE",
        createdBy: session.userId,
        config: {
          create: {
            modelName: localAgent.model ?? null,
            soulPrompt: localAgent.soul ?? null,
            sandboxPolicyJson: {},
            memoryPolicyJson: {},
            toolPolicyJson: {},
            skillPolicyJson: {},
            extraConfigJson: {},
          },
        },
        memory: {
          create: {
            memorySchemaVersion: MEMORY_SCHEMA_VERSION,
            memoryJson: emptyMemoryPayload(),
          },
        },
      },
      update: {
        name: localAgent.name,
        description: localAgent.description,
        status: "ACTIVE",
        config: {
          upsert: {
            create: {
              modelName: localAgent.model ?? null,
              soulPrompt: localAgent.soul ?? null,
              sandboxPolicyJson: {},
              memoryPolicyJson: {},
              toolPolicyJson: {},
              skillPolicyJson: {},
              extraConfigJson: {},
            },
            update: {
              modelName: localAgent.model ?? null,
              soulPrompt: localAgent.soul ?? null,
            },
          },
        },
        memory: {
          upsert: {
            create: {
              memorySchemaVersion: MEMORY_SCHEMA_VERSION,
              memoryJson: emptyMemoryPayload(),
            },
            update: {},
          },
        },
      },
    });
  }

  return listWorkspaceAgentsFromDb(session);
}

export async function listWorkspaceAgents(session: AppSession) {
  return syncWorkspaceAgents(session, { mode: "if_empty" });
}

export async function getWorkspaceAgentRecord(
  session: AppSession,
  agentSlug: string,
) {
  if (!session.workspaceId) {
    throw new Error("Missing workspace id in session.");
  }

  const normalizedSlug = normalizeAgentSlug(agentSlug);
  validateAgentName(normalizedSlug);

  const record = await db.agent.findUnique({
    where: {
      workspaceId_slug: {
        workspaceId: session.workspaceId,
        slug: normalizedSlug,
      },
    },
    include: {
      config: true,
      memory: true,
      skills: {
        where: { enabled: true },
        orderBy: [{ skillScope: "asc" }, { skillName: "asc" }],
      },
      tools: {
        where: { enabled: true },
        orderBy: [{ toolGroup: "asc" }, { toolName: "asc" }],
      },
    },
  });

  if (record) {
    await ensureAgentMemoryFile(session, normalizedSlug);
    if (!record.memory) {
      await ensureAgentMemoryRecord(record.id);
      return db.agent.findUnique({
        where: {
          workspaceId_slug: {
            workspaceId: session.workspaceId,
            slug: normalizedSlug,
          },
        },
        include: {
          config: true,
          memory: true,
          skills: {
            where: { enabled: true },
            orderBy: [{ skillScope: "asc" }, { skillName: "asc" }],
          },
          tools: {
            where: { enabled: true },
            orderBy: [{ toolGroup: "asc" }, { toolName: "asc" }],
          },
        },
      });
    }
  }

  return record;
}

export async function getWorkspaceAgentRuntimeBindings(
  session: AppSession,
  agentId: string,
) {
  if (!session.workspaceId) {
    return {
      skillBindingsManaged: false,
      allowedSkillNames: null as string[] | null,
      toolBindingsManaged: false,
      allowedToolGroups: null as string[] | null,
    };
  }

  const agent = await db.agent.findFirst({
    where: {
      id: agentId,
      workspaceId: session.workspaceId,
    },
    include: {
      config: true,
      skills: {
        where: { enabled: true },
        select: { skillName: true },
        orderBy: { skillName: "asc" },
      },
      tools: {
        where: { enabled: true },
        select: { toolGroup: true },
        orderBy: { toolGroup: "asc" },
      },
    },
  });

  if (!agent) {
    return {
      skillBindingsManaged: false,
      allowedSkillNames: null as string[] | null,
      toolBindingsManaged: false,
      allowedToolGroups: null as string[] | null,
    };
  }

  const skillBindingsManaged = parseManagedFlag(agent.config?.skillPolicyJson);
  const toolBindingsManaged = parseManagedFlag(agent.config?.toolPolicyJson);

  return {
    skillBindingsManaged,
    allowedSkillNames: skillBindingsManaged
      ? agent.skills.map((item) => item.skillName)
      : null,
    toolBindingsManaged,
    allowedToolGroups: toolBindingsManaged
      ? Array.from(new Set(agent.tools.map((item) => item.toolGroup)))
      : null,
  };
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
  validateAgentName(request.name);
  const agentSlug = normalizeAgentSlug(request.name);

  const existing = await db.agent.findUnique({
    where: {
      workspaceId_slug: {
        workspaceId: session.workspaceId,
        slug: agentSlug,
      },
    },
    select: { id: true },
  });
  if (existing) {
    throw new Error(`Agent '${agentSlug}' already exists`);
  }

  await writeAgentFiles(session, agentSlug, {
    description: request.description ?? "",
    model: request.model ?? null,
    tool_groups: request.tool_groups ?? null,
    soul: request.soul ?? "",
  });

  const agent = await db.agent.create({
    data: {
      workspaceId: session.workspaceId,
      name: agentSlug,
      slug: agentSlug,
      type: "CUSTOM",
      source: "USER_CREATED",
      description: request.description ?? "",
      isDefault: false,
      status: "ACTIVE",
      createdBy: session.userId,
      config: {
        create: {
          modelName: request.model ?? null,
          soulPrompt: request.soul ?? "",
          sandboxPolicyJson: {},
          memoryPolicyJson: {},
          toolPolicyJson: {},
          skillPolicyJson: {},
          extraConfigJson: {},
        },
      },
      memory: {
        create: {
          memorySchemaVersion: MEMORY_SCHEMA_VERSION,
          memoryJson: emptyMemoryPayload(),
        },
      },
    },
    include: { config: true, memory: true },
  });

  return mapDbAgent(agent);
}

export async function checkWorkspaceAgentName(
  session: AppSession,
  name: string,
): Promise<{ available: boolean; name: string }> {
  if (!session.workspaceId) {
    throw new Error("Missing workspace id in session.");
  }

  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Agent name is required.");
  }
  validateAgentName(normalized);

  const existing = await db.agent.findUnique({
    where: {
      workspaceId_slug: {
        workspaceId: session.workspaceId,
        slug: normalized,
      },
    },
    select: { id: true },
  });
  if (existing) {
    return { available: false, name: normalized };
  }
  return {
    available: !(await (async () => {
      try {
        await readFile(path.join(agentDir(session.workspace, normalized), "config.yaml"), "utf-8");
        return true;
      } catch {
        return false;
      }
    })()),
    name: normalized,
  };
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
  const normalizedSlug = normalizeAgentSlug(agentSlug);
  validateAgentName(normalizedSlug);

  const existing = await db.agent.findUniqueOrThrow({
    where: {
      workspaceId_slug: {
        workspaceId: session.workspaceId,
        slug: normalizedSlug,
      },
    },
    include: { config: true, memory: true },
  });

  const soul =
    request.soul ??
    existing.config?.soulPrompt ??
    (await readAgentSoulFile(session, normalizedSlug));
  const existingConfigFile = await readAgentConfigFile(session, normalizedSlug);

  await writeAgentFiles(session, normalizedSlug, {
    description: request.description ?? existing.description ?? "",
    model: request.model ?? existing.config?.modelName ?? null,
    tool_groups: request.tool_groups ?? existingConfigFile.tool_groups ?? null,
    soul,
  });

  const updated = await db.agent.update({
    where: {
      workspaceId_slug: {
        workspaceId: session.workspaceId,
        slug: normalizedSlug,
      },
    },
    data: {
      description: request.description ?? existing.description,
      config: {
        upsert: {
          create: {
            modelName: request.model ?? null,
            soulPrompt: soul,
            sandboxPolicyJson: {},
            memoryPolicyJson: {},
            toolPolicyJson: {},
            skillPolicyJson: {},
            extraConfigJson: {},
          },
          update: {
            modelName: request.model ?? existing.config?.modelName ?? null,
            soulPrompt: soul,
          },
        },
      },
    },
    include: { config: true, memory: true },
  });
  return mapDbAgent(updated);
}

export async function deleteWorkspaceAgent(
  session: AppSession,
  agentSlug: string,
) {
  if (!session.workspaceId) {
    throw new Error("Missing workspace id in session.");
  }
  const normalizedSlug = normalizeAgentSlug(agentSlug);

  const existing = await db.agent.findUnique({
    where: {
      workspaceId_slug: {
        workspaceId: session.workspaceId,
        slug: normalizedSlug,
      },
    },
  });

  if (existing?.isDefault) {
    throw new Error("Default agent cannot be deleted.");
  }

  if (existing) {
    await rm(agentDir(session.workspace, normalizedSlug), {
      recursive: true,
      force: true,
    });
    await db.agent.delete({
      where: {
        workspaceId_slug: {
          workspaceId: session.workspaceId,
          slug: normalizedSlug,
        },
      },
    });
  }
}

export async function listWorkspaceAgentSkills(
  session: AppSession,
  agentSlug: string,
) {
  const agent = await getWorkspaceAgentRecord(session, agentSlug);
  if (!agent) {
    throw new Error("Agent not found.");
  }

  return {
    managed: parseManagedFlag(agent.config?.skillPolicyJson),
    skills: agent.skills.map((item) => ({
      id: item.id,
      skillName: item.skillName,
      skillScope: item.skillScope,
      enabled: item.enabled,
      configJson: item.configJson,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };
}

export async function replaceWorkspaceAgentSkills(
  session: AppSession,
  agentSlug: string,
  skillNames: string[],
) {
  const agent = await getWorkspaceAgentRecord(session, agentSlug);
  if (!agent || !session.workspaceId) {
    throw new Error("Agent not found.");
  }

  const normalizedSkillNames = Array.from(
    new Set(
      skillNames
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  await db.$transaction([
    db.agentSkill.deleteMany({
      where: { agentId: agent.id },
    }),
    ...(normalizedSkillNames.length > 0
      ? [
          db.agentSkill.createMany({
            data: normalizedSkillNames.map((skillName) => ({
              workspaceId: session.workspaceId!,
              agentId: agent.id,
              skillName,
              skillScope: "PLATFORM_PUBLIC",
              enabled: true,
              configJson: {},
            })),
          }),
        ]
      : []),
    db.agentConfig.upsert({
      where: { agentId: agent.id },
      create: {
        agentId: agent.id,
        modelName: agent.config?.modelName ?? null,
        systemPrompt: agent.config?.systemPrompt ?? null,
        soulPrompt: agent.config?.soulPrompt ?? null,
        temperature: agent.config?.temperature ?? null,
        maxTokens: agent.config?.maxTokens ?? null,
        sandboxPolicyJson: agent.config?.sandboxPolicyJson ?? {},
        memoryPolicyJson: agent.config?.memoryPolicyJson ?? {},
        toolPolicyJson: agent.config?.toolPolicyJson ?? {},
        skillPolicyJson: {
          mode: "allowlist",
          managed: true,
        },
        extraConfigJson: agent.config?.extraConfigJson ?? {},
      },
      update: {
        skillPolicyJson: {
          mode: "allowlist",
          managed: true,
        },
      },
    }),
  ]);

  return listWorkspaceAgentSkills(session, agentSlug);
}

export async function listWorkspaceAgentTools(
  session: AppSession,
  agentSlug: string,
) {
  const agent = await getWorkspaceAgentRecord(session, agentSlug);
  if (!agent) {
    throw new Error("Agent not found.");
  }

  return {
    managed: parseManagedFlag(agent.config?.toolPolicyJson),
    tools: agent.tools.map((item) => ({
      id: item.id,
      toolName: item.toolName,
      toolGroup: item.toolGroup,
      enabled: item.enabled,
      policyJson: item.policyJson,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };
}

export async function replaceWorkspaceAgentToolGroups(
  session: AppSession,
  agentSlug: string,
  toolGroups: string[],
) {
  const agent = await getWorkspaceAgentRecord(session, agentSlug);
  if (!agent || !session.workspaceId) {
    throw new Error("Agent not found.");
  }

  const normalizedGroups = Array.from(
    new Set(
      toolGroups
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const currentSoul =
    agent.config?.soulPrompt ??
    (await readAgentSoulFile(session, agent.slug));

  await writeAgentFiles(session, agent.slug, {
    description: agent.description ?? "",
    model: agent.config?.modelName ?? null,
    tool_groups: normalizedGroups,
    soul: currentSoul,
  });

  await db.$transaction([
    db.agentTool.deleteMany({
      where: { agentId: agent.id },
    }),
    ...(normalizedGroups.length > 0
      ? [
          db.agentTool.createMany({
            data: normalizedGroups.map((toolGroup) => ({
              workspaceId: session.workspaceId!,
              agentId: agent.id,
              toolName: toolGroup,
              toolGroup,
              enabled: true,
              policyJson: {},
            })),
          }),
        ]
      : []),
    db.agentConfig.upsert({
      where: { agentId: agent.id },
      create: {
        agentId: agent.id,
        modelName: agent.config?.modelName ?? null,
        systemPrompt: agent.config?.systemPrompt ?? null,
        soulPrompt: currentSoul,
        temperature: agent.config?.temperature ?? null,
        maxTokens: agent.config?.maxTokens ?? null,
        sandboxPolicyJson: agent.config?.sandboxPolicyJson ?? {},
        memoryPolicyJson: agent.config?.memoryPolicyJson ?? {},
        toolPolicyJson: {
          mode: "group_allowlist",
          managed: true,
        },
        skillPolicyJson: agent.config?.skillPolicyJson ?? {},
        extraConfigJson: agent.config?.extraConfigJson ?? {},
      },
      update: {
        toolPolicyJson: {
          mode: "group_allowlist",
          managed: true,
        },
      },
    }),
  ]);

  return listWorkspaceAgentTools(session, agentSlug);
}
