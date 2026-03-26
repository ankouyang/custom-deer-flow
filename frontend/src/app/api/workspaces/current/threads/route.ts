import { NextResponse } from "next/server";

import { getServerSession } from "@/server/auth/session";
import { getWorkspaceThread, listWorkspaceThreads } from "@/server/workspace-threads";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session?.workspaceId) {
    return NextResponse.json({ threads: [] }, { status: 401 });
  }

  const url = new URL(request.url);
  const threadId = url.searchParams.get("thread_id")?.trim() || null;
  const agentSlug = url.searchParams.get("agent_slug")?.trim() || null;
  const status = url.searchParams.get("status")?.trim() || null;

  if (threadId) {
    const thread = await getWorkspaceThread(session, threadId);
    if (!thread) {
      return NextResponse.json({ error: "Thread not found." }, { status: 404 });
    }

    return NextResponse.json({
      thread: {
        id: thread.id,
        workspaceId: thread.workspaceId,
        agentId: thread.agentId,
        title: thread.title,
        status: thread.status,
        createdBy: thread.createdBy,
        archivedAt: thread.archivedAt,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        agent: thread.agent,
        persisted: true,
      },
    });
  }

  const threads = await listWorkspaceThreads(session, {
    agentSlug,
    status:
      status === "ACTIVE" || status === "ARCHIVED" || status === "DELETED"
        ? status
        : undefined,
  });

  return NextResponse.json({
    threads: threads.map((thread) => ({
      id: thread.id,
      workspaceId: thread.workspaceId,
      agentId: thread.agentId,
      title: thread.title,
      status: thread.status,
      createdBy: thread.createdBy,
      archivedAt: thread.archivedAt,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      agent: thread.agent,
    })),
  });
}
