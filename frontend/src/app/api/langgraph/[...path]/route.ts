import { handleLanggraphProxy } from "@/server/langgraph-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = handleLanggraphProxy;
export const POST = handleLanggraphProxy;
export const PUT = handleLanggraphProxy;
export const PATCH = handleLanggraphProxy;
export const DELETE = handleLanggraphProxy;
