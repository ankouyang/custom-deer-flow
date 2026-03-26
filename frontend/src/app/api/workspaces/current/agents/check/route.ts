import { NextResponse } from "next/server";

import { getServerSession } from "@/server/auth/session";
import { checkWorkspaceAgentName } from "@/server/workspace-agents";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim() ?? "";
  if (!name) {
    return NextResponse.json(
      { error: "Agent name is required." },
      { status: 400 },
    );
  }

  try {
    const result = await checkWorkspaceAgentName(session, name);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to check agent name.",
      },
      { status: 400 },
    );
  }
}
