import { db } from "@/server/db";
import type { AppSession } from "@/server/auth/session";

type UpsertWorkspaceThreadParams = {
  threadId: string;
  agentId?: string | null;
  title?: string | null;
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

export async function upsertWorkspaceThread(
  session: AppSession,
  params: UpsertWorkspaceThreadParams,
) {
  const workspaceId = requireWorkspaceSession(session);
  const resolvedAgentId = resolveAgentId(session, params.agentId);

  return db.thread.upsert({
    where: { id: params.threadId },
    create: {
      id: params.threadId,
      workspaceId,
      agentId: resolvedAgentId,
      title: params.title ?? null,
      createdBy: session.userId,
      status: "ACTIVE",
    },
    update: {
      workspaceId,
      agentId: resolvedAgentId,
      ...(params.title !== undefined ? { title: params.title } : {}),
      status: "ACTIVE",
      archivedAt: null,
    },
    include: {
      agent: {
        select: {
          id: true,
          slug: true,
          name: true,
          isDefault: true,
        },
      },
    },
  });
}

export async function listWorkspaceThreads(
  session: AppSession,
  options?: {
    agentSlug?: string | null;
    status?: "ACTIVE" | "ARCHIVED" | "DELETED";
  },
) {
  const workspaceId = requireWorkspaceSession(session);

  return db.thread.findMany({
    where: {
      workspaceId,
      ...(options?.status ? { status: options.status } : {}),
      ...(options?.agentSlug
        ? { agent: { slug: options.agentSlug } }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      agent: {
        select: {
          id: true,
          slug: true,
          name: true,
          isDefault: true,
        },
      },
    },
  });
}

export async function getWorkspaceThread(
  session: AppSession,
  threadId: string,
) {
  const workspaceId = requireWorkspaceSession(session);

  return db.thread.findFirst({
    where: {
      id: threadId,
      workspaceId,
    },
    include: {
      agent: {
        select: {
          id: true,
          slug: true,
          name: true,
          isDefault: true,
        },
      },
    },
  });
}

export async function deleteWorkspaceThread(
  session: AppSession,
  threadId: string,
) {
  const workspaceId = requireWorkspaceSession(session);

  return db.thread.deleteMany({
    where: {
      id: threadId,
      workspaceId,
    },
  });
}
