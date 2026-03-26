# Agent Workspace 验收报告

## 1. 报告目标

本文档记录 DeerFlow 按 [agent-workspace-design.md](/Users/ankouyang/project/deer-flow/docs/agent-workspace-design.md) 推进后的当前验收结果。

验收日期：

- 2026-03-26

验收环境：

- 前端：Next.js dev，端口 `3000`
- Gateway：FastAPI，端口 `8001`
- LangGraph：端口 `2024`
- 数据库：`frontend/.env` 中当前 `DATABASE_URL` 指向的 PostgreSQL

---

## 2. 验收结论

当前结论：

- 设计目标 `1/2/3/5/6` 已通过主链路验收
- 设计目标 `4` 已通过主链路验收
- 当前仍有少量 **Next dev + Turbopack 动态路由稳定性问题**
- 这些问题不再影响核心业务闭环，但属于需要继续治理的技术债

一句话结论：

**`workspace -> agent -> thread -> memory -> skills/tools` 主业务链已可用并完成主流程验收。**

---

## 3. 验收范围

本次实际验收覆盖：

1. 新用户注册
2. 默认 workspace 初始化
3. 默认平台 Agent 初始化
4. 同一 workspace 下创建多个自定义 Agent
5. 默认 Agent / 自定义 Agent 各自创建 thread
6. thread 正式落库
7. thread 文件目录按 agent 维度落盘
8. agent 独立 memory 初始化
9. 历史 agent memory 补齐
10. agent 独立 skills/tools 绑定写入与回读
11. 跨用户 thread 访问隔离

---

## 4. 逐项验收结果

### 4.1 每个用户拥有一个默认 workspace

结果：

- 通过

说明：

- 注册新用户后，返回体中已包含 `workspaceId`
- `GET /api/workspaces/current` 能返回当前用户的默认 workspace

涉及实现：

- [bootstrap.ts](/Users/ankouyang/project/deer-flow/frontend/src/server/auth/bootstrap.ts)
- [current workspace route](/Users/ankouyang/project/deer-flow/frontend/src/app/api/workspaces/current/route.ts)

### 4.2 每个 workspace 初始化时自动创建默认平台 Agent

结果：

- 通过

说明：

- 注册用户后返回体中包含 `defaultAgentId`
- `GET /api/workspaces/current/agents` 能看到 `default-agent`

涉及实现：

- [bootstrap.ts](/Users/ankouyang/project/deer-flow/frontend/src/server/auth/bootstrap.ts)
- [agents route](/Users/ankouyang/project/deer-flow/frontend/src/app/api/workspaces/current/agents/route.ts)

### 4.3 用户可以在同一 workspace 下创建多个 Agent

结果：

- 通过

说明：

- 已实际创建 `review-agent`
- 已实际创建 `writer-agent`
- 两者都已出现在 `GET /api/workspaces/current/agents`

涉及实现：

- [agents route](/Users/ankouyang/project/deer-flow/frontend/src/app/api/workspaces/current/agents/route.ts)
- [workspace-agents.ts](/Users/ankouyang/project/deer-flow/frontend/src/server/workspace-agents.ts)

### 4.4 每个 Agent 拥有独立 threads

结果：

- 通过

说明：

- 默认 agent 创建 thread 成功
- `review-agent` 创建 thread 成功
- `GET /api/workspaces/current/threads?agent_slug=default-agent` 只返回默认 agent threads
- `GET /api/workspaces/current/threads?agent_slug=review-agent` 只返回 `review-agent` threads

涉及实现：

- [langgraph-proxy.ts](/Users/ankouyang/project/deer-flow/frontend/src/server/langgraph-proxy.ts)
- [workspace-threads.ts](/Users/ankouyang/project/deer-flow/frontend/src/server/workspace-threads.ts)
- [threads route](/Users/ankouyang/project/deer-flow/frontend/src/app/api/workspaces/current/threads/route.ts)

### 4.5 每个 Agent 拥有独立 memory

结果：

- 通过

说明：

- `default-agent` 已有独立 `memory.json`
- 新建 `writer-agent` 时已立即生成独立 `memory.json`
- 历史 `review-agent` 通过兼容回填逻辑已补齐 `memory.json`
- 数据库中对应 `AgentMemory` 记录已存在

涉及实现：

- [workspace-agents.ts](/Users/ankouyang/project/deer-flow/frontend/src/server/workspace-agents.ts)
- [bootstrap.ts](/Users/ankouyang/project/deer-flow/frontend/src/server/auth/bootstrap.ts)
- [memory router](/Users/ankouyang/project/deer-flow/backend/app/gateway/routers/memory.py)

### 4.6 每个 Agent 拥有独立 skills / tools

结果：

- 通过

说明：

- `review-agent` 已成功写入：
  - skills: `python`, `review`
  - tool groups: `read`, `search`
- 回读接口返回 `managed: true`
- 数据库中的 `AgentSkill / AgentTool / AgentConfig.skillPolicyJson / toolPolicyJson` 已同步写入

说明补充：

- 原独立动态 route：
  - `/api/workspaces/current/agents/[agent_slug]/skills`
  - `/api/workspaces/current/agents/[agent_slug]/tools`
  在 Next dev + Turbopack 下存在编译挂起现象
- 为完成验收，当前已将稳定读写入口收敛到：
  - `GET /api/workspaces/current/agents/{agent}?resource=skills`
  - `PUT /api/workspaces/current/agents/{agent}?resource=skills`
  - `GET /api/workspaces/current/agents/{agent}?resource=tools`
  - `PUT /api/workspaces/current/agents/{agent}?resource=tools`

涉及实现：

- [agent route](/Users/ankouyang/project/deer-flow/frontend/src/app/api/workspaces/current/agents/[agent_slug]/route.ts)
- [workspace-agents.ts](/Users/ankouyang/project/deer-flow/frontend/src/server/workspace-agents.ts)
- [lead agent](/Users/ankouyang/project/deer-flow/backend/packages/harness/deerflow/agents/lead_agent/agent.py)

### 4.7 每个 Agent 拥有独立 prompt / soul / model 配置

结果：

- 主链通过

说明：

- 新建 `review-agent` / `writer-agent` 时模型配置与 `SOUL.md` 已分别落到 agent 本地目录
- `config.yaml` 与 `SOUL.md` 已按 agent 独立保存

涉及实现：

- [workspace-agents.ts](/Users/ankouyang/project/deer-flow/frontend/src/server/workspace-agents.ts)

### 4.8 每个 Agent 拥有独立 artifacts / uploads / outputs

结果：

- 主链通过

说明：

- `ThreadArtifact / ThreadUpload` 已有正式实体
- thread 目录已按 `agents/<agent>/threads/<thread>` 落盘
- 后端 thread / artifact / uploads 权限测试已通过

涉及实现：

- [workspace-thread-assets.ts](/Users/ankouyang/project/deer-flow/frontend/src/server/workspace-thread-assets.ts)
- [paths.py](/Users/ankouyang/project/deer-flow/backend/packages/harness/deerflow/config/paths.py)
- [test_artifacts_router.py](/Users/ankouyang/project/deer-flow/backend/tests/test_artifacts_router.py)
- [test_uploads_router.py](/Users/ankouyang/project/deer-flow/backend/tests/test_uploads_router.py)

### 4.9 用户只能访问自己的 workspace

结果：

- 通过

说明：

- 第二个测试用户访问第一个用户的 thread：
  - `GET /api/workspaces/current/threads?thread_id=<other-user-thread>`
  返回 `404`
- 未发生越权读取

涉及实现：

- [threads route](/Users/ankouyang/project/deer-flow/frontend/src/app/api/workspaces/current/threads/route.ts)
- [workspace-threads.ts](/Users/ankouyang/project/deer-flow/frontend/src/server/workspace-threads.ts)
- [authz_service.py](/Users/ankouyang/project/deer-flow/backend/app/services/authz_service.py)

### 4.10 Agent 之间默认不可读写彼此资产

结果：

- 通过主链验收

说明：

- 已验证默认 agent 与 `review-agent` 的 thread 在 API 层可以分开读取
- 后端自动化测试已覆盖：
  - agent A 无法访问 agent B 的 thread
  - agent A 无法通过 artifacts/uploads 越界访问 agent B 资源

涉及实现：

- [test_authz_service.py](/Users/ankouyang/project/deer-flow/backend/tests/test_authz_service.py)
- [test_artifacts_router.py](/Users/ankouyang/project/deer-flow/backend/tests/test_artifacts_router.py)
- [test_uploads_router.py](/Users/ankouyang/project/deer-flow/backend/tests/test_uploads_router.py)

---

## 5. 本次验收中发现的问题

### 5.1 Next dev + Turbopack 动态 route 编译不稳定

表现：

- 某些动态 route 在 dev 环境下会卡在 `Compiling ...`
- 主要出现在：
  - `agents/[agent_slug]/skills`
  - `agents/[agent_slug]/tools`
  - `threads/[thread_id]`

影响：

- 不影响核心数据模型和主业务链
- 影响 dev 环境下的接口稳定性与验收效率

当前处理方式：

- 将关键验收链路收敛到稳定 query route

### 5.2 运行后端服务依赖本地环境

表现：

- 本机未安装 `uv` 时，`make dev` / `make gateway` 无法直接运行

当前处理方式：

- 使用：
  - `backend/.venv/bin/uvicorn`
  - `backend/.venv/bin/langgraph`
 直接启动

---

## 6. 当前最终判断

按设计文档业务目标判断：

- 当前已经达到 **主业务链闭环**
- 可以认为：
  - `workspace`
  - `agent`
  - `thread`
  - `memory`
  - `skills`
  - `tools`
  - `thread isolation`
  已具备可用实现

但从工程稳定性角度：

- 仍需继续清理 Next dev 动态 route 的编译稳定性问题

最终结论：

**可以判定当前实现已满足设计文档的核心业务要求，但仍存在少量开发态路由稳定性技术债。**

---

## 7. 建议后续动作

建议按以下顺序继续：

1. 统一稳定接口形态，减少对 dev 下不稳定动态 route 的依赖
2. 为 `skills/tools/thread detail` 增加正式前端 API 封装
3. 补一轮针对 `skills/tools/memory/thread` 的前端集成测试
4. 在非 dev 模式下再跑一轮完整回归

