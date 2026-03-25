import { env } from "@/env";
import type { AppSession } from "@/server/auth/session";

type ProxyTarget = "gateway" | "langgraph";
const DEV_PROXY_SECRET = "deerflow-dev-proxy-secret";

function resolveBaseUrl(target: ProxyTarget): string {
  // Server-side proxying must target the internal services directly.
  // Public NEXT_PUBLIC_* URLs are for browser clients and may point back to nginx,
  // which can create loops and lose auth context.
  if (target === "gateway") {
    return "http://127.0.0.1:8001";
  }
  return "http://127.0.0.1:2024";
}

function ensureJsonObject(
  value: unknown,
): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function buildProxyRequest(
  request: Request,
  session: AppSession,
  path: string,
  target: ProxyTarget,
): Promise<{ url: string; init: RequestInit }> {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("cookie");
  headers.delete("connection");
  headers.delete("proxy-connection");
  headers.delete("keep-alive");
  headers.delete("upgrade");
  headers.delete("transfer-encoding");

  headers.set(
    "x-deerflow-proxy-secret",
    env.DEER_FLOW_PROXY_SHARED_SECRET ?? DEV_PROXY_SECRET,
  );
  headers.set("x-deerflow-user-id", session.userId);
  headers.set("x-deerflow-user-email", session.email);
  headers.set("x-deerflow-workspace", session.workspace);
  if (session.name) {
    headers.set("x-deerflow-user-name", session.name);
  }

  let body: BodyInit | undefined;
  const contentType = headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (request.method !== "GET" && request.method !== "HEAD") {
    if (isJson) {
      const parsed = ensureJsonObject(await request.json().catch(() => ({})));
      const metadata = ensureJsonObject(parsed.metadata);
      metadata.user_id = session.userId;
      metadata.user_email = session.email;
      metadata.workspace = session.workspace;
      parsed.metadata = metadata;

      if (target === "langgraph") {
        const context = ensureJsonObject(parsed.context);
        context.user_id = session.userId;
        context.user_email = session.email;
        context.user_name = session.name;
        context.workspace = session.workspace;
        parsed.context = context;
      }

      body = JSON.stringify(parsed);
    } else {
      body = await request.arrayBuffer();
    }
  }

  const url = new URL(
    `${resolveBaseUrl(target)}${path}${new URL(request.url).search}`,
  );

  return {
    url: url.toString(),
    init: {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    },
  };
}

export function createProxyResponse(upstream: Response): Response {
  const headers = new Headers(upstream.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
