import { NextResponse } from "next/server";

import { getServerSession } from "@/server/auth/session";
import { listThreadUploads } from "@/server/workspace-thread-assets";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ thread_id: string }> },
) {
  const session = await getServerSession();
  if (!session?.workspaceId) {
    return NextResponse.json({ uploads: [] }, { status: 401 });
  }

  const { thread_id: threadId } = await context.params;
  const uploads = await listThreadUploads(session, threadId);

  return NextResponse.json({
    uploads: uploads.map((upload) => ({
      id: upload.id,
      workspaceId: upload.workspaceId,
      agentId: upload.agentId,
      threadId: upload.threadId,
      filename: upload.filename,
      path: upload.path,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes?.toString() ?? null,
      createdBy: upload.createdBy,
      createdAt: upload.createdAt,
    })),
  });
}
