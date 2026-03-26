import { NextResponse } from "next/server";

import { getServerSession } from "@/server/auth/session";
import {
  deleteWorkspaceAgent,
  listWorkspaceAgentSkills,
  listWorkspaceAgentTools,
  listWorkspaceAgents,
  replaceWorkspaceAgentSkills,
  replaceWorkspaceAgentToolGroups,
  updateWorkspaceAgent,
} from "@/server/workspace-agents";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ agent_slug: string }> },
) {
  const session = await getServerSession();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agent_slug: agentSlug } = await context.params;
  const resource = new URL(request.url).searchParams.get("resource")?.trim();

  if (resource === "skills") {
    try {
      const data = await listWorkspaceAgentSkills(session, agentSlug);
      return NextResponse.json(data);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Failed to list agent skills.",
        },
        { status: 400 },
      );
    }
  }

  if (resource === "tools") {
    try {
      const data = await listWorkspaceAgentTools(session, agentSlug);
      return NextResponse.json(data);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Failed to list agent tools.",
        },
        { status: 400 },
      );
    }
  }

  const agents = await listWorkspaceAgents(session);
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
  const resource = new URL(request.url).searchParams.get("resource")?.trim();
  const body = (await request.json().catch(() => null)) as
    | {
        description?: string | null;
        model?: string | null;
        tool_groups?: string[] | null;
        soul?: string | null;
        skills?: string[];
      }
    | null;

  if (resource === "skills") {
    try {
      const data = await replaceWorkspaceAgentSkills(
        session,
        agentSlug,
        Array.isArray(body?.skills) ? body.skills : [],
      );
      return NextResponse.json(data);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Failed to update agent skills.",
        },
        { status: 400 },
      );
    }
  }

  if (resource === "tools") {
    try {
      const data = await replaceWorkspaceAgentToolGroups(
        session,
        agentSlug,
        Array.isArray(body?.tool_groups) ? body.tool_groups : [],
      );
      return NextResponse.json(data);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Failed to update agent tools.",
        },
        { status: 400 },
      );
    }
  }

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
