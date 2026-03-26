import { NextResponse } from "next/server";

import { getServerSession } from "@/server/auth/session";
import {
  listWorkspaceAgentTools,
  replaceWorkspaceAgentToolGroups,
} from "@/server/workspace-agents";

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
        tool_groups?: string[];
      }
    | null;

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
