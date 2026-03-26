import { useQuery } from "@tanstack/react-query";

import { loadMemory } from "./api";

export function useMemory(agentName?: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["memory", agentName ?? null],
    queryFn: () => loadMemory(agentName),
  });
  return { memory: data ?? null, isLoading, error };
}
