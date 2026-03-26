import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();

const MEMORY_SCHEMA_VERSION = "1.0";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const storageRoot =
  process.env.DEER_FLOW_STORAGE_ROOT ??
  path.join(repoRoot, "backend", ".deer-flow");

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

function agentMemoryPath(workspaceSlug, agentSlug) {
  return path.join(
    storageRoot,
    "workspaces",
    workspaceSlug,
    "agents",
    agentSlug,
    "memory.json",
  );
}

async function ensureMemoryFile(workspaceSlug, agentSlug) {
  const target = agentMemoryPath(workspaceSlug, agentSlug);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await readFile(target, "utf-8");
    return false;
  } catch {
    await writeFile(target, JSON.stringify(emptyMemoryPayload(), null, 2), "utf-8");
    return true;
  }
}

async function main() {
  const agents = await prisma.agent.findMany({
    include: {
      workspace: { select: { slug: true } },
      memory: true,
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const summary = {
    totalAgents: agents.length,
    createdMemoryRecords: 0,
    createdMemoryFiles: 0,
  };

  for (const agent of agents) {
    if (!agent.memory) {
      await prisma.agentMemory.create({
        data: {
          agentId: agent.id,
          memorySchemaVersion: MEMORY_SCHEMA_VERSION,
          memoryJson: emptyMemoryPayload(),
        },
      });
      summary.createdMemoryRecords += 1;
    }

    if (await ensureMemoryFile(agent.workspace.slug, agent.slug)) {
      summary.createdMemoryFiles += 1;
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error("[error] agent memory backfill failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
