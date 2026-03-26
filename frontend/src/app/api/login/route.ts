import { NextResponse } from "next/server";

import { ensureWorkspaceBootstrapForUser } from "@/server/auth/bootstrap";
import { db } from "@/server/db";
import { verifyPassword } from "@/server/auth/password";
import { applySessionCookie } from "@/server/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;

  const email = body?.email?.trim().toLowerCase();
  const password = body?.password?.trim();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const user = await db.user.findUnique({
    where: { email },
    include: { credential: true },
  });

  if (
    !user?.credential ||
    !verifyPassword(password, user.credential.passwordHash)
  ) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const workspace = await ensureWorkspaceBootstrapForUser(user);

  const workspaceSlug = workspace?.slug ?? user.workSpace;

  const response = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      workSpace: workspaceSlug,
      workspaceId: workspace?.id ?? null,
      defaultAgentId: workspace?.defaultAgent?.id ?? null,
    },
  });

  applySessionCookie(response, {
    userId: user.id,
    email: user.email,
    name: user.name,
    workspace: workspaceSlug,
    workspaceId: workspace?.id ?? null,
    defaultAgentId: workspace?.defaultAgent?.id ?? null,
  });

  return response;
}
