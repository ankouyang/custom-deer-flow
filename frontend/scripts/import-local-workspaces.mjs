import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const storageRoot =
  process.env.DEER_FLOW_STORAGE_ROOT ??
  path.join(repoRoot, "backend", ".deer-flow");
const workspacesRoot = path.join(storageRoot, "workspaces");

const DEFAULT_AGENT_SLUG = "default-agent";
const DEFAULT_AGENT_NAME = "Default Agent";
const MEMORY_SCHEMA_VERSION = "1.0";
const IMPORT_EMAIL_DOMAIN = "deerflow.local";

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

async function readWorkspaceMemory(workspaceSlug) {
  const memoryFile = path.join(workspacesRoot, workspaceSlug, "memory.json");
  try {
    const raw = await readFile(memoryFile, "utf-8");
    return JSON.parse(raw);
  } catch {
    return emptyMemoryPayload();
  }
}

async function listWorkspaceSlugs() {
  let entries = [];
  try {
    entries = await readdir(workspacesRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function resolveImportUser(workspaceSlug) {
  const existingUser = await prisma.user.findFirst({
    where: { workSpace: workspaceSlug },
  });
  if (existingUser) {
    return { user: existingUser, created: false, placeholder: false };
  }

  const baseLocalPart = `imported-${slugify(workspaceSlug) || "workspace"}`;
  let localPart = baseLocalPart;
  let suffix = 1;

  for (;;) {
    const email = `${localPart}@${IMPORT_EMAIL_DOMAIN}`;
    const collision = await prisma.user.findUnique({ where: { email } });
    if (!collision) {
      const user = await prisma.user.create({
        data: {
          email,
          name: `Imported ${workspaceSlug}`,
          workSpace: workspaceSlug,
        },
      });
      return { user, created: true, placeholder: true };
    }
    suffix += 1;
    localPart = `${baseLocalPart}-${suffix}`;
  }
}

async function importWorkspace(workspaceSlug) {
  const existingWorkspace = await prisma.workspace.findUnique({
    where: { slug: workspaceSlug },
    include: { defaultAgent: true },
  });
  if (existingWorkspace) {
    return { status: "skipped_existing" };
  }

  const memoryPayload = await readWorkspaceMemory(workspaceSlug);
  const { user, created, placeholder } = await resolveImportUser(workspaceSlug);

  await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        ownerUserId: user.id,
        name: `${workspaceSlug} Workspace`,
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
        description: "Default platform agent imported for an existing local workspace.",
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
        memoryJson: memoryPayload,
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
        workSpace: workspaceSlug,
        defaultWorkspaceId: user.defaultWorkspaceId ?? workspace.id,
      },
    });
  });

  return {
    status: "imported",
    createdUser: created,
    placeholderUser: placeholder,
  };
}

async function main() {
  const workspaceSlugs = await listWorkspaceSlugs();
  const summary = {
    storageRoot,
    totalLocalWorkspaces: workspaceSlugs.length,
    imported: 0,
    skippedExisting: 0,
    createdPlaceholderUsers: 0,
  };

  for (const workspaceSlug of workspaceSlugs) {
    const result = await importWorkspace(workspaceSlug);
    if (result.status === "skipped_existing") {
      summary.skippedExisting += 1;
      continue;
    }
    summary.imported += 1;
    if (result.placeholderUser) {
      summary.createdPlaceholderUsers += 1;
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error("[error] import local workspaces failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
