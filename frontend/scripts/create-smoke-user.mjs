import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

const DEFAULT_AGENT_SLUG = "default-agent";
const DEFAULT_AGENT_NAME = "Default Agent";
const MEMORY_SCHEMA_VERSION = "1.0";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function generateWorkspaceFromEmail(email) {
  const localPart = email.split("@")[0] ?? "user";
  const base = slugify(localPart) || "user";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
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

async function main() {
  const email = process.argv[2] || "agent-workspace-smoke@example.com";
  const password = process.argv[3] || "SmokeTest123!";
  const name = process.argv[4] || "Smoke User";

  const existing = await prisma.user.findUnique({
    where: { email },
    include: {
      defaultWorkspace: {
        include: { defaultAgent: true },
      },
    },
  });

  if (existing?.defaultWorkspace) {
    console.log(
      JSON.stringify(
        {
          reused: true,
          userId: existing.id,
          email: existing.email,
          workspaceId: existing.defaultWorkspace.id,
          workspaceSlug: existing.defaultWorkspace.slug,
          defaultAgentId: existing.defaultWorkspace.defaultAgent?.id ?? null,
          defaultAgentSlug:
            existing.defaultWorkspace.defaultAgent?.slug ?? null,
        },
        null,
        2,
      ),
    );
    return;
  }

  const workspaceSlug = generateWorkspaceFromEmail(email);

  const result = await prisma.$transaction(async (tx) => {
    const user =
      existing ??
      (await tx.user.create({
        data: {
          email,
          name,
          workSpace: workspaceSlug,
          credential: {
            create: {
              passwordHash: hashPassword(password),
            },
          },
        },
      }));

    const workspace = await tx.workspace.create({
      data: {
        ownerUserId: user.id,
        name: `${name}'s Workspace`,
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
        createdBy: user.id,
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

    await tx.workspace.update({
      where: { id: workspace.id },
      data: { defaultAgentId: defaultAgent.id },
    });

    const updatedUser = await tx.user.update({
      where: { id: user.id },
      data: {
        defaultWorkspaceId: workspace.id,
        workSpace: workspace.slug,
      },
    });

    return {
      user: updatedUser,
      workspace,
      defaultAgent,
    };
  });

  console.log(
    JSON.stringify(
      {
        reused: false,
        userId: result.user.id,
        email: result.user.email,
        workspaceId: result.workspace.id,
        workspaceSlug: result.workspace.slug,
        defaultAgentId: result.defaultAgent.id,
        defaultAgentSlug: result.defaultAgent.slug,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("[error] create smoke user failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
