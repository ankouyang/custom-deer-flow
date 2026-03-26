"use client";

import { Client as LangGraphClient } from "@langchain/langgraph-sdk/client";
import type { ThreadState } from "@langchain/langgraph-sdk";

import { getLangGraphBaseURL } from "../config";

import { sanitizeRunStreamOptions } from "./stream-mode";

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /\b404\b/.test(error.message) || /not found/i.test(error.message);
}

function isRecoverableStateError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    /\b404\b/.test(error.message) ||
    /\b500\b/.test(error.message) ||
    /not found/i.test(error.message) ||
    /state/i.test(error.message)
  );
}

function createCompatibleClient(isMock?: boolean): LangGraphClient {
  const client = new LangGraphClient({
    apiUrl: getLangGraphBaseURL(isMock),
  });

  const originalRunStream = client.runs.stream.bind(client.runs);
  client.runs.stream = ((threadId, assistantId, payload) =>
    originalRunStream(
      threadId,
      assistantId,
      sanitizeRunStreamOptions(payload),
    )) as typeof client.runs.stream;

  const originalJoinStream = client.runs.joinStream.bind(client.runs);
  client.runs.joinStream = ((threadId, runId, options) =>
    originalJoinStream(
      threadId,
      runId,
      sanitizeRunStreamOptions(options),
    )) as typeof client.runs.joinStream;

  const originalGetState = client.threads.getState.bind(client.threads);
  client.threads.getState = (async (threadId, checkpoint, options) => {
    try {
      return await originalGetState(threadId, checkpoint, options);
    } catch (error) {
      if (checkpoint != null || !isRecoverableStateError(error)) {
        throw error;
      }

      let fallback: Array<{
        thread_id: string;
        values?: Record<string, unknown>;
        metadata?: Record<string, unknown> | null;
        updated_at?: string | null;
      }> = [];
      try {
        fallback = await client.threads.search({
          ids: [threadId],
          limit: 1,
          select: ["thread_id", "values", "metadata", "updated_at"],
          signal: options?.signal,
        });
      } catch {
        if (isNotFoundError(error)) {
          throw error;
        }
        throw new Error(`thread ${threadId} not found`);
      }

      const thread = fallback[0];
      if (!thread) {
        if (isNotFoundError(error)) {
          throw error;
        }
        throw new Error(`thread ${threadId} not found`);
      }

      return {
        values: thread.values ?? {},
        next: [],
        checkpoint: {
          checkpoint_id: thread.thread_id,
          thread_id: thread.thread_id,
          checkpoint_ns: "",
          checkpoint_map: {},
        },
        metadata: thread.metadata ?? {},
        created_at: thread.updated_at ?? null,
        parent_checkpoint: null,
        tasks: [],
      } satisfies ThreadState;
    }
  }) as typeof client.threads.getState;

  return client;
}

let _singleton: LangGraphClient | null = null;
export function getAPIClient(isMock?: boolean): LangGraphClient {
  _singleton ??= createCompatibleClient(isMock);
  return _singleton;
}
