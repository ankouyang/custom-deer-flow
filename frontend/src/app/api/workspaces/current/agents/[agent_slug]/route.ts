import { NextResponse } from "next/server";

import { getServerSession } from "@/server/auth/session";
import { deleteWorkspaceAgent, syncWorkspaceAgents, updateWorkspaceAgent } from "@/server/workspace-agents";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ agent_slug: string }> },
) {
  const session = await getServerSession();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agent_slug: agentSlug } = await context.params;
  const agents = await syncWorkspaceAgents(session);
  const agent = agents.find(
    (item) => item.slug === agentSlug || item.name === agentSlug,
  );

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json(agent);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ agent_slug: string }> },
) {
  const session = await getServerSession();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agent_slug: agentSlug } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        description?: string | null;
        model?: string | null;
        tool_groups?: string[] | null;
        soul?: string | null;
      }
    | null;

  try {
    const agent = await updateWorkspaceAgent(session, agentSlug, {
      description: body?.description ?? null,
      model: body?.model ?? null,
      tool_groups: body?.tool_groups ?? null,
      soul: body?.soul ?? null,
    });
    return NextResponse.json(agent);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update agent.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ agent_slug: string }> },
) {
  const session = await getServerSession();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agent_slug: agentSlug } = await context.params;

  try {
    await deleteWorkspaceAgent(session, agentSlug);
    return new Response(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete agent.",
      },
      { status: 400 },
    );
  }
}
