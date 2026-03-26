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
    include: {
      defaultAgent: true,
      _count: {
        select: {
          agents: true,
          members: true,
        },
      },
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
      defaultAgent: workspace.defaultAgent
        ? {
            id: workspace.defaultAgent.id,
            name: workspace.defaultAgent.name,
            slug: workspace.defaultAgent.slug,
            type: workspace.defaultAgent.type,
            isDefault: workspace.defaultAgent.isDefault,
            status: workspace.defaultAgent.status,
          }
        : null,
      counts: {
        agents: workspace._count.agents,
        members: workspace._count.members,
      },
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    },
  });
}
