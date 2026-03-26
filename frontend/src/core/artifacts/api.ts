async function readErrorDetail(
  response: Response,
  fallback: string,
): Promise<string> {
  const error = await response
    .json()
    .catch(() => ({ detail: fallback }));
  return error.detail ?? fallback;
}

export interface PersistedArtifactInfo {
  id: string;
  workspaceId: string;
  agentId: string;
  threadId: string;
  path: string;
  kind: string;
  mimeType: string | null;
  sizeBytes: string | null;
  createdAt: string;
}

export async function listPersistedArtifacts(
  threadId: string,
): Promise<{ artifacts: PersistedArtifactInfo[] }> {
  const response = await fetch(
    `${window.location.origin}/api/workspaces/current/threads/${encodeURIComponent(threadId)}/artifacts`,
  );

  if (!response.ok) {
    throw new Error(
      await readErrorDetail(response, "Failed to list persisted artifacts"),
    );
  }

  return response.json();
}
