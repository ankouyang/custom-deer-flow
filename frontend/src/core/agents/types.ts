export interface Agent {
  id?: string;
  workspaceId?: string;
  name: string;
  slug?: string;
  displayName?: string;
  description: string;
  model: string | null;
  tool_groups: string[] | null;
  type?: "PLATFORM" | "CUSTOM";
  source?: "SYSTEM_BUILTIN" | "USER_CREATED" | "CLONED";
  isDefault?: boolean;
  status?: "ACTIVE" | "DISABLED" | "ARCHIVED";
  createdBy?: string;
  hasMemory?: boolean;
  soul?: string | null;
}

export interface CreateAgentRequest {
  name: string;
  description?: string;
  model?: string | null;
  tool_groups?: string[] | null;
  soul?: string;
}

export interface UpdateAgentRequest {
  description?: string | null;
  model?: string | null;
  tool_groups?: string[] | null;
  soul?: string | null;
}
