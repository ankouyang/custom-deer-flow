import { NextResponse } from "next/server";

import { getServerSession } from "@/server/auth/session";
import { db } from "@/server/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session?.workspaceId) {
    return NextResponse.json({ workspace: null }, { status: 401 });
  }

  const workspace = await db.workspace.findUnique({
    where: { id: session.workspaceId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      ownerUserId: true,
      defaultAgentId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!workspace) {
    return NextResponse.json({ workspace: null }, { status: 404 });
  }

  return NextResponse.json({
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      status: workspace.status,
      ownerUserId: workspace.ownerUserId,
      defaultAgentId: workspace.defaultAgentId,
      defaultAgent: null,
      counts: {
        agents: null,
        members: null,
      },
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    },
  });
}
