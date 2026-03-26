import { getBackendBaseURL } from "../config";

export type PersistedWorkspaceThread = {
  id: string;
  workspaceId: string;
  agentId: string;
  title: string | null;
  status: "ACTIVE" | "ARCHIVED" | "DELETED";
  createdBy: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  agent: {
    id: string;
    slug: string;
    name: string;
    isDefault: boolean;
  };
  persisted: true;
};

async function readErrorDetail(
  response: Response,
  fallback: string,
): Promise<string> {
  const error = await response
    .json()
    .catch(() => ({ detail: fallback }));
  return error.detail ?? fallback;
}

export async function getPersistedThread(
  threadId: string,
): Promise<PersistedWorkspaceThread> {
  const response = await fetch(
    `${getBackendBaseURL()}/api/workspaces/current/threads?thread_id=${encodeURIComponent(threadId)}`,
  );

  if (!response.ok) {
    throw new Error(await readErrorDetail(response, "Failed to load thread"));
  }

  const payload = (await response.json()) as { thread: PersistedWorkspaceThread };
  return payload.thread;
}
