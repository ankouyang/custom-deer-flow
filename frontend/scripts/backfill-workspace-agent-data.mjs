import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_AGENT_SLUG = "default-agent";
const DEFAULT_AGENT_NAME = "Default Agent";
const MEMORY_SCHEMA_VERSION = "1.0";

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
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
  };
}

async function resolveUniqueWorkspaceSlug(baseSlug) {
  let slug = baseSlug || "workspace";
  let counter = 1;

  for (;;) {
    const existing = await prisma.workspace.findUnique({ where: { slug } });
    if (!existing) {
      return slug;
    }
    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }
}

async function backfillUser(user) {
  const existingWorkspace = user.defaultWorkspaceId
    ? await prisma.workspace.findUnique({
        where: { id: user.defaultWorkspaceId },
        include: { defaultAgent: true },
      })
    : await prisma.workspace.findFirst({
        where: {
          OR: [
            { ownerUserId: user.id },
            { members: { some: { userId: user.id, status: "ACTIVE" } } },
          ],
        },
        include: { defaultAgent: true },
      });

  if (existingWorkspace) {
    if (user.defaultWorkspaceId !== existingWorkspace.id) {
      await prisma.user.update({
        where: { id: user.id },
        data: { defaultWorkspaceId: existingWorkspace.id },
      });
      console.log(
        `[link] user=${user.email} workspace=${existingWorkspace.slug}`,
      );
    }
    return;
  }

  const baseSlug =
    slugify(user.workSpace) ||
    slugify(user.email.split("@")[0] ?? "") ||
    `workspace-${user.id.slice(0, 8)}`;
  const workspaceSlug = await resolveUniqueWorkspaceSlug(baseSlug);

  await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        ownerUserId: user.id,
        name: user.name?.trim() ? `${user.name.trim()}'s Workspace` : `${user.email.split("@")[0]}'s Workspace`,
        slug: workspaceSlug,
      },
    });

    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    const agent = await tx.agent.create({
      data: {
        workspaceId: workspace.id,
        name: DEFAULT_AGENT_NAME,
        slug: DEFAULT_AGENT_SLUG,
        type: "PLATFORM",
        source: "SYSTEM_BUILTIN",
        description: "Default platform agent for this workspace.",
        isDefault: true,
        status: "ACTIVE",
        createdBy: user.id,
      },
    });

    await tx.agentConfig.create({
      data: {
        agentId: agent.id,
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
        agentId: agent.id,
        memorySchemaVersion: MEMORY_SCHEMA_VERSION,
        memoryJson: emptyMemoryPayload(),
      },
    });

    await tx.workspace.update({
      where: { id: workspace.id },
      data: { defaultAgentId: agent.id },
    });

    await tx.user.update({
      where: { id: user.id },
      data: {
        defaultWorkspaceId: workspace.id,
        workSpace: workspace.slug,
      },
    });
  });

  console.log(`[create] user=${user.email} workspace=${workspaceSlug}`);
}

async function main() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
  });

  console.log(`[start] users=${users.length}`);
  for (const user of users) {
    await backfillUser(user);
  }
  console.log("[done] workspace/agent backfill finished");
}

main()
  .catch((error) => {
    console.error("[error] backfill failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
