import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { env } from "@/env";

export const SESSION_COOKIE_NAME = "deerflow_session";

export type AppSession = {
  userId: string;
  email: string;
  name: string | null;
  workspace: string;
  workspaceId?: string | null;
  defaultAgentId?: string | null;
};

type SessionPayload = AppSession & {
  exp: number;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET ?? "deerflow-dev-secret")
    .update(data)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function createSessionValue(session: AppSession): string {
  const payload: SessionPayload = {
    ...session,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function parseSessionValue(value?: string | null): AppSession | null {
  if (!value) {
    return null;
  }
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) {
    return null;
  }
  const expected = sign(encoded);
  if (!safeEqual(signature, expected)) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf-8"),
    ) as SessionPayload;
    if (parsed.exp * 1000 < Date.now()) {
      return null;
    }
    return {
      userId: parsed.userId,
      email: parsed.email,
      name: parsed.name ?? null,
      workspace: parsed.workspace,
      workspaceId: parsed.workspaceId ?? null,
      defaultAgentId: parsed.defaultAgentId ?? null,
    };
  } catch {
    return null;
  }
}

export async function getServerSession(): Promise<AppSession | null> {
  const cookieStore = await cookies();
  return parseSessionValue(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export function applySessionCookie(response: NextResponse, session: AppSession) {
  response.cookies.set(SESSION_COOKIE_NAME, createSessionValue(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
