import { NextResponse } from "next/server";

import { getServerSession } from "@/server/auth/session";
import { deleteWorkspaceThread, getWorkspaceThread } from "@/server/workspace-threads";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ thread_id: string }> },
) {
  const session = await getServerSession();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { thread_id: threadId } = await context.params;
  const thread = await getWorkspaceThread(session, threadId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  }

  return NextResponse.json({
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
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ thread_id: string }> },
) {
  const session = await getServerSession();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { thread_id: threadId } = await context.params;
  const deleted = await deleteWorkspaceThread(session, threadId);

  return NextResponse.json({
    success: deleted.count > 0,
  });
}
