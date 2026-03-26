# Agent Workspace 设计文档

## 1. 文档目标

本文档定义 DeerFlow 在多 Agent Workspace 场景下的目标架构，用于支撑以下设计要求：

- 一个用户默认拥有一个隔离的 `workspace`
- 每个 `workspace` 默认有一个平台级 Agent
- 每个 `workspace` 可以创建多个自定义 Agent
- 每个 Agent 拥有自己的 threads、memory、skills、tools、配置与运行资产
- 不同 `workspace` 之间隔离
- 同一 `workspace` 内不同 Agent 之间隔离
- 方案能够在现有 DeerFlow 基础上渐进演进，而不是一次性推翻重构

本文档聚焦：

- 领域模型
- 存储模型
- 运行时模型
- API 与权限模型
- 迁移方案

---

## 2. 背景与现状

从当前 DeerFlow 开源版本来看，系统已经具备以下基础能力：

- 已存在用户登录态与 `workspace` 概念
- 用户请求会携带 `userId`、`workspace`
- 后端文件路径已经开始按 `workspace` 做存储隔离
- 线程运行目录已具备独立的 `workspace / uploads / outputs`

但当前模型仍然更接近：

```text
1 user -> 1 workspace -> many threads
```

当前尚未完整建立如下正式模型：

```text
1 workspace -> many agents -> many threads
```

也尚未完成以下能力的系统化下沉：

- Agent 级 memory
- Agent 级 tools
- Agent 级 skills
- Agent 级配置继承
- Agent 级文件与运行资产隔离

因此，需要将 DeerFlow 从“用户级 workspace + thread 隔离”升级为“workspace 下多 Agent 的分层隔离系统”。

---

## 3. 设计目标

### 3.1 功能目标

系统需要支持：

1. 每个用户拥有一个默认 `workspace`
2. 每个 `workspace` 初始化时自动创建一个默认平台 Agent
3. 用户可以在同一 `workspace` 下创建多个 Agent
4. 每个 Agent 拥有独立的：
   - threads
   - memory
   - skills
   - tools
   - prompt / soul / model 配置
   - artifacts / uploads / outputs
5. 用户只能访问自己的 `workspace`
6. Agent 之间默认不可读写彼此资产

### 3.2 非功能目标

系统还需要满足：

- 高隔离性
- 可审计性
- 可扩展性
- 向后兼容现有 thread 机制
- 支持未来扩展到：
  - 一个用户多个 workspace
  - 多个用户共享一个 workspace
  - 企业级权限控制

---

## 4. 核心设计原则

### 4.1 分层隔离

隔离层级统一定义为：

- Level 1: `workspace`
- Level 2: `agent`
- Level 3: `thread`

所有数据、路径、权限、运行时上下文都必须明确归属到这三个层级之一。

### 4.2 默认 Agent 与自定义 Agent 并存

每个 workspace 至少存在一个平台默认 Agent，以保证开箱即用；用户可以在此基础上继续创建自定义 Agent。

### 4.3 配置分层继承

Agent 的最终运行配置采用三层继承：

```text
Platform Defaults
  -> Workspace Overrides
    -> Agent Overrides
      = Effective Runtime Config
```

### 4.4 线程强归属

每个 thread 必须显式绑定：

- `workspace_id`
- `agent_id`

禁止存在只绑定用户、不绑定 Agent 的 thread。

### 4.5 运行时最小上下文

运行链路中只注入当前请求所需上下文：

- 当前用户
- 当前 workspace
- 当前 agent
- 当前 thread

避免依赖全局共享状态。

---

## 5. 领域模型

### 5.1 User

表示登录用户。

关键字段：

- `id`
- `email`
- `name`
- `default_workspace_id`
- `status`
- `created_at`
- `updated_at`

### 5.2 Workspace

表示一级隔离单元。

关键字段：

- `id`
- `owner_user_id`
- `name`
- `slug`
- `status`
- `default_agent_id`
- `created_at`
- `updated_at`

职责：

- 承载用户级共享资产
- 管理本 workspace 下所有 Agents
- 作为 storage 与 authz 的一级边界

### 5.3 Agent

表示 workspace 内的智能体实例，是二级隔离单元。

关键字段：

- `id`
- `workspace_id`
- `name`
- `slug`
- `type`
- `source`
- `description`
- `is_default`
- `status`
- `created_by`
- `created_at`
- `updated_at`

其中：

- `type`: `platform` / `custom`
- `source`: `system_builtin` / `user_created` / `cloned`
- `is_default`: 是否为 workspace 默认 Agent

### 5.4 Thread

表示对话线程，归属于某个 Agent。

关键字段：

- `id`
- `workspace_id`
- `agent_id`
- `title`
- `status`
- `created_by`
- `created_at`
- `updated_at`

### 5.5 WorkspaceMemory

表示 workspace 级共享长期记忆。

用途包括：

- 用户长期偏好
- workspace 共享背景知识
- 所有 Agent 可共享的稳定信息

### 5.6 AgentMemory

表示 agent 级私有长期记忆。

用途包括：

- Agent 专属行为偏好
- Agent 私有知识沉淀
- Agent 特定任务上下文

### 5.7 SkillBinding

表示 Agent 生效的技能集合。

关键字段：

- `workspace_id`
- `agent_id`
- `skill_name`
- `skill_scope`
- `enabled`
- `config_json`

### 5.8 ToolBinding

表示 Agent 可用的工具集合与权限策略。

关键字段：

- `workspace_id`
- `agent_id`
- `tool_name`
- `tool_group`
- `enabled`
- `policy_json`

---

## 6. 核心关系模型

```text
User
  └── Workspace
        ├── Workspace Memory
        ├── Default Platform Agent
        └── Custom Agents
              ├── Agent Memory
              ├── Skills
              ├── Tools
              └── Threads
                    ├── workspace/
                    ├── uploads/
                    └── outputs/
```

对于当前阶段，默认采用：

```text
1 user -> 1 workspace
1 workspace -> 1 default agent + N custom agents
1 agent -> N threads
```

---

## 7. 隔离模型

### 7.1 Workspace 隔离

不同 workspace 之间必须隔离以下内容：

- 线程列表
- 文件目录
- artifacts
- memory
- 自定义 agents
- 私有 skills
- tool 策略
- 上传文件
- 执行产物

实现要求：

- 所有 API 请求必须可解析出当前 `workspace_id`
- 所有数据库查询都必须带 `workspace_id` 约束
- 所有文件路径必须以 `workspace_id` 为一级根路径

### 7.2 Agent 隔离

同一 workspace 内不同 agent 之间必须隔离以下内容：

- threads
- agent memory
- tool 白名单
- skills 启用集合
- prompt / soul / model 配置
- outputs / artifacts

默认规则：

- Agent A 不可读取 Agent B 的 memory
- Agent A 不可列出 Agent B 的 threads
- Agent A 不可访问 Agent B 的 outputs
- 是否允许访问 workspace 共享 memory，由显式策略控制

### 7.3 Thread 隔离

同一 Agent 下不同 thread 继续保持独立运行目录：

- `workspace`
- `uploads`
- `outputs`

每个 thread 对应独立的沙箱工作区与文件资产。

---

## 8. 存储设计

### 8.1 数据库存储

建议引入正式关系模型，而不是继续只在 `User` 上保留 `workSpace` 字符串。

建议核心表：

- `users`
- `workspaces`
- `workspace_members`
- `agents`
- `agent_configs`
- `threads`
- `workspace_memories`
- `agent_memories`
- `agent_skills`
- `agent_tools`
- `thread_artifacts`
- `thread_uploads`

核心约束：

- `workspaces.owner_user_id -> users.id`
- `agents.workspace_id -> workspaces.id`
- `threads.workspace_id -> workspaces.id`
- `threads.agent_id -> agents.id`
- `agents (workspace_id, slug)` 唯一
- `workspace_memories.workspace_id` 唯一
- `agent_memories.agent_id` 唯一

### 8.2 文件系统存储

建议将文件目录组织为：

```text
backend/.deer-flow/
  workspaces/
    <workspace_id>/
      workspace.json
      USER.md
      memory.json
      skills/
        private/
          <skill_name>/
      agents/
        <agent_id>/
          agent.yaml
          SOUL.md
          memory.json
          skills/
            enabled.json
            private/
          tools/
            policy.json
          threads/
            <thread_id>/
              meta.json
              user-data/
                workspace/
                uploads/
                outputs/
```

目录说明：

- `workspace` 根目录保存用户级共享资产
- `agents/<agent_id>` 保存 Agent 专属配置和私有资产
- `threads/<thread_id>` 保存单个线程的运行文件

---

## 9. Memory 设计

### 9.1 双层 Memory 模型

系统采用两层 memory：

#### Workspace Memory

用于保存：

- 用户长期偏好
- workspace 级业务背景
- 多 Agent 可共享的长期信息

#### Agent Memory

用于保存：

- Agent 专属行为风格
- 专业领域沉淀
- Agent 私有长期上下文

### 9.2 Memory 注入顺序

建议运行时按以下顺序注入：

1. 平台基础 prompt
2. workspace memory
3. agent memory
4. thread 短期上下文摘要

这样可以保证：

- 通用规则最先进入上下文
- 用户级信息可被所有 Agent 复用
- Agent 级个性覆盖更细粒度行为

---

## 10. Skills 设计

### 10.1 Skill Scope

建议支持三种 scope：

- `platform_public`
- `workspace_private`
- `agent_private`

### 10.2 生效规则

某个 Agent 的最终有效 skills 由以下集合计算：

```text
平台公共 skills
+ workspace 允许的 skills
+ agent 私有 skills
- agent 禁用项
= effective skills
```

### 10.3 管理原则

- 平台公共 skills 由系统维护
- workspace 私有 skills 由当前 workspace 管理
- agent 私有 skills 由该 agent 自己持有

---

## 11. Tools 设计

### 11.1 Tool 权限模型

每个 Agent 维护独立 tool policy。

建议支持：

- `allow_all_in_group`
- `allow_list`
- `deny_list`
- `sandbox_mode`
- `network_policy`
- `file_access_policy`

### 11.2 典型场景

- 平台默认 Agent：常规工具集，满足通用任务
- Python 开发 Agent：允许 bash、测试、文件编辑
- Review Agent：默认只读，禁写
- 运维 Agent：允许部署类工具，但受环境限制

---

## 12. 默认平台 Agent 设计

### 12.1 初始化规则

用户注册或首次初始化时，自动执行：

1. 创建 workspace
2. 创建默认平台 Agent
3. 设置 `workspace.default_agent_id`

### 12.2 默认 Agent 约束

默认 Agent 具有以下特征：

- `type = platform`
- `is_default = true`
- 继承平台默认 prompt / tools / skills
- 可被用户直接使用
- 不允许删除
- 允许有限的展示名或局部配置覆盖

---

## 13. 运行时模型

### 13.1 统一请求上下文

后端每次请求都应构造统一的请求上下文：

```python
RequestContext(
    user_id=...,
    email=...,
    workspace_id=...,
    agent_id=...,
    thread_id=...,
)
```

该上下文应贯穿：

- API 层
- service 层
- runtime 层
- sandbox 层
- path resolver
- memory injector
- artifact resolver

### 13.2 统一运行时上下文

Agent 实际执行时，建议使用单独的运行时上下文：

```python
RuntimeContext(
    user_id=...,
    workspace_id=...,
    agent_id=...,
    thread_id=...,
    effective_model=...,
    effective_tools=[...],
    effective_skills=[...],
    workspace_memory={...},
    agent_memory={...},
)
```

### 13.3 线程创建链路

```text
用户选择 workspace 下某个 agent
-> 发起创建 thread
-> 后端校验 user 是否属于 workspace
-> 校验 agent 是否属于 workspace
-> 创建 thread(workspace_id, agent_id)
-> 初始化 thread 目录
-> 返回 thread_id
```

### 13.4 消息运行链路

```text
用户向某 agent 的某 thread 发送消息
-> 校验 user/workspace/agent/thread 归属关系
-> 加载 workspace memory
-> 加载 agent memory
-> 加载 agent skills/tools
-> 构建 effective runtime config
-> 在 thread 私有 sandbox 中执行
-> 写入 outputs/artifacts
-> 更新 thread state 与 memory
```

---

## 14. API 设计建议

### 14.1 Workspace API

- `GET /api/workspaces/current`
- `GET /api/workspaces/{workspace_id}`

### 14.2 Agent API

- `GET /api/workspaces/{workspace_id}/agents`
- `POST /api/workspaces/{workspace_id}/agents`
- `GET /api/workspaces/{workspace_id}/agents/{agent_id}`
- `PUT /api/workspaces/{workspace_id}/agents/{agent_id}`
- `DELETE /api/workspaces/{workspace_id}/agents/{agent_id}`

约束：

- 默认 Agent 不允许删除

### 14.3 Thread API

- `GET /api/workspaces/{workspace_id}/agents/{agent_id}/threads`
- `POST /api/workspaces/{workspace_id}/agents/{agent_id}/threads`
- `GET /api/workspaces/{workspace_id}/agents/{agent_id}/threads/{thread_id}`
- `DELETE /api/workspaces/{workspace_id}/agents/{agent_id}/threads/{thread_id}`

### 14.4 Memory API

- `GET /api/workspaces/{workspace_id}/memory`
- `PUT /api/workspaces/{workspace_id}/memory`
- `GET /api/workspaces/{workspace_id}/agents/{agent_id}/memory`
- `PUT /api/workspaces/{workspace_id}/agents/{agent_id}/memory`

### 14.5 Skills API

- `GET /api/workspaces/{workspace_id}/agents/{agent_id}/skills`
- `PUT /api/workspaces/{workspace_id}/agents/{agent_id}/skills`

### 14.6 Tools API

- `GET /api/workspaces/{workspace_id}/agents/{agent_id}/tools`
- `PUT /api/workspaces/{workspace_id}/agents/{agent_id}/tools`

---

## 15. 权限与安全模型

### 15.1 权限校验原则

任意请求必须校验：

1. 用户是否已登录
2. workspace 是否属于当前用户
3. agent 是否属于该 workspace
4. thread 是否属于该 agent 和 workspace

禁止只凭 `thread_id` 或 `agent_id` 直接访问资源。

### 15.2 文件访问安全

路径解析必须满足：

- 仅允许在 `workspace_id / agent_id / thread_id` 对应根目录下解析
- 严禁 `..` 路径穿越
- artifact 下载必须校验 thread 的归属链路

### 15.3 Tool 安全

运行时仅注入当前 Agent 的有效 tool policy，不允许先加载全量工具再在执行阶段临时过滤。

---

## 16. 配置继承模型

Agent 最终运行配置采用三层 merge：

```text
Platform Defaults
  -> Workspace Overrides
    -> Agent Overrides
      = Effective Agent Runtime Config
```

可继承配置包括：

- model
- system prompt
- tool groups
- skills whitelist
- memory injection policy
- sandbox policy
- tracing policy

建议 merge 规则：

- 标量字段：后者覆盖前者
- 列表字段：支持 `replace` / `append`
- map 字段：递归 merge

---

## 17. 数据库设计建议

### 17.1 核心表

建议核心表如下：

- `users`
- `workspaces`
- `workspace_members`
- `agents`
- `agent_configs`
- `threads`
- `workspace_memories`
- `agent_memories`
- `agent_skills`
- `agent_tools`
- `thread_artifacts`
- `thread_uploads`

### 17.2 关键约束

- `thread.workspace_id == agent.workspace_id`
- `workspace.default_agent_id` 必须属于当前 workspace
- 一个 workspace 仅允许一个默认 Agent
- `agent_memories.agent_id` 必须存在于 `agents`
- `workspace_memories.workspace_id` 必须存在于 `workspaces`

### 17.3 初始化流程

新用户注册后自动执行：

1. 创建 `users`
2. 创建 `workspaces`
3. 创建 `workspace_members(owner)`
4. 创建默认平台 `agent`
5. 创建空的 `workspace_memories`
6. 创建空的 `agent_memories`
7. 回写：
   - `users.default_workspace_id`
   - `workspaces.default_agent_id`

---

## 18. 后端分层实现建议

### 18.1 推荐分层

建议后端按以下层次组织：

- `router`
- `service`
- `repository`
- `domain`
- `runtime`
- `storage`

### 18.2 推荐目录结构

```text
backend/app/
  domain/
    workspace/
    agent/
    thread/

  repositories/
    workspace_repo.py
    agent_repo.py
    thread_repo.py
    memory_repo.py
    skill_repo.py
    tool_repo.py

  services/
    authz_service.py
    workspace_service.py
    agent_service.py
    thread_service.py
    memory_service.py
    runtime_config_service.py

  runtime/
    request_context.py
    runtime_context.py
    runtime_factory.py
    memory_injector.py
    skill_resolver.py
    tool_resolver.py

  storage/
    path_manager.py
    artifact_store.py
    upload_store.py
```

### 18.3 核心职责

#### Router 层

负责：

- 接收请求
- 参数解析
- 调用 service
- 返回响应

不负责：

- 复杂业务编排
- 多层权限校验
- 路径拼装

#### Service 层

负责：

- 编排业务逻辑
- 校验归属关系
- 调用 repository 与 runtime / storage

#### Repository 层

负责：

- 数据库 CRUD
- 不承载复杂业务逻辑

#### Runtime 层

负责：

- 合并配置
- 注入 memory
- 解析 tools / skills
- 构建 Agent 最终运行时

#### Storage 层

负责：

- 管理 workspace / agent / thread 目录
- 安全解析 artifact / upload / output 路径
- 禁止路径穿越

---

## 19. 路径管理设计

建议新增统一 `PathManager`，不要继续把全部路径逻辑压在 thread-only 模型上。

推荐接口：

```python
class PathManager:
    def workspace_root(self, workspace_id: str) -> Path: ...
    def workspace_memory_file(self, workspace_id: str) -> Path: ...
    def workspace_skills_root(self, workspace_id: str) -> Path: ...

    def agent_root(self, workspace_id: str, agent_id: str) -> Path: ...
    def agent_memory_file(self, workspace_id: str, agent_id: str) -> Path: ...
    def agent_threads_root(self, workspace_id: str, agent_id: str) -> Path: ...

    def thread_root(self, workspace_id: str, agent_id: str, thread_id: str) -> Path: ...
    def thread_workspace_dir(self, workspace_id: str, agent_id: str, thread_id: str) -> Path: ...
    def thread_uploads_dir(self, workspace_id: str, agent_id: str, thread_id: str) -> Path: ...
    def thread_outputs_dir(self, workspace_id: str, agent_id: str, thread_id: str) -> Path: ...
```

创建 Agent 时初始化：

- `agent.yaml`
- `SOUL.md`
- `memory.json`
- `skills/`
- `tools/`
- `threads/`

创建 thread 时初始化：

- `user-data/workspace`
- `user-data/uploads`
- `user-data/outputs`

---

## 20. 迁移方案

### 20.1 迁移目标

从当前模型：

```text
user -> workspace(string) -> threads
```

迁移到目标模型：

```text
user -> workspace(entity) -> agents -> threads
```

### 20.2 建议迁移阶段

#### Phase 1: 先引入实体模型

- 新增 `workspaces` 表
- 新增 `agents` 表
- 为每个现有用户补一条 workspace 记录
- 为每个 workspace 创建默认 Agent
- 为已有 thread 补 `workspace_id`、`agent_id`

#### Phase 2: 路由显式 Agent 化

- 新增 agent 维度 API
- thread 查询全部按 agent 过滤
- 前端增加 Agent 维度切换

#### Phase 3: memory / tools / skills 下沉

- 将当前全局或 workspace 级配置按 agent 维度拆分
- 支持 Agent 级 memory、skills、tools

#### Phase 4: 清理兼容层

- 移除旧的隐式 thread-only 路径逻辑
- 将所有运行链路切换到正式 `workspace -> agent -> thread` 模型

### 20.3 兼容策略

为了平滑上线，建议保留一段兼容层：

- 老 thread 未绑定 `agent_id` 时，自动挂到默认 Agent
- 老接口未传 `agent_id` 时，后端自动使用 `workspace.default_agent_id`
- 旧 memory 若只有 workspace 级，允许 agent memory 为空

---

## 21. 风险与权衡

### 风险 1: 路径逻辑重构量较大

当前 DeerFlow 的部分逻辑仍以 `thread` 为核心，需要逐步迁移到 `workspace + agent + thread` 的路径解析方式。

### 风险 2: Memory 作用域变化可能导致行为漂移

如果不明确区分 workspace memory 与 agent memory，Agent 输出风格可能出现不稳定。

### 风险 3: Tool 配置复杂度提高

Tool 权限下沉到 Agent 后，配置复杂度会上升，需要默认模板与合理的 UI 支撑。

### 风险 4: 前端认知成本提升

引入多 Agent 后，用户需要明确自己当前位于哪个 Agent 上下文下工作。

---

## 22. 推荐落地路径

建议按如下顺序实施：

1. 先补齐数据库正式实体模型
2. 再引入 `AuthZService`
3. 再实现 `PathManager`
4. 再补 `RuntimeFactory`
5. 最后完成前端 Agent 维度接入

这样可以降低改造风险，并保持每一步都具备可验证闭环。

---

## 23. 结论

本设计的核心思想是：

- `workspace` 作为一级隔离边界
- `agent` 作为二级能力与配置边界
- `thread` 作为三级运行与文件边界

最终目标模型为：

```text
User
  -> Workspace
      -> Default Platform Agent
      -> Custom Agent A
      -> Custom Agent B
      -> Workspace Shared Memory
      -> Agent A Memory / Threads / Skills / Tools
      -> Agent B Memory / Threads / Skills / Tools
```

该方案与 DeerFlow 当前架构兼容度较高，适合通过渐进式方式演进，并为未来的共享 workspace、团队协作与企业级权限控制留下扩展空间。
