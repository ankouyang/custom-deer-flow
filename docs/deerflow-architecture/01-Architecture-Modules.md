# DeerFlow 架构与模块分析

## 1. 架构定位

DeerFlow 2.0 不是单纯的聊天应用，而是一个 Agent Harness。它的目标是把模型、工具、技能、记忆、子代理、沙箱和工作台组织成一个可运行的平台。

当前项目整体可以抽象为 4 层：

1. 接入层：浏览器、IM Channels、Nginx 统一入口
2. 应用层：Next.js 工作台、FastAPI Gateway
3. Agent Runtime 层：LangGraph Lead Agent、Middleware、Tools、Subagents
4. 基础能力层：模型接入、MCP、Memory、Sandbox、Artifacts、Thread Storage

整体拓扑：

```text
Browser / IM Channels
  -> Nginx :2026
    -> Frontend :3000
    -> Gateway API :8001
    -> LangGraph Runtime :2024
      -> Lead Agent
      -> Middleware Chain
      -> Tools / MCP / Sandbox / Subagents
      -> Memory / Checkpointer / Thread FS
```

## 2. 入口与边界

### 2.1 统一入口层

- Nginx 配置文件：[nginx.local.conf](/Users/ankouyang/project/deer-flow/docker/nginx/nginx.local.conf)
- 作用：
  - `/api/langgraph/*` 转发到 LangGraph
  - `/api/*` 其它 REST 请求转发到 Gateway
  - `/` 页面请求转发到 Frontend

这是项目的第一层解耦点。前端不直接关心 8001/2024，浏览器通常只需要访问 2026。

### 2.2 前端工作台层

- 页面入口：[frontend/src/app](/Users/ankouyang/project/deer-flow/frontend/src/app)
- 线程页：[page.tsx](/Users/ankouyang/project/deer-flow/frontend/src/app/workspace/chats/[thread_id]/page.tsx)
- 流式线程 Hook：[hooks.ts](/Users/ankouyang/project/deer-flow/frontend/src/core/threads/hooks.ts)

前端职责：

- 展示线程、消息、todo、artifact、settings
- 管理模型选择、模式切换、上传文件、消息输入
- 通过 LangGraph SDK 建立流式交互
- 调用 Gateway 获取模型、记忆、技能、上传、artifact 等 REST 数据

这不是“薄前端”，而是一个带工作流状态管理的 Agent 工作台。

### 2.3 Gateway API 层

- 应用入口：[app.py](/Users/ankouyang/project/deer-flow/backend/app/gateway/app.py)
- 路由目录：[routers](/Users/ankouyang/project/deer-flow/backend/app/gateway/routers)

Gateway 的职责是“资源面 API”，而不是 agent 推理主链路。

主要接口分组：

- models：模型列表
- mcp：MCP 配置
- memory：记忆配置与内容
- skills：技能配置与启用状态
- uploads：上传文件
- threads：线程本地资源清理
- artifacts：artifact 读取
- agents：自定义 agent 管理
- suggestions：跟进问题建议
- channels：IM 渠道管理

这个层非常适合二开时承载“管理后台”和“配置中心”能力。

### 2.4 Agent Runtime 层

- Lead Agent 入口：[agent.py](/Users/ankouyang/project/deer-flow/backend/packages/harness/deerflow/agents/lead_agent/agent.py)

核心职责：

- 解析运行时模型
- 组装 middleware chain
- 绑定工具系统
- 执行推理与工具调用
- 管理子代理与线程状态

这是整个项目的中枢层，前端和 Gateway 都是围绕它服务。

## 3. 模块分类

### 3.1 按运行职责分类

#### A. 接入与交互模块

- Frontend App Router
- Workspace 组件
- IM Channels
- Nginx 路由层

作用：
负责“用户如何进入系统”和“系统如何向用户输出结果”。

#### B. 配置与控制平面模块

- App Config
- Gateway Routers
- Skills / MCP / Agents 配置
- Memory Config
- Gateway Config

作用：
负责系统配置、能力开关、元数据暴露和资源管理。

#### C. Agent 执行平面模块

- Lead Agent
- Middleware
- Tool Loader
- Subagents
- Prompt 构建
- Model Factory

作用：
负责一次任务如何从输入变成输出。

#### D. 状态与持久化模块

- Thread FS：`backend/.deer-flow/threads/...`
- Memory：`backend/.deer-flow/memory.json`
- Checkpointer：`checkpoints.db`
- Artifacts / uploads / outputs

作用：
负责让运行具备可恢复、可回放、可沉淀的能力。

### 3.2 按代码目录分类

#### 后端 Harness 核心

目录：[deerflow](/Users/ankouyang/project/deer-flow/backend/packages/harness/deerflow)

子模块：

- `agents/`
  - lead_agent：主 Agent 工厂
  - middlewares：中间件链
  - memory：记忆更新、队列、存储
  - checkpointer：状态持久化
- `models/`
  - 模型工厂与 provider 适配
- `tools/`
  - 工具组装与 builtin tools
- `subagents/`
  - 子代理注册与执行
- `sandbox/`
  - 本地/隔离执行接口
- `mcp/`
  - MCP 协议接入
- `skills/`
  - SKILL.md 发现与加载
- `config/`
  - 配置模型与路径规则
- `community/`
  - Tavily/Jina/Firecrawl/InfoQuest 等社区能力
- `guardrails/`
  - 约束与风险防护

#### 后端应用层

目录：[backend/app](/Users/ankouyang/project/deer-flow/backend/app)

子模块：

- `gateway/`
  - 资源面 API
- `channels/`
  - Feishu/Slack/Telegram 渠道接入

#### 前端业务层

目录：[frontend/src/core](/Users/ankouyang/project/deer-flow/frontend/src/core)

子模块：

- `threads/`：线程流式交互
- `models/`：模型列表
- `memory/`：记忆读取
- `skills/`：技能配置
- `uploads/`：文件上传
- `artifacts/`：产物读取
- `settings/`：本地设置
- `api/`：客户端封装
- `i18n/`：国际化

#### 前端 UI 层

目录：[frontend/src/components](/Users/ankouyang/project/deer-flow/frontend/src/components)

子模块：

- `workspace/`
- `ui/`
- `ai-elements/`
- `landing/`

## 4. 每个核心模块的设计意图

### 4.1 Config 模块

关键文件：

- [app_config.py](/Users/ankouyang/project/deer-flow/backend/packages/harness/deerflow/config/app_config.py)
- [paths.py](/Users/ankouyang/project/deer-flow/backend/packages/harness/deerflow/config/paths.py)

设计意图：

- 统一配置入口
- 支持环境变量注入
- 支持 base_dir / memory / thread path 统一解析
- 把“运行环境差异”尽量收敛在配置层

优点：

- 扩展性好
- 配置项比较完整

短板：

- 运行目录差异会影响配置解析和 `.env` 行为
- 对多环境部署的约束还不够强

### 4.2 Lead Agent 模块

关键文件：

- [agent.py](/Users/ankouyang/project/deer-flow/backend/packages/harness/deerflow/agents/lead_agent/agent.py)

设计意图：

- 用一个主 Agent 统一入口承接大多数任务
- 通过中间件和工具系统避免主逻辑膨胀
- 让模型、模式、工具、子代理都变成可运行时切换的能力

优点：

- 扩展点集中
- 便于做平台型二开

短板：

- 中间件顺序依赖强
- 出问题时需要很强的运行时观测能力

### 4.3 Middleware 模块

设计意图：

- 把横切能力从主 Agent 中拆出去
- 保证 thread、memory、todo、title、sandbox 等能力可以独立演进

优点：

- 高内聚低耦合
- 易于插拔新能力

短板：

- 链路长
- 对顺序和状态一致性敏感

### 4.4 Tool / Sandbox / MCP 模块

设计意图：

- 让 Agent 具备“执行”而不是只会“回答”
- 工具负责动作，技能负责流程模板
- MCP 负责标准化外部系统接入

优点：

- 扩展生态非常强
- 二开空间大

短板：

- 权限控制、审计和资源限制需要额外补强

### 4.5 Memory 模块

关键文件：

- [memory_config.py](/Users/ankouyang/project/deer-flow/backend/packages/harness/deerflow/config/memory_config.py)
- [updater.py](/Users/ankouyang/project/deer-flow/backend/packages/harness/deerflow/agents/memory/updater.py)

设计意图：

- 把 thread 里的长期信息提炼为跨 session 可复用的记忆
- 形成 personalization 和连续性

优点：

- 提升跨会话体验
- 信息结构化程度较高

短板：

- 当前默认是全局 memory，共享粒度较粗
- 多用户/多租户场景需要 namespace 化

### 4.6 Thread / Checkpointer / Artifact 模块

设计意图：

- Thread State 保证消息级可恢复
- Thread FS 保证文件级可恢复
- Artifact 保证结果可回放、可导出

优点：

- Agent 工作流闭环完整
- 非常适合做“工作台型产品”

短板：

- 多进程、多实例、生产环境下需要更强的一致性治理

## 5. 架构优劣判断

### 优点

- 分层边界清晰
- Agent 扩展点丰富
- 中间件化设计合理
- 前后端职责明确
- 很适合做 Agent 平台和工作台二开

### 当前主要短板

- 本地运行链路对进程/端口治理依赖高
- 配置和环境变量容错不够强
- Memory 仍偏单实例全局共享
- 可观测性不足，定位问题主要靠日志
- Frontend 开发模式下对代理、origin、地址配置较敏感

## 6. 适合怎样的二开方向

当前 DeerFlow 最适合的二开方向：

- 企业内部 Agent 平台
- 多技能编排工作台
- Research / Analysis / Automation 助手平台
- 带 artifact 输出的任务型 Copilot
- 多渠道智能体接入平台

不太适合直接拿来就做：

- 极简聊天机器人
- 强事务型业务系统主核心
- 高并发强 SLA 的大规模生产平台（需要先补治理层）
