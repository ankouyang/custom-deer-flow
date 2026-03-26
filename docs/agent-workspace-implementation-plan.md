# Agent Workspace 实施计划

## 1. 文档目标

本文档基于 [agent-workspace-design.md](/Users/ankouyang/project/deer-flow/docs/agent-workspace-design.md)，给出 DeerFlow 多 Agent Workspace 方案的实施路径。

目标是把抽象设计拆解为可执行的开发阶段，明确：

- 每个阶段要改什么
- 每个阶段的交付物是什么
- 每个阶段如何验证
- 风险如何控制

本文档默认遵循以下目标模型：

```text
User
  -> Workspace
      -> Default Platform Agent
      -> Custom Agents
      -> Workspace Memory
      -> Agent Memory / Threads / Skills / Tools
```

---

## 2. 总体实施策略

整体采用“渐进式重构 + 兼容层保留”的方式推进，不做一次性大改。

核心原则：

1. 先补领域实体，再改运行链路
2. 先做数据归属，再做能力下沉
3. 先保兼容，再逐步切流
4. 每个阶段都要具备独立可验证闭环

建议拆分为 6 个阶段：

1. 数据建模与初始化
2. 后端权限与上下文重构
3. Thread 归属改造
4. Path / Storage 重构
5. Memory / Skills / Tools Agent 化
6. 前端与管理能力接入

---

## 3. 实施范围

本次实施涉及以下模块：

- `frontend`
- `backend/app/gateway`
- `backend/packages/harness/deerflow/config`
- `backend/packages/harness/deerflow/context`
- `backend/packages/harness/deerflow/agents`
- `backend/packages/harness/deerflow/sandbox`
- 数据库 schema 与迁移脚本
- `docs/`

不在第一期范围内的事项：

- 多用户共享同一个 workspace
- RBAC 细粒度权限
- 企业级审计系统
- Agent 市场或模板中心

---

## 4. 阶段划分

## Phase 1: 数据建模与初始化

### 4.1 目标

建立正式领域实体，让系统从“`User.workSpace` 字符串”过渡到：

```text
User -> Workspace -> Agent -> Thread
```

### 4.2 改造内容

新增数据库表：

- `workspaces`
- `workspace_members`
- `agents`
- `agent_configs`
- `workspace_memories`
- `agent_memories`

修改或补充现有表：

- `users`
  - 增加 `default_workspace_id`
- `threads`
  - 增加 `workspace_id`
  - 增加 `agent_id`

### 4.3 初始化逻辑

在用户注册完成后自动执行：

1. 创建 workspace
2. 创建 workspace owner membership
3. 创建默认平台 Agent
4. 创建空的 workspace memory
5. 创建空的 agent memory
6. 回写默认关系

### 4.4 兼容策略

保留现有 `User.workSpace` 字段一段时间，作为过渡字段。

规则：

- 新注册用户同时写：
  - `users.default_workspace_id`
  - `users.workSpace`
- 新逻辑优先读正式 `workspace`
- 旧逻辑可暂时继续依赖 `workSpace`

### 4.5 交付物

- 数据库 schema 更新
- migration 脚本
- 注册初始化逻辑
- 默认 Agent 初始化逻辑

### 4.6 验证点

- 新用户注册后可自动创建 workspace 和默认 Agent
- 数据库关系完整
- 不影响现有登录流程

---

## Phase 2: 后端权限与上下文重构

### 5.1 目标

建立统一的请求上下文与权限校验模型，替代当前隐式的 workspace 透传方式。

### 5.2 改造内容

新增：

- `RequestContext`
- `AuthZService`
- `WorkspaceService`
- `AgentService`

统一权限校验接口：

- `assert_workspace_access`
- `assert_agent_access`
- `assert_thread_access`

### 5.3 上下文调整

扩展现有 `UserContext`，增加：

- `workspace_id`
- `agent_id`
- `thread_id`

注意：

- API 层可以只带 `workspace_id`
- thread/run 场景需要补全 `agent_id`

### 5.4 交付物

- 请求上下文模型
- 后端统一鉴权服务
- workspace / agent 查询服务

### 5.5 验证点

- 用户无法访问不属于自己的 workspace
- 无法跨 workspace 访问 agent
- 无法跨 agent 访问 thread

---

## Phase 3: Thread 归属改造

### 6.1 目标

让所有 thread 显式归属到 Agent。

### 6.2 改造内容

创建 thread 时必须传入或推导：

- `workspace_id`
- `agent_id`

规则：

- 新接口显式传 `agent_id`
- 旧接口未传 `agent_id` 时，自动绑定到默认 Agent

thread 查询改造为：

- 按 `workspace_id` 过滤
- 按 `agent_id` 过滤

### 6.3 路由演进

新增路由建议：

- `POST /api/workspaces/{workspace_id}/agents/{agent_id}/threads`
- `GET /api/workspaces/{workspace_id}/agents/{agent_id}/threads`

兼容层：

- 旧 thread 路由内部自动映射到默认 Agent

### 6.4 数据迁移

为历史 thread 补：

- `workspace_id`
- `agent_id = workspace.default_agent_id`

### 6.5 交付物

- thread 服务改造
- thread 查询改造
- 历史 thread 回填脚本

### 6.6 验证点

- 同一 workspace 下不同 agent 的 thread 列表隔离
- 默认 Agent 能接管旧 thread
- 历史数据可正常查询和运行

---

## Phase 4: Path / Storage 重构

### 7.1 目标

把文件系统从“workspace 下 thread 目录”升级为“workspace -> agent -> thread”三级结构。

### 7.2 改造内容

新增统一 `PathManager`，支持：

- workspace 根路径
- agent 根路径
- thread 根路径
- memory 文件路径
- skills / tools / artifacts 路径

建议目录结构：

```text
backend/.deer-flow/
  workspaces/
    <workspace_id>/
      memory.json
      agents/
        <agent_id>/
          agent.yaml
          SOUL.md
          memory.json
          threads/
            <thread_id>/
              user-data/
                workspace/
                uploads/
                outputs/
```

### 7.3 改造范围

涉及：

- `Paths`
- thread data middleware
- artifact path resolver
- upload path resolver
- sandbox path mounting

### 7.4 兼容策略

旧 thread 仍然允许通过旧路径查询，但内部映射到新路径或通过 registry 兜底。

### 7.5 交付物

- `PathManager`
- 新路径布局
- artifact / upload / output 路径重构

### 7.6 验证点

- agent A 无法读取 agent B 的 outputs
- artifact 下载只能命中本 agent 的 thread 目录
- sandbox 挂载路径正确

---

## Phase 5: Memory / Skills / Tools Agent 化

### 8.1 目标

将当前偏全局或 workspace 级的能力配置下沉到 agent 粒度。

### 8.2 改造内容

新增：

- `MemoryService`
- `SkillResolver`
- `ToolResolver`
- `RuntimeConfigService`
- `RuntimeFactory`

### 8.3 Memory 处理

运行时 memory 注入改为：

1. 平台默认 prompt
2. workspace memory
3. agent memory
4. thread 短期上下文

### 8.4 Skills 处理

Agent 的生效 skills 由以下集合计算：

```text
平台公共 skills
+ workspace private skills
+ agent private skills
- deny / disabled
= effective skills
```

### 8.5 Tools 处理

Agent 的 tools 由独立 policy 决定。

支持：

- tool group allow
- tool deny
- network policy
- sandbox policy
- file access policy

### 8.6 交付物

- workspace memory 与 agent memory 的服务层
- Agent 级 skill / tool 解析器
- Agent 最终运行时配置工厂

### 8.7 验证点

- 不同 agent 的 memory 注入不同
- 不同 agent 的可用工具不同
- 不同 agent 的 skills 可独立开关

---

## Phase 6: 前端与管理能力接入

### 9.1 目标

让用户在 UI 中真正感知并操作多 Agent Workspace。

### 9.2 改造内容

前端新增能力：

- workspace 下 agent 列表
- agent 创建 / 编辑 / 删除
- 默认 Agent 标识
- agent 维度 thread 列表
- agent 维度 memory / skills / tools 设置页

### 9.3 页面建议

建议增加：

- `workspace/agents`
- `workspace/agents/new`
- `workspace/agents/{agent_id}/settings`
- thread 列表增加当前 Agent 过滤

### 9.4 兼容策略

默认进入 workspace 时自动定位到默认 Agent。

如果用户没有切换 Agent，行为应与当前版本尽量一致。

### 9.5 交付物

- Agent 管理 UI
- thread 列表按 Agent 过滤
- Agent 设置页

### 9.6 验证点

- 用户可切换 Agent
- 不同 Agent 的 thread 列表互不混淆
- 默认 Agent 行为与旧版一致

---

## 5. 关键技术任务拆解

## 5.1 数据层任务

- 设计 Prisma schema 更新方案
- 编写 migration
- 编写历史数据回填脚本
- 设计注册初始化事务逻辑

## 5.2 后端服务层任务

- 引入 `AuthZService`
- 引入 `WorkspaceService`
- 引入 `AgentService`
- 引入 `ThreadService`
- 引入 `MemoryService`
- 引入 `RuntimeFactory`

## 5.3 存储层任务

- 新建 `PathManager`
- 适配 artifact router
- 适配 uploads router
- 适配 thread data middleware
- 适配 sandbox virtual path mapping

## 5.4 前端任务

- 新增 agent 管理 API 封装
- 新增 agent 列表与选择器
- 按 agent 过滤 thread 列表
- 新增 agent 配置页

---

## 6. 数据迁移计划

### 6.1 迁移目标

为所有现有用户和历史 thread 建立正式归属关系。

### 6.2 迁移顺序

1. 创建 `workspaces`
2. 创建默认 `agents`
3. 回填 `users.default_workspace_id`
4. 回填历史 `threads.workspace_id`
5. 回填历史 `threads.agent_id`
6. 为历史 workspace 初始化 memory

### 6.3 回填规则

对于每个用户：

- 使用现有 `User.workSpace` 生成或映射到正式 `workspace`
- 创建默认平台 Agent

对于每个历史 thread：

- 若能从历史 metadata 推断 workspace，使用该 workspace
- 否则使用用户默认 workspace
- `agent_id` 一律指向默认 Agent

### 6.4 回滚策略

迁移期间保留：

- 原始 `User.workSpace`
- 原始 thread-workspace registry

如新逻辑异常，可临时回退到旧查找路径。

---

## 7. 风险控制

### 7.1 风险点

- 历史 thread 元数据不完整
- 路径迁移导致 artifact 丢失
- 多层权限校验导致旧接口行为变化
- memory 作用域变化导致 Agent 输出行为变化

### 7.2 控制措施

- 先做读兼容，再做写切换
- migration 先在测试环境全量演练
- 对历史 thread 保留兼容路径解析
- 增加 feature flag 控制 Agent 化运行链路

---

## 8. Feature Flag 建议

建议增加以下开关：

- `ENABLE_WORKSPACE_ENTITY`
- `ENABLE_AGENT_ENTITY`
- `ENABLE_AGENT_SCOPED_THREADS`
- `ENABLE_AGENT_SCOPED_STORAGE`
- `ENABLE_AGENT_MEMORY`
- `ENABLE_AGENT_TOOLS`
- `ENABLE_AGENT_SKILLS`

用途：

- 分阶段启用能力
- 便于灰度
- 便于快速回滚

---

## 9. 测试策略

### 9.1 单元测试

重点覆盖：

- workspace / agent / thread 归属校验
- path manager 路径生成
- memory 注入合并逻辑
- skill / tool resolver

### 9.2 集成测试

重点覆盖：

- 注册初始化
- 创建默认 Agent
- 创建 Agent 后创建 thread
- artifact / upload 访问控制
- 不同 Agent 间隔离

### 9.3 回归测试

重点覆盖：

- 默认 Agent 场景不影响现有用户主流程
- 历史 thread 能继续访问
- 旧路由仍可工作

---

## 10. 建议里程碑

### M1: 领域实体落地

完成：

- 数据表
- 初始化
- 默认 Agent

验收标准：

- 新用户已具备 workspace + default agent

### M2: Agent 归属闭环

完成：

- thread 显式归属 agent
- 权限校验闭环

验收标准：

- 同 workspace 下不同 agent 的 thread 可完全隔离

### M3: Storage 与 Runtime 闭环

完成：

- PathManager
- agent memory / tools / skills

验收标准：

- 不同 agent 的运行资产和运行能力完全独立

### M4: 前端完整接入

完成：

- agent 管理 UI
- settings UI
- thread 按 agent 展示

验收标准：

- 用户可完整感知并使用多 Agent Workspace

---

## 11. 推荐开发顺序

建议按以下顺序推进：

1. Prisma schema 与 migration
2. 注册初始化与默认 Agent 创建
3. `AuthZService` 与上下文模型
4. thread 归属改造
5. `PathManager`
6. runtime factory 与 memory / skill / tool resolver
7. 前端 agent 管理与切换

这个顺序的优点是：

- 数据先稳定
- 归属关系先明确
- 运行链路最后切换，风险更低

---

## 12. 下一步建议

基于当前阶段，建议接下来直接产出以下工程文档或代码：

1. Prisma schema 变更方案
2. 后端模块拆分清单
3. `PathManager` 详细接口设计
4. `AuthZService` 与 `RuntimeFactory` 伪代码
5. Phase 1 的实际代码实现

---

## 13. 结论

本实施计划的核心是：

- 先把 `workspace` 与 `agent` 变成正式实体
- 再把 `thread`、`memory`、`skills`、`tools` 逐步下沉到 Agent 维度
- 始终保留默认 Agent 作为旧模型兼容层

这样可以保证 DeerFlow 在现有能力不被破坏的情况下，平滑演进到：

```text
workspace 隔离
  -> agent 隔离
    -> thread 隔离
```

这是最适合当前 DeerFlow 代码基础的实施路径。
