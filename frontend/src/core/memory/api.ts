import { getBackendBaseURL } from "../config";

import type { UserMemory } from "./types";

export async function loadMemory(agentName?: string | null) {
  const url = new URL(`${getBackendBaseURL()}/api/memory`);
  if (agentName) {
    url.searchParams.set("agent_name", agentName);
  }
  const memory = await fetch(url.toString());
  const json = await memory.json();
  return json as UserMemory;
}
