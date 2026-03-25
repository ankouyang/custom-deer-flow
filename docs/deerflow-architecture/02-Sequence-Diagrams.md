# DeerFlow 完整流程闭环时序图

## 1. 说明

这一篇不是只列局部流程，而是从“服务启动 -> 页面初始化 -> 模型加载 -> 消息提交 -> Agent 运行 -> 工具/文件/子代理 -> 记忆沉淀 -> 结果展示 -> 下次会话复用”的完整闭环来描述 DeerFlow 当前项目。

系统中的关键参与者：

- 用户 / 浏览器
- Next.js Frontend
- Nginx 统一入口
- Gateway API
- LangGraph Runtime
- Lead Agent
- Middleware Chain
- Tools / Sandbox / MCP / Subagents
- Thread 文件系统
- Checkpointer
- Memory Queue / memory.json

## 2. 项目完整闭环主时序图

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant NX as Nginx :2026
    participant GW as Gateway :8001
    participant LG as LangGraph :2024
    participant AG as Lead Agent
    participant MW as Middleware Chain
    participant TO as Tools / MCP / Subagents
    participant FS as Thread FS
    participant CP as Checkpointer
    participant MEM as Memory Queue / memory.json

    Note over FE,NX: 一、系统启动后，浏览器统一通过 2026 入口访问

    U->>FE: 打开工作台 / 新建或进入 thread
    FE->>NX: GET 页面资源
    NX->>FE: 代理到 Next.js
    FE-->>U: 返回工作台页面

    Note over FE,GW: 二、页面初始化阶段

    FE->>NX: GET /api/models
    NX->>GW: 转发模型列表请求
    GW->>GW: 读取 config.yaml + model config
    GW-->>NX: 返回 models
    NX-->>FE: 返回 models
    FE-->>U: 渲染输入框、模式、模型信息

    alt 用户上传文件
        U->>FE: 选择文件
        FE->>NX: POST /api/threads/{id}/uploads
        NX->>GW: 转发上传
        GW->>FS: 保存 uploads
        GW->>GW: 文档转 Markdown / 标准化
        GW-->>FE: 返回上传结果
        FE-->>U: 展示上传文件状态
    end

    Note over FE,LG: 三、用户发起一轮对话

    U->>FE: 输入消息 / 选择模型 / 点击发送
    FE->>LG: 创建或复用 LangGraph thread stream
    LG->>CP: 读取 thread checkpoint
    CP-->>LG: 返回最近状态
    LG->>AG: 启动本轮 run

    Note over AG,MW: 四、Agent 进入中间件链

    AG->>MW: 构建运行时上下文
    MW->>FS: 初始化或读取 thread 目录(workspace/uploads/outputs)
    MW->>FS: 注入上传文件上下文
    MW->>MEM: 当前会话写入 memory update queue
    MW->>AG: 注入 title/todo/image/memory/sandbox 等上下文

    Note over AG,TO: 五、Agent 推理与执行

    AG->>AG: 选择模型 / mode / reasoning
    AG->>TO: 调用工具、MCP、Sandbox、Subagents
    TO->>FS: 读写 workspace / uploads / outputs
    TO-->>AG: 返回执行结果
    AG->>CP: 写入新的状态 checkpoint

    Note over LG,FE: 六、流式返回到前端

    AG-->>LG: 输出 messages / values / events
    LG-->>NX: 流式返回 SSE/stream
    NX-->>FE: 转发流式事件
    FE-->>U: 实时展示消息、todo、工具进度、标题、artifact 触发

    Note over MEM,FS: 七、会话后处理与长期沉淀

    MEM->>MEM: debounce 聚合更新
    MEM->>FS: 更新 backend/.deer-flow/memory.json

    alt 本轮产出了 artifact
        FE->>NX: GET /api/threads/{id}/artifacts/{path}
        NX->>GW: 转发 artifact 请求
        GW->>FS: 读取 outputs / artifacts
        GW-->>FE: 返回 artifact
        FE-->>U: 展示 / 下载 artifact
    end

    Note over AG,MEM: 八、下一轮会话复用长期记忆

    U->>FE: 下一次打开其他 thread/session
    FE->>LG: 发起新的 run
    LG->>AG: 创建新一轮 Agent
    AG->>MEM: 读取 memory.json
    MEM-->>AG: 注入 user/history/facts
    AG-->>U: 体现跨 session 连续性
```

## 3. 服务启动闭环时序图

```mermaid
sequenceDiagram
    participant OP as Operator
    participant SH as start-all.sh
    participant ST as service-utils.sh
    participant LG as LangGraph
    participant GW as Gateway
    participant FE as Frontend
    participant NX as Nginx

    OP->>SH: ./scripts/start-all.sh
    SH->>ST: 预清理旧进程与旧端口
    ST->>ST: 清理 2024/8001/3000/2026 监听
    SH->>LG: 启动 LangGraph
    SH->>GW: 启动 Gateway
    SH->>FE: 启动 Next.js
    SH->>NX: 启动 Nginx
    SH-->>OP: 返回统一入口 localhost:2026
```

## 4. 页面初始化闭环时序图

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend Page
    participant TH as useThreadStream
    participant GW as Gateway
    participant LG as LangGraph

    U->>FE: 打开 /workspace/chats/new 或 /workspace/chats/{id}
    FE->>GW: 拉取 /api/models
    GW-->>FE: 返回模型列表
    alt 已有 thread
        FE->>TH: 初始化 stream hook
        TH->>LG: reconnectOnMount + fetchStateHistory
        LG-->>TH: 返回最近状态
        TH-->>FE: 恢复 messages / values / todos / title
    else 新 thread
        FE-->>U: 渲染欢迎态和输入框
    end
```

## 5. 单轮对话主链路时序图

```mermaid
sequenceDiagram
    participant U as User
    participant FE as InputBox
    participant TH as Thread Hook
    participant LG as LangGraph
    participant AG as Lead Agent
    participant MW as Middlewares
    participant TO as Tools

    U->>FE: 输入消息并发送
    FE->>TH: sendMessage()
    TH->>TH: optimistic UI
    TH->>LG: submit thread input
    LG->>AG: create/run lead_agent
    AG->>MW: 中间件增强上下文
    AG->>TO: 需要时调用工具
    TO-->>AG: 返回结果
    AG-->>LG: 输出消息与状态
    LG-->>TH: stream events
    TH-->>FE: 更新 thread state
    FE-->>U: 展示最终结果
```

## 6. 上传、工作区与产物闭环时序图

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant GW as Gateway
    participant FS as Thread FS
    participant AG as Agent

    U->>FE: 上传文件
    FE->>GW: /api/threads/{id}/uploads
    GW->>FS: 保存到 uploads
    GW-->>FE: 返回 UploadedFileInfo

    FE->>AG: 发消息并带上上传上下文
    AG->>FS: 读取 uploads
    AG->>FS: 在 workspace 中处理文件
    AG->>FS: 将结果写入 outputs

    FE->>GW: 请求 artifact
    GW->>FS: 读取 outputs 文件
    GW-->>FE: 返回 artifact 内容
    FE-->>U: 预览/下载结果
```

## 7. 记忆闭环时序图

```mermaid
sequenceDiagram
    participant AG as Lead Agent
    participant MM as MemoryMiddleware
    participant MQ as Memory Queue
    participant MU as Memory Updater
    participant MF as memory.json
    participant AG2 as Future Session Agent

    AG->>MM: 当前 run 完成
    MM->>MQ: 排队待处理会话
    MQ->>MU: debounce 后执行提炼
    MU->>MF: 更新 user/history/facts

    AG2->>MF: 读取长期记忆
    MF-->>AG2: 注入 memory context
    AG2-->>User: 在新 session 中体现记忆连续性
```

## 8. 子代理闭环时序图

```mermaid
sequenceDiagram
    participant AG as Lead Agent
    participant TT as task() Tool
    participant EX as Subagent Executor
    participant SA as Subagent
    participant TL as Tool Layer

    AG->>TT: 发起 task()
    TT->>EX: 提交子任务
    EX->>SA: 创建子代理运行
    SA->>TL: 工具调用 / bash / 文件操作
    TL-->>SA: 执行结果
    SA-->>EX: 汇总结果
    EX-->>AG: 子代理输出
```

## 9. 状态持久化闭环

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant LG as LangGraph
    participant CP as Checkpointer
    participant FS as Thread Storage

    FE->>LG: 提交 thread run
    LG->>CP: 读取旧 checkpoint
    CP-->>LG: 返回历史状态
    LG->>FS: 读取 thread 文件目录
    FS-->>LG: 返回 workspace/uploads/outputs 信息
    LG-->>FE: 运行结束后写入新状态
    LG->>CP: 写入新 checkpoint
    LG->>FS: 保留 thread 目录与输出
```

## 10. 关闭服务闭环

```mermaid
sequenceDiagram
    participant OP as Operator
    participant SH as stop-all.sh
    participant ST as service-utils.sh
    participant OS as Local Processes

    OP->>SH: ./scripts/stop-all.sh
    SH->>ST: stop_deerflow_services()
    ST->>OS: kill langgraph / gateway / frontend / nginx
    ST->>OS: 按端口清理 2024/8001/3000/2026
    ST-->>OP: 服务全部停止
```

## 11. 当前闭环中的关键设计判断

### 11.1 DeerFlow 不是单链路系统，而是多闭环平台

至少包含：

- 页面初始化闭环
- 单轮对话闭环
- 文件处理闭环
- 长期记忆闭环
- 状态持久化闭环

### 11.2 Gateway 与 LangGraph 的职责是刻意分开的

- Gateway 管配置、资源和辅助接口
- LangGraph 管真正的 Agent 运行时

这意味着二开时不要轻易把两层揉在一起。

### 11.3 真正最脆弱的是“运行治理层”

从这次排查来看，最容易出问题的不是业务逻辑，而是：

1. 旧进程残留
2. 端口占用
3. 配置加载路径
4. 前端同源地址策略
5. Nginx 到后端的代理行为

因此 DeerFlow 二开的第一优先级，不应该是继续加功能，而应该是把运行闭环治理完整。
