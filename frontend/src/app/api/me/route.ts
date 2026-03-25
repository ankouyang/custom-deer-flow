import { NextResponse } from "next/server";

import { getServerSession } from "@/server/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      workSpace: session.workspace,
    },
  });
}
