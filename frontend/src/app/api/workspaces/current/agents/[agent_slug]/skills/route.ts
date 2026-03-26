import { NextResponse } from "next/server";

import { getServerSession } from "@/server/auth/session";
import {
  listWorkspaceAgentSkills,
  replaceWorkspaceAgentSkills,
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
        skills?: string[];
      }
    | null;

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
