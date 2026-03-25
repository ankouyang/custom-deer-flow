# DeerFlow 二开知识、技能与完整方案

## 1. 二开目标定义

基于当前 DeerFlow 二开，不建议把它当成“普通聊天项目”去改。更合理的思路是把它视为一个 Agent 平台底座，然后按业务目标扩展：

- 做一个企业内多智能体工作台
- 做一个带技能编排的任务型助手
- 做一个带 artifact 输出的业务 Copilot
- 做一个支持多渠道接入的智能体平台

## 2. 需要掌握的知识领域

### 2.1 Agent 编排与运行时知识

必须掌握：

- LangGraph 基本运行机制
- LangChain Agent 和 Tool 调用方式
- 流式消息、事件流、checkpoint
- Prompt template / Skill injection
- Middleware 设计模式

原因：
不掌握这一层，就只能改前端展示，改不了系统核心能力。

### 2.2 Python 后端工程

必须掌握：

- FastAPI
- Pydantic
- asyncio
- 文件系统与 subprocess
- 配置系统设计
- 日志与服务生命周期

原因：
Gateway、Memory、Tools、Sandbox、Channels 全部在 Python 侧。

### 2.3 前端工作台开发

必须掌握：

- Next.js App Router
- React 19
- React Query
- 流式状态管理
- WebSocket / SSE / SDK 驱动的 UI 更新

原因：
DeerFlow 前端是“工作台”，不是简单的聊天框。

### 2.4 模型接入与 AI Provider 适配

必须掌握：

- OpenAI-compatible API 差异
- `/chat/completions` vs `/responses`
- vision / thinking / reasoning_effort 等能力矩阵
- 模型可用性探测和失败兜底

原因：
当前项目已经存在 provider 差异和接口模式差异。

### 2.5 工具生态与系统接入

必须掌握：

- MCP 协议
- Sandbox 执行边界
- 外部系统 API 集成
- Artifact 管道
- Upload/Output/Workspace 的文件生命周期

原因：
这是 DeerFlow 的平台差异化核心。

### 2.6 平台治理与运维

必须掌握：

- 进程与端口治理
- 环境配置治理
- 代理层与统一入口
- 持久化与隔离
- 健康检查、日志、故障排查

原因：
当前项目的主要实际风险不是功能不够，而是运行链路容易脆弱。

## 3. 需要的技能矩阵

### 最小团队配置

#### 角色 A：Agent 平台工程师

负责：

- Lead Agent
- Middleware
- Tools / MCP / Sandbox
- Memory / Checkpointer
- Provider 接入

#### 角色 B：前端工作台工程师

负责：

- 聊天工作台
- artifact / todo / settings / models
- 流式 UI 状态
- 多端访问体验

#### 角色 C：平台架构/基础设施工程师

负责：

- 统一配置
- 脚本与进程治理
- 代理层
- 发布方式
- 可观测性

#### 角色 D：AI 应用工程师

负责：

- skills 设计
- prompt 策略
- 业务工具编排
- 评测与提示词优化

### 单人/双人开发时的优先级

1. 运行稳定性
2. 配置治理
3. 业务工具接入
4. Memory 隔离
5. 前端增强
6. 平台化

## 4. 推荐二开方案

## 阶段一：稳定化与底座治理

目标：
把当前“能跑”升级为“可稳定迭代”。

建议改造：

- 统一启动/停服/状态脚本
- 统一 `.env` 和 `config.yaml` 解析行为
- 增加 provider 探测与模型健康检查
- 增加端口冲突清理与健康检查
- 给 Gateway / LangGraph 增加 request id 贯穿日志
- 补一层聚合健康接口

交付物：

- `start-all.sh / stop-all.sh / status-all.sh`
- `health/full` 接口
- 配置自检脚本
- 模型探测脚本
- 运行故障排查文档

## 阶段二：业务能力抽象

目标：
让 DeerFlow 真正变成业务底座，而不是 demo harness。

建议改造：

- 定义业务 agent registry
- 把 skills 分层为 public / custom / tenant
- 把 tools 分层为 core / business / integration
- 为 memory 增加 user/tenant/agent namespace
- 为 artifacts 增加业务元数据
- 前端增加运行面板、配置面板、工具日志面板

交付物：

- Agent 扩展规范
- Tool Plugin 规范
- Skill 管理规范
- Memory namespace 设计
- Artifact 元数据协议

## 阶段三：企业级平台化

目标：
支持真实组织环境中的多用户、多租户、多系统接入。

建议改造：

- 用户体系与认证授权
- 多租户隔离
- 配额限制与成本控制
- Prompt / Skill / Tool 版本管理
- 操作审计与合规留痕
- 模型路由和策略层

交付物：

- 用户与组织模型
- RBAC 权限模型
- Tenant 隔离存储方案
- 成本与配额系统
- 审计日志与追踪系统

## 阶段四：开发者平台与生态

目标：
把 DeerFlow 从项目变成平台。

建议改造：

- Skill Marketplace
- Tool SDK / Agent SDK
- 可视化编排
- 事件总线 / Webhook
- 统一观测平台

交付物：

- SDK 文档
- 扩展模板仓库
- 编排可视化方案
- 平台运维控制台

## 5. 推荐技术方案拆解

### 5.1 架构治理方案

- 保持当前 Frontend / Gateway / LangGraph 三层边界不动
- 不建议把 Gateway 和 LangGraph 强行合并
- 应新增“平台治理层”，而不是重写 Harness 内核

建议新增模块：

- `platform/health`
- `platform/provider_probe`
- `platform/tenant`
- `platform/audit`
- `platform/cost`

### 5.2 Memory 隔离方案

当前问题：

- `memory.json` 是全局共享
- 不适合多用户/多租户

建议演进：

1. 先从全局 memory 升级为 user memory
2. 再从 user memory 升级为 tenant + user 双层
3. 再支持 agent-level memory 作为补充

建议路径结构：

```text
.deer-flow/
  memory/
    global.json
    users/{user_id}.json
    tenants/{tenant_id}/users/{user_id}.json
    agents/{agent_name}/memory.json
```

### 5.3 Tool / Skill 二开方案

建议原则：

- Tool 只负责执行动作
- Skill 只负责描述 workflow
- 业务逻辑优先写成 Tool，再通过 Skill 组织

不要把复杂业务逻辑硬塞进 prompt。

### 5.4 前端二开方案

建议保留当前工作台骨架，但补 4 个面板：

- 运行状态面板：模型、模式、thread、latency、tokens
- 工具日志面板：每次 tool call 的输入输出
- Artifact 面板：结构化预览
- 配置面板：模型/技能/agent/mcp 动态切换

## 6. 推荐实施顺序

### 第一批必须先做

1. 启停稳定化
2. 配置治理
3. Gateway / LangGraph 健康检查
4. 模型 provider 探测
5. 前端同源与地址策略收口

### 第二批再做

1. business tools
2. skill 扩展
3. artifact 增强
4. memory 隔离

### 第三批平台化

1. auth
2. tenant
3. audit
4. cost
5. observability

## 7. 风险清单

### 架构风险

- Gateway 与 LangGraph 进程脏状态导致伪成功
- 配置路径/环境变量差异导致线上线下行为不一致
- Memory 污染导致跨会话误注入
- Tool 权限边界不清导致安全风险

### 工程风险

- 只改 UI 不改 runtime，产品能力无法闭环
- 只改 prompt 不改 tool，业务能力不可控
- 只做 demo 不补治理，系统稳定性会持续拖后腿

## 8. 最终建议

对于当前 DeerFlow，最合理的二开策略不是“重写”，而是“保留 Harness 核心 + 加一层平台治理 + 加一层业务扩展”。

推荐原则：

1. 不动主运行时边界
2. 强化配置、健康检查、进程治理
3. 把业务能力写成 Tool / Skill / Agent 扩展
4. 把多用户、多租户、审计、成本等平台能力外置

这样可以最大化复用 DeerFlow 现有架构优势，同时把它从一个强 demo 项目，逐步提升为可持续演进的平台底座。
