import { NextResponse } from "next/server";

import { getServerSession } from "@/server/auth/session";
import { createWorkspaceAgent, syncWorkspaceAgents } from "@/server/workspace-agents";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session?.workspaceId) {
    return NextResponse.json({ agents: [] }, { status: 401 });
  }

  const agents = await syncWorkspaceAgents(session);

  return NextResponse.json({
    agents,
  });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        description?: string;
        model?: string | null;
        tool_groups?: string[] | null;
        soul?: string;
      }
    | null;

  if (!body?.name?.trim()) {
    return NextResponse.json(
      { error: "Agent name is required." },
      { status: 400 },
    );
  }

  try {
    const agent = await createWorkspaceAgent(session, {
      name: body.name.trim(),
      description: body.description?.trim(),
      model: body.model ?? null,
      tool_groups: body.tool_groups ?? null,
      soul: body.soul ?? "",
    });
    return NextResponse.json(agent, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create agent.",
      },
      { status: 400 },
    );
  }
}
