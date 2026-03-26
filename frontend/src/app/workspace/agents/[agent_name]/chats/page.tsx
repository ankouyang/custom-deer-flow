"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { useAgent } from "@/core/agents";
import { useI18n } from "@/core/i18n/hooks";
import { useThreads } from "@/core/threads/hooks";
import { pathOfThread, titleOfThread } from "@/core/threads/utils";
import { formatTimeAgo } from "@/core/utils/datetime";

export default function AgentChatsPage() {
  const { t } = useI18n();
  const { agent_name: agentName } = useParams<{ agent_name: string }>();
  const { agent } = useAgent(agentName);
  const { data: threads } = useThreads(undefined, { agentName });
  const [search, setSearch] = useState("");

  useEffect(() => {
    const name = agent?.displayName ?? agent?.name ?? agentName;
    document.title = `${name} - ${t.pages.appName}`;
  }, [agent?.displayName, agent?.name, agentName, t.pages.appName]);

  const filteredThreads = useMemo(() => {
    return threads?.filter((thread) => {
      return titleOfThread(thread).toLowerCase().includes(search.toLowerCase());
    });
  }, [threads, search]);

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <div className="flex size-full flex-col">
          <header className="flex shrink-0 flex-col items-center justify-center gap-4 pt-8">
            <div className="w-full max-w-(--container-width-md)">
              <div className="text-muted-foreground text-sm">
                {t.sidebar.agentThreads}
              </div>
              <div className="text-xl font-semibold">
                {agent?.displayName ?? agent?.name ?? agentName}
              </div>
            </div>
            <Input
              type="search"
              className="h-12 w-full max-w-(--container-width-md) text-xl"
              placeholder={t.chats.searchChats}
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </header>
          <main className="min-h-0 flex-1">
            <ScrollArea className="size-full py-4">
              <div className="mx-auto flex size-full max-w-(--container-width-md) flex-col">
                {filteredThreads?.map((thread) => (
                  <Link
                    key={thread.thread_id}
                    href={pathOfThread(thread.thread_id, { agentName })}
                  >
                    <div className="flex flex-col gap-2 border-b p-4">
                      <div>
                        <div>{titleOfThread(thread)}</div>
                      </div>
                      {thread.updated_at && (
                        <div className="text-muted-foreground text-sm">
                          {formatTimeAgo(thread.updated_at)}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </ScrollArea>
          </main>
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
