import { env } from "@/env";

export function getBackendBaseURL() {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/gateway`;
  }
  return "http://localhost:2026/api/gateway";
}

export function getLangGraphBaseURL(isMock?: boolean) {
  if (isMock) {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/mock/api`;
    }
    return "http://localhost:3000/mock/api";
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/lg`;
  }
  return "http://localhost:2026/api/lg";
}
