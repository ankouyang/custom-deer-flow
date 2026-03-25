import { NextResponse } from "next/server";

import { getServerSession } from "@/server/auth/session";
import { buildProxyRequest, createProxyResponse } from "@/server/proxy";

export const runtime = "nodejs";

async function handle(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await context.params;
  const path = `/${(params.path ?? []).join("/")}`;
  const { url, init } = await buildProxyRequest(request, session, path, "gateway");
  const upstream = await fetch(url, init);
  return createProxyResponse(upstream);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
