import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAgent,
  deleteAgent,
  getAgent,
  getAgentSkills,
  getAgentTools,
  listAgents,
  updateAgentSkills,
  updateAgentTools,
  updateAgent,
} from "./api";
import type { CreateAgentRequest, UpdateAgentRequest } from "./types";

export function useAgents() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["agents"],
    queryFn: () => listAgents(),
  });
  return { agents: data ?? [], isLoading, error };
}

export function useAgent(name: string | null | undefined) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["agents", name],
    queryFn: () => getAgent(name!),
    enabled: !!name,
  });
  return { agent: data ?? null, isLoading, error };
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateAgentRequest) => createAgent(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      request,
    }: {
      name: string;
      request: UpdateAgentRequest;
    }) => updateAgent(name, request),
    onSuccess: (_data, { name }) => {
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
      void queryClient.invalidateQueries({ queryKey: ["agents", name] });
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteAgent(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useAgentSkills(name: string | null | undefined) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["agents", name, "skills"],
    queryFn: () => getAgentSkills(name!),
    enabled: !!name,
  });
  return { data: data ?? { managed: false, skills: [] }, isLoading, error };
}

export function useUpdateAgentSkills() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, skills }: { name: string; skills: string[] }) =>
      updateAgentSkills(name, skills),
    onSuccess: (_data, { name }) => {
      void queryClient.invalidateQueries({ queryKey: ["agents", name, "skills"] });
    },
  });
}

export function useAgentTools(name: string | null | undefined) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["agents", name, "tools"],
    queryFn: () => getAgentTools(name!),
    enabled: !!name,
  });
  return { data: data ?? { managed: false, tools: [] }, isLoading, error };
}

export function useUpdateAgentTools() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      toolGroups,
    }: {
      name: string;
      toolGroups: string[];
    }) => updateAgentTools(name, toolGroups),
    onSuccess: (_data, { name }) => {
      void queryClient.invalidateQueries({ queryKey: ["agents", name, "tools"] });
    },
  });
}
