import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function backendStorageRoot() {
  return path.resolve(process.cwd(), "../backend/.deer-flow");
}

function workspaceRoot(workspace: string) {
  return path.join(backendStorageRoot(), "workspaces", workspace);
}

function registryPath() {
  return path.join(backendStorageRoot(), "thread-workspaces.json");
}

function scopeRegistryPath() {
  return path.join(backendStorageRoot(), "thread-scopes.json");
}

type ThreadScopeRecord = {
  workspace: string;
  agentId?: string | null;
  agentName?: string | null;
};

async function writeWorkspaceRegistry(threadId: string, workspace: string) {
  let current: Record<string, string> = {};
  try {
    current = JSON.parse(await readFile(registryPath(), "utf-8")) as Record<
      string,
      string
    >;
  } catch {
    current = {};
  }

  current[threadId] = workspace;
  await writeFile(registryPath(), JSON.stringify(current, null, 2), "utf-8");
}

async function writeScopeRegistry(threadId: string, scope: ThreadScopeRecord) {
  let current: Record<string, ThreadScopeRecord> = {};
  try {
    current = JSON.parse(
      await readFile(scopeRegistryPath(), "utf-8"),
    ) as Record<string, ThreadScopeRecord>;
  } catch {
    current = {};
  }

  current[threadId] = {
    workspace: scope.workspace,
    agentId: scope.agentId ?? null,
    agentName: scope.agentName ?? null,
  };
  await writeFile(scopeRegistryPath(), JSON.stringify(current, null, 2), "utf-8");
}

export async function registerThreadWorkspace(
  workspace: string,
  threadId: string,
) {
  const root = workspaceRoot(workspace);
  const threadRoot = path.join(root, "threads", threadId);

  await mkdir(path.join(threadRoot, "user-data", "workspace"), {
    recursive: true,
  });
  await mkdir(path.join(threadRoot, "user-data", "uploads"), {
    recursive: true,
  });
  await mkdir(path.join(threadRoot, "user-data", "outputs"), {
    recursive: true,
  });

  await mkdir(backendStorageRoot(), { recursive: true });
  await writeWorkspaceRegistry(threadId, workspace);
  await writeScopeRegistry(threadId, { workspace });
}

export async function registerThreadScope(params: {
  workspace: string;
  threadId: string;
  agentId?: string | null;
  agentName?: string | null;
}) {
  const { workspace, threadId, agentId, agentName } = params;
  const root = workspaceRoot(workspace);
  const threadRoot = agentName
    ? path.join(root, "agents", agentName, "threads", threadId)
    : path.join(root, "threads", threadId);

  await mkdir(path.join(threadRoot, "user-data", "workspace"), {
    recursive: true,
  });
  await mkdir(path.join(threadRoot, "user-data", "uploads"), {
    recursive: true,
  });
  await mkdir(path.join(threadRoot, "user-data", "outputs"), {
    recursive: true,
  });

  await mkdir(backendStorageRoot(), { recursive: true });
  await writeWorkspaceRegistry(threadId, workspace);
  await writeScopeRegistry(threadId, {
    workspace,
    agentId,
    agentName,
  });
}
