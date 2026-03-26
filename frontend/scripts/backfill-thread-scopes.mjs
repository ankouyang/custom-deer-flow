import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const storageRoot =
  process.env.DEER_FLOW_STORAGE_ROOT ??
  path.join(repoRoot, "backend", ".deer-flow");

const scopeRegistryFile = path.join(storageRoot, "thread-scopes.json");
const workspaceRegistryFile = path.join(storageRoot, "thread-workspaces.json");
const workspacesRoot = path.join(storageRoot, "workspaces");

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf-8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function listThreadDirs() {
  const result = [];
  let workspaceEntries = [];
  try {
    workspaceEntries = await readdir(workspacesRoot, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const workspaceEntry of workspaceEntries) {
    if (!workspaceEntry.isDirectory()) {
      continue;
    }

    const workspace = workspaceEntry.name;
    const threadsDir = path.join(workspacesRoot, workspace, "threads");
    let threadEntries = [];
    try {
      threadEntries = await readdir(threadsDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const threadEntry of threadEntries) {
      if (!threadEntry.isDirectory()) {
        continue;
      }
      result.push({
        workspace,
        threadId: threadEntry.name,
      });
    }
  }

  return result;
}

async function loadWorkspaceDefaults() {
  const workspaces = await prisma.workspace.findMany({
    select: {
      slug: true,
      defaultAgent: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
  });

  const bySlug = new Map();
  for (const workspace of workspaces) {
    bySlug.set(workspace.slug, workspace.defaultAgent ?? null);
  }
  return bySlug;
}

function normalizeScope(raw) {
  if (!isRecord(raw)) {
    return null;
  }

  const workspace = typeof raw.workspace === "string" ? raw.workspace : null;
  const agentId = typeof raw.agentId === "string" ? raw.agentId : null;
  const agentName = typeof raw.agentName === "string" ? raw.agentName : null;

  if (!workspace) {
    return null;
  }

  return {
    workspace,
    agentId,
    agentName,
  };
}

async function main() {
  const scopeRegistry = await readJson(scopeRegistryFile, {});
  const workspaceRegistry = await readJson(workspaceRegistryFile, {});
  const threadDirs = await listThreadDirs();
  const workspaceDefaults = await loadWorkspaceDefaults();

  const threadIds = new Set([
    ...Object.keys(isRecord(scopeRegistry) ? scopeRegistry : {}),
    ...Object.keys(isRecord(workspaceRegistry) ? workspaceRegistry : {}),
    ...threadDirs.map((item) => item.threadId),
  ]);

  const nextScopes = {};
  const nextWorkspaces = {};

  let preservedAgentScope = 0;
  let inferredDefaultAgent = 0;
  let missingWorkspaceEntity = 0;
  let discoveredFromFilesystem = 0;

  for (const threadId of threadIds) {
    const scope = normalizeScope(scopeRegistry[threadId]);
    const workspaceFromRegistry =
      typeof workspaceRegistry[threadId] === "string"
        ? workspaceRegistry[threadId]
        : null;
    const workspaceFromFilesystem =
      threadDirs.find((item) => item.threadId === threadId)?.workspace ?? null;
    const workspace =
      scope?.workspace ??
      workspaceFromRegistry ??
      workspaceFromFilesystem ??
      null;

    if (!workspace) {
      continue;
    }

    if (!scope && workspaceFromFilesystem) {
      discoveredFromFilesystem += 1;
    }

    const existingAgentId = scope?.agentId ?? null;
    const existingAgentName = scope?.agentName ?? null;
    const defaultAgent = workspaceDefaults.get(workspace) ?? null;

    let agentId = existingAgentId;
    let agentName = existingAgentName;

    if (agentId || agentName) {
      preservedAgentScope += 1;
    } else if (defaultAgent) {
      agentId = defaultAgent.id;
      agentName = defaultAgent.slug;
      inferredDefaultAgent += 1;
    } else {
      missingWorkspaceEntity += 1;
    }

    nextScopes[threadId] = {
      workspace,
      agentId,
      agentName,
    };
    nextWorkspaces[threadId] = workspace;
  }

  await writeJson(scopeRegistryFile, nextScopes);
  await writeJson(workspaceRegistryFile, nextWorkspaces);

  console.log(
    JSON.stringify(
      {
        storageRoot,
        totalThreads: Object.keys(nextScopes).length,
        preservedAgentScope,
        inferredDefaultAgent,
        missingWorkspaceEntity,
        discoveredFromFilesystem,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("[error] thread scope backfill failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
