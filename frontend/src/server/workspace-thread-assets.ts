import { db } from "@/server/db";
import type { AppSession } from "@/server/auth/session";
import { upsertWorkspaceThread } from "@/server/workspace-threads";

type UploadedFileRecord = {
  filename: string;
  size: string | number;
  virtual_path: string;
};

function requireWorkspaceSession(session: AppSession) {
  if (!session.workspaceId) {
    throw new Error("Workspace session is required.");
  }
  return session.workspaceId;
}

function resolveAgentId(session: AppSession, agentId?: string | null) {
  const resolved = agentId ?? session.defaultAgentId ?? null;
  if (!resolved) {
    throw new Error("Agent context is required.");
  }
  return resolved;
}

export async function upsertThreadUploads(
  session: AppSession,
  threadId: string,
  files: UploadedFileRecord[],
  agentId?: string | null,
) {
  const workspaceId = requireWorkspaceSession(session);
  const resolvedAgentId = resolveAgentId(session, agentId);

  await upsertWorkspaceThread(session, {
    threadId,
    agentId: resolvedAgentId,
  });

  for (const file of files) {
    await db.threadUpload.upsert({
      where: {
        id: `${threadId}:${file.filename}`,
      },
      create: {
        id: `${threadId}:${file.filename}`,
        workspaceId,
        agentId: resolvedAgentId,
        threadId,
        filename: file.filename,
        path: file.virtual_path,
        sizeBytes:
          typeof file.size === "string" ? BigInt(file.size) : BigInt(file.size),
        createdBy: session.userId,
      },
      update: {
        workspaceId,
        agentId: resolvedAgentId,
        path: file.virtual_path,
        sizeBytes:
          typeof file.size === "string" ? BigInt(file.size) : BigInt(file.size),
      },
    });
  }
}

export async function deleteThreadUploadByFilename(
  session: AppSession,
  threadId: string,
  filename: string,
) {
  const workspaceId = requireWorkspaceSession(session);
  return db.threadUpload.deleteMany({
    where: {
      workspaceId,
      threadId,
      filename,
    },
  });
}

export async function syncThreadArtifacts(
  session: AppSession,
  threadId: string,
  artifactPaths: string[],
  agentId?: string | null,
) {
  const workspaceId = requireWorkspaceSession(session);
  const resolvedAgentId = resolveAgentId(session, agentId);

  await upsertWorkspaceThread(session, {
    threadId,
    agentId: resolvedAgentId,
  });

  const existing = await db.threadArtifact.findMany({
    where: {
      workspaceId,
      threadId,
    },
    select: { id: true, path: true },
  });

  const nextSet = new Set(artifactPaths);
  const staleIds = existing
    .filter((item) => !nextSet.has(item.path))
    .map((item) => item.id);

  if (staleIds.length > 0) {
    await db.threadArtifact.deleteMany({
      where: {
        id: { in: staleIds },
      },
    });
  }

  for (const artifactPath of artifactPaths) {
    const id = `${threadId}:${artifactPath}`;
    await db.threadArtifact.upsert({
      where: { id },
      create: {
        id,
        workspaceId,
        agentId: resolvedAgentId,
        threadId,
        path: artifactPath,
        kind: "GENERATED",
      },
      update: {
        workspaceId,
        agentId: resolvedAgentId,
        path: artifactPath,
        kind: "GENERATED",
      },
    });
  }
}

export async function listThreadUploads(
  session: AppSession,
  threadId: string,
) {
  const workspaceId = requireWorkspaceSession(session);
  return db.threadUpload.findMany({
    where: {
      workspaceId,
      threadId,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function listThreadArtifacts(
  session: AppSession,
  threadId: string,
) {
  const workspaceId = requireWorkspaceSession(session);
  return db.threadArtifact.findMany({
    where: {
      workspaceId,
      threadId,
    },
    orderBy: { createdAt: "asc" },
  });
}
