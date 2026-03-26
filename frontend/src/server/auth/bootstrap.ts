import type { Agent, Prisma, User, Workspace } from "@prisma/client";

import { db } from "@/server/db";

type BootstrapResult = {
  user: User;
  workspace: Workspace;
  defaultAgent: Agent;
};

const DEFAULT_AGENT_SLUG = "default-agent";
const DEFAULT_AGENT_NAME = "Default Agent";
const MEMORY_SCHEMA_VERSION = "1.0";

function buildWorkspaceName(email: string, explicitName?: string | null): string {
  if (explicitName && explicitName.trim().length > 0) {
    return explicitName.trim();
  }
  const localPart = email.split("@")[0] ?? "Workspace";
  return `${localPart}'s Workspace`;
}

function emptyMemoryPayload() {
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

export async function bootstrapWorkspaceForUser(params: {
  userId: string;
  email: string;
  name?: string | null;
  workspaceSlug: string;
}): Promise<BootstrapResult> {
  const { userId, email, name, workspaceSlug } = params;

  return db.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        ownerUserId: userId,
        name: buildWorkspaceName(email, name),
        slug: workspaceSlug,
      },
    });

    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    const defaultAgent = await tx.agent.create({
      data: {
        workspaceId: workspace.id,
        name: DEFAULT_AGENT_NAME,
        slug: DEFAULT_AGENT_SLUG,
        type: "PLATFORM",
        source: "SYSTEM_BUILTIN",
        description: "Default platform agent for this workspace.",
        isDefault: true,
        status: "ACTIVE",
        createdBy: userId,
      },
    });

    await tx.agentConfig.create({
      data: {
        agentId: defaultAgent.id,
        sandboxPolicyJson: {},
        memoryPolicyJson: {},
        toolPolicyJson: {},
        skillPolicyJson: {},
        extraConfigJson: {},
      },
    });

    await tx.workspaceMemory.create({
      data: {
        workspaceId: workspace.id,
        memorySchemaVersion: MEMORY_SCHEMA_VERSION,
        memoryJson: emptyMemoryPayload(),
      },
    });

    await tx.agentMemory.create({
      data: {
        agentId: defaultAgent.id,
        memorySchemaVersion: MEMORY_SCHEMA_VERSION,
        memoryJson: emptyMemoryPayload(),
      },
    });

    const user = await tx.user.update({
      where: { id: userId },
      data: {
        defaultWorkspaceId: workspace.id,
        workSpace: workspace.slug,
      },
    });

    const updatedWorkspace = await tx.workspace.update({
      where: { id: workspace.id },
      data: {
        defaultAgentId: defaultAgent.id,
      },
    });

    return {
      user,
      workspace: updatedWorkspace,
      defaultAgent,
    };
  });
}

export async function getUserDefaultWorkspace(userId: string) {
  return db.workspace.findFirst({
    where: {
      OR: [
        { ownerUserId: userId },
        { members: { some: { userId, status: "ACTIVE" } } },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: {
      defaultAgent: true,
    },
  });
}

export async function ensureWorkspaceBootstrapForUser(user: {
  id: string;
  email: string;
  name: string | null;
  workSpace: string;
  defaultWorkspaceId?: string | null;
}) {
  if (user.defaultWorkspaceId) {
    const workspace = await db.workspace.findUnique({
      where: { id: user.defaultWorkspaceId },
      include: { defaultAgent: true },
    });
    if (workspace) {
      return workspace;
    }
  }

  const existing = await getUserDefaultWorkspace(user.id);
  if (existing) {
    if (user.defaultWorkspaceId !== existing.id) {
      await db.user.update({
        where: { id: user.id },
        data: { defaultWorkspaceId: existing.id },
      });
    }
    return existing;
  }

  const { workspace } = await bootstrapWorkspaceForUser({
    userId: user.id,
    email: user.email,
    name: user.name,
    workspaceSlug: user.workSpace,
  });

  return db.workspace.findUniqueOrThrow({
    where: { id: workspace.id },
    include: { defaultAgent: true },
  });
}
