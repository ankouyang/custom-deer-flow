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
  await mkdir(backendStorageRoot(), { recursive: true });
  await writeFile(registryPath(), JSON.stringify(current, null, 2), "utf-8");
}
