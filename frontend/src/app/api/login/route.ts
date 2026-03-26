import { NextResponse } from "next/server";

import { db } from "@/server/db";
import { verifyPassword } from "@/server/auth/password";
import { applySessionCookie } from "@/server/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const traceId = `login-${Date.now()}`;
  try {
    console.info(`[login] ${traceId} start`);

    const body = (await request.json().catch(() => null)) as
      | { email?: string; password?: string }
      | null;
    console.info(`[login] ${traceId} body parsed`);

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
    console.info(`[login] ${traceId} user queried`, {
      found: !!user,
      hasCredential: !!user?.credential,
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

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        workSpace: user.workSpace,
      },
    });

    applySessionCookie(response, {
      userId: user.id,
      email: user.email,
      name: user.name,
      workspace: user.workSpace,
    });
    console.info(`[login] ${traceId} cookie applied`);

    return response;
  } catch (error) {
    console.error(`[login] ${traceId} failed`, error);
    return NextResponse.json(
      {
        error: "Login failed.",
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
