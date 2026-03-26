import { NextResponse } from "next/server";

import { getServerSession } from "@/server/auth/session";
import { listThreadArtifacts } from "@/server/workspace-thread-assets";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ thread_id: string }> },
) {
  const session = await getServerSession();
  if (!session?.workspaceId) {
    return NextResponse.json({ artifacts: [] }, { status: 401 });
  }

  const { thread_id: threadId } = await context.params;
  const artifacts = await listThreadArtifacts(session, threadId);

  return NextResponse.json({
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      workspaceId: artifact.workspaceId,
      agentId: artifact.agentId,
      threadId: artifact.threadId,
      path: artifact.path,
      kind: artifact.kind,
      mimeType: artifact.mimeType,
      sizeBytes: artifact.sizeBytes?.toString() ?? null,
      createdAt: artifact.createdAt,
    })),
  });
}
