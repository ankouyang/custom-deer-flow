# Agent Workspace Runbook

## 1. 目标

本文档用于说明 DeerFlow 当前 `workspace -> agent -> thread` 架构的实际落地状态、迁移步骤、兼容策略，以及后续下线旧接口时的操作顺序。

适用场景：

- 新环境初始化
- 老环境迁移到新的 workspace/agent 数据模型
- 排查 thread / agent / workspace 归属异常
- 准备下线旧 `/api/agents` 文件型兼容接口

---

## 2. 当前主链路

当前主链路已经切换为：

```text
User Session
  -> Workspace Entity
    -> Agent Entity
      -> Thread Scope
        -> Memory / Uploads / Artifacts / Thread Access Control
```

主实现位置：

- 前端 agent API：
  - `frontend/src/app/api/workspaces/current/agents/*`
- 前端 bridge：
  - `frontend/src/server/workspace-agents.ts`
- 后端访问控制：
  - `backend/app/services/authz_service.py`
- 后端 agent service：
  - `backend/app/services/agent_service.py`

当前产品主路径：

- 读 agent：优先读 Prisma / workspace agent 实体
- 写 agent：写 Prisma + 本地 workspace 文件
- thread 访问：按 workspace + agent scope 校验
- memory：支持 workspace / agent 维度

---

## 3. 兼容层状态

当前仍保留的兼容层：

- backend `/api/agents`
  - 这是旧的文件型 agent CRUD 接口
  - 当前已经不再是主产品链路依赖
  - 主要作用是兼容老调用方与过渡期维护

兼容层现状：

- 前端浏览器代码已经不再直接调用 `/api/agents`
- `workspace-agents.ts` 已不再依赖 `/api/agents`
- 旧接口目前只剩“兼容保留”价值

结论：

- 可以继续保留一段时间
- 但后续可以计划正式废弃

---

## 4. 数据初始化步骤

### 4.1 新数据库初始化

在 `frontend/.env` 中配置新的 `DATABASE_URL` 后，执行：

```bash
cd frontend
pnpm exec prisma migrate reset --force
```

如果不需要 reset，而是增量迁移：

```bash
cd frontend
pnpm exec prisma migrate deploy
```

### 4.2 用户级 workspace/default agent 回填

```bash
cd frontend
pnpm prisma:backfill:workspace-agent
```

作用：

- 为历史用户补建 workspace
- 创建默认平台 agent
- 创建 workspace/agent memory
- 回写 `User.defaultWorkspaceId`

### 4.3 本地 `.deer-flow/workspaces` 导入数据库

```bash
cd frontend
pnpm prisma:import:local-workspaces
```

作用：

- 把本地 `backend/.deer-flow/workspaces/*` 导入数据库
- 若找不到对应用户，创建占位用户
- 为导入 workspace 创建默认平台 agent

### 4.4 历史 thread scope 回填

```bash
cd frontend
pnpm prisma:backfill:thread-scopes
```

作用：

- 补齐 `thread-scopes.json`
- 补齐 `thread-workspaces.json`
- 缺少 agent scope 的历史 thread 会回填为 workspace 默认 agent

### 4.5 历史 agent memory 回填

```bash
cd frontend
pnpm prisma:backfill:agent-memory
```

作用：

- 为已有 `Agent` 补建缺失的 `AgentMemory`
- 为本地 `backend/.deer-flow/workspaces/*/agents/*` 补齐缺失的 `memory.json`

---

## 5. 验证清单

完成迁移后，至少验证以下项目：

### 5.1 数据层

- `Workspace` 表中存在用户默认 workspace
- `Agent` 表中每个 workspace 至少有一个默认 agent
- `User.defaultWorkspaceId` 已回写
- `thread-scopes.json` 中历史 thread 已有 `workspace`
- 历史 thread 已尽量补齐 `agentName/agentId`

### 5.2 接口层

- `GET /api/workspaces/current`
- `GET /api/workspaces/current/agents`
- `GET /api/workspaces/current/agents/check`

### 5.3 权限层

需要验证：

- `agent A` 页面不能访问 `agent B` 的 thread
- `agent A` 页面不能访问 `agent B` 的 artifact
- `agent A` 页面不能访问 `agent B` 的 uploads
- agent 页面下的 memory 读取的是该 agent 的 memory

### 5.4 自动化验证

当前已覆盖的测试：

- `backend/tests/test_authz_service.py`
- `backend/tests/test_artifacts_router.py`
- `backend/tests/test_uploads_router.py`
- `backend/tests/test_custom_agent.py`

建议执行：

```bash
cd backend
.venv/bin/python -m pytest \
  tests/test_authz_service.py \
  tests/test_artifacts_router.py \
  tests/test_uploads_router.py \
  tests/test_custom_agent.py -q
```

---

## 6. 问题排查

### 6.1 thread 能看到但访问被拒绝

优先检查：

- `backend/.deer-flow/thread-scopes.json`
- `backend/.deer-flow/thread-workspaces.json`
- 当前页面 route 是否带了错误的 `agent_name`

### 6.2 历史 thread 没有 agent scope

执行：

```bash
cd frontend
pnpm prisma:backfill:thread-scopes
```

### 6.3 本地有 workspace 文件，但数据库里没有

执行：

```bash
cd frontend
pnpm prisma:import:local-workspaces
```

### 6.4 默认 agent 不存在

先检查：

- `Workspace.defaultAgentId`
- `Agent.isDefault = true`

如缺失，重新执行：

```bash
cd frontend
pnpm prisma:backfill:workspace-agent
```

### 6.5 本机没有 uv，无法启动 backend 服务

如果本机未安装 `uv`，可以直接使用项目虚拟环境里的可执行文件：

```bash
cd backend
PYTHONPATH=. .venv/bin/uvicorn app.gateway.app:app --host 0.0.0.0 --port 8001
```

```bash
cd backend
.venv/bin/langgraph dev --no-browser --allow-blocking --host 0.0.0.0 --port 2024
```

---

## 7. 旧接口下线建议

建议按以下顺序下线旧 `/api/agents`：

### Phase A

- 保留旧接口
- 明确标记为 deprecated
- 继续观察一段时间

### Phase B

- 检查日志中是否仍有外部调用 `/api/agents`
- 若没有调用，移除前端和脚本中最后的兼容引用

### Phase C

- 从 backend gateway 中移除旧 `/api/agents`
- 删除仅服务于旧文件型接口的兼容代码

注意：

- 只有在确认没有依赖旧接口的调用方后，才应执行 Phase C

---

## 8. 当前结论

当前 DeerFlow 的主链路已经进入：

```text
workspace entity -> agent entity -> thread scope -> guarded runtime access
```

从实现角度看，当前已经完成主路径闭环。后续工作重点不再是“补能力”，而是：

- 兼容层清理
- 运维标准化
- 最终废弃旧接口
