import { NextResponse } from "next/server";

import { db } from "@/server/db";
import { bootstrapWorkspaceForUser } from "@/server/auth/bootstrap";
import { hashPassword } from "@/server/auth/password";
import { applySessionCookie } from "@/server/auth/session";
import { generateWorkspaceFromEmail } from "@/server/auth/workspace";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const traceId = `register-${Date.now()}`;
  try {
    console.info(`[register] ${traceId} start`);

    const body = (await request.json().catch(() => null)) as
      | { email?: string; password?: string; name?: string }
      | null;
    console.info(`[register] ${traceId} body parsed`);

    const email = body?.email?.trim().toLowerCase();
    const password = body?.password?.trim();
    const name = body?.name?.trim() || null;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }

    const existing = await db.user.findUnique({ where: { email } });
    console.info(`[register] ${traceId} existing checked`);
    if (existing) {
      return NextResponse.json(
        { error: "Email is already registered." },
        { status: 409 },
      );
    }

    const createdUser = await db.user.create({
      data: {
        email,
        name,
        workSpace: generateWorkspaceFromEmail(email),
        credential: {
          create: {
            passwordHash: hashPassword(password),
          },
        },
      },
      include: { credential: true },
    });

    const { user, workspace, defaultAgent } = await bootstrapWorkspaceForUser({
      userId: createdUser.id,
      email: createdUser.email,
      name: createdUser.name,
      workspaceSlug: createdUser.workSpace,
    });

    console.info(`[register] ${traceId} user created`, {
      userId: user.id,
      workspace: workspace.slug,
      workspaceId: workspace.id,
      defaultAgentId: defaultAgent.id,
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        workSpace: workspace.slug,
        workspaceId: workspace.id,
        defaultAgentId: defaultAgent.id,
      },
    });

    applySessionCookie(response, {
      userId: user.id,
      email: user.email,
      name: user.name,
      workspace: workspace.slug,
      workspaceId: workspace.id,
      defaultAgentId: defaultAgent.id,
    });
    console.info(`[register] ${traceId} cookie applied`);

    return response;
  } catch (error) {
    console.error(`[register] ${traceId} failed`, error);
    return NextResponse.json(
      {
        error: "Registration failed.",
        detail:
          process.env.NODE_ENV === "development"
            ? error instanceof Error
              ? error.message
              : String(error)
            : undefined,
      },
      { status: 500 },
    );
  }
}
