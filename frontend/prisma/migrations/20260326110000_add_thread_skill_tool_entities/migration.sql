-- CreateEnum
CREATE TYPE "ThreadStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "SkillScope" AS ENUM ('PLATFORM_PUBLIC', 'WORKSPACE_PRIVATE', 'AGENT_PRIVATE');

-- CreateEnum
CREATE TYPE "ArtifactKind" AS ENUM ('OUTPUT', 'UPLOAD', 'GENERATED', 'PREVIEW');

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "title" TEXT,
    "status" "ThreadStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSkill" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "skillName" TEXT NOT NULL,
    "skillScope" "SkillScope" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "configJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTool" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolGroup" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "policyJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreadArtifact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "kind" "ArtifactKind" NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreadArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreadUpload" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" BIGINT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreadUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Thread_workspaceId_agentId_updatedAt_idx" ON "Thread"("workspaceId", "agentId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Thread_agentId_updatedAt_idx" ON "Thread"("agentId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AgentSkill_agentId_skillName_skillScope_key" ON "AgentSkill"("agentId", "skillName", "skillScope");

-- CreateIndex
CREATE INDEX "AgentSkill_agentId_enabled_idx" ON "AgentSkill"("agentId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTool_agentId_toolName_key" ON "AgentTool"("agentId", "toolName");

-- CreateIndex
CREATE INDEX "AgentTool_agentId_enabled_idx" ON "AgentTool"("agentId", "enabled");

-- CreateIndex
CREATE INDEX "ThreadArtifact_threadId_idx" ON "ThreadArtifact"("threadId");

-- CreateIndex
CREATE INDEX "ThreadUpload_threadId_idx" ON "ThreadUpload"("threadId");

-- AddForeignKey
ALTER TABLE "Thread"
ADD CONSTRAINT "Thread_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thread"
ADD CONSTRAINT "Thread_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "Agent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thread"
ADD CONSTRAINT "Thread_createdBy_fkey"
FOREIGN KEY ("createdBy") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSkill"
ADD CONSTRAINT "AgentSkill_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSkill"
ADD CONSTRAINT "AgentSkill_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "Agent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTool"
ADD CONSTRAINT "AgentTool_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTool"
ADD CONSTRAINT "AgentTool_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "Agent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadArtifact"
ADD CONSTRAINT "ThreadArtifact_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadArtifact"
ADD CONSTRAINT "ThreadArtifact_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "Agent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadArtifact"
ADD CONSTRAINT "ThreadArtifact_threadId_fkey"
FOREIGN KEY ("threadId") REFERENCES "Thread"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadUpload"
ADD CONSTRAINT "ThreadUpload_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadUpload"
ADD CONSTRAINT "ThreadUpload_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "Agent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadUpload"
ADD CONSTRAINT "ThreadUpload_threadId_fkey"
FOREIGN KEY ("threadId") REFERENCES "Thread"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadUpload"
ADD CONSTRAINT "ThreadUpload_createdBy_fkey"
FOREIGN KEY ("createdBy") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
