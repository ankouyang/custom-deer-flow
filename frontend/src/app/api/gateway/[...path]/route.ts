import { NextResponse } from "next/server";

import { getServerSession } from "@/server/auth/session";
import { buildProxyRequest, createProxyResponse } from "@/server/proxy";
import { deleteThreadUploadByFilename, upsertThreadUploads } from "@/server/workspace-thread-assets";

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
  const { url, init, resolvedAgentId } = await buildProxyRequest(
    request,
    session,
    path,
    "gateway",
  );
  const upstream = await fetch(url, init);

  const uploadMatch = path.match(/^\/api\/threads\/([^/]+)\/uploads$/);
  if (
    request.method === "POST" &&
    uploadMatch &&
    upstream.ok &&
    upstream.headers.get("content-type")?.includes("application/json")
  ) {
    const payload = (await upstream.json().catch(() => null)) as
      | {
          success?: boolean;
          files?: Array<{
            filename?: string;
            size?: string | number;
            virtual_path?: string;
          }>;
        }
      | null;

    const files =
      payload?.files?.filter(
        (file): file is {
          filename: string;
          size: string | number;
          virtual_path: string;
        } =>
          typeof file?.filename === "string" &&
          typeof file?.virtual_path === "string" &&
          (typeof file?.size === "string" || typeof file?.size === "number"),
      ) ?? [];

    if (files.length > 0) {
      await upsertThreadUploads(session, uploadMatch[1]!, files, resolvedAgentId);
    }

    return NextResponse.json(payload, { status: upstream.status });
  }

  const deleteUploadMatch =
    request.method === "DELETE"
      ? path.match(/^\/api\/threads\/([^/]+)\/uploads\/([^/]+)$/)
      : null;
  if (deleteUploadMatch && upstream.ok) {
    await deleteThreadUploadByFilename(
      session,
      deleteUploadMatch[1]!,
      decodeURIComponent(deleteUploadMatch[2]!),
    );
  }

  return createProxyResponse(upstream);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
