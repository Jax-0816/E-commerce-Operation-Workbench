# 可恢复持久化工作流设计

## 目标

为本地电商运营工作台增加 SQLite 持久化的单进程 DAG 工作流，使用户能够预检、启动、观察、取消、重试和显式恢复完整内容生产流程。服务进程异常退出后不得自动消耗 AI 额度；恢复时必须复用依赖未变化的已完成节点，只执行失败、被中断、过期或尚未开始的节点。

## 范围

Task 24 交付以下能力：

- 工作流定义、DAG 校验、稳定拓扑顺序和节点状态机。
- SQLite 工作流 run、节点、执行尝试和事件日志。
- 基于 `(workflowRunId, nodeKey, dependencyHash)` 的幂等复用。
- 单进程异步 runner、乐观并发控制、取消、失败、重试和重启恢复。
- 工作流状态 HTTP API、持久事件 SSE 和断线重连语义。
- 商品工作台中的进度、失败、恢复和取消界面。
- fake handler 和真实 SQLite 自动化测试；不调用付费 AI。

Task 24 不交付外部任务队列、多进程调度、跨设备同步、定时任务、自动后台恢复或 Task 25 的运营方案聚合。

## 标准工作流

v0.1 内置一个稳定定义 `product-content-v1`：

1. `competitor_analysis`
2. `market_insight`
3. `selling_points`
4. `titles`
5. `creative`
6. `detail_page`

节点按上述稳定顺序执行。每个节点显式声明依赖；前四个节点形成内容策略链，`creative` 与 `detail_page` 都依赖 `titles`。单进程 runner 每次只领取一个可运行节点，因此标准失败夹具能确定性地在前四个节点完成后让 `creative` 失败，且当次执行不会越过失败继续运行 `detail_page`。

工作流定义是代码中的版本化惰性数据，不允许用户提供可执行代码。定义包括 `definitionId`、`version`、节点 key、任务类型、依赖 key 和稳定显示顺序。重复 key、未知依赖、自依赖、循环、空定义及超过 50 个节点的定义全部拒绝。

## 状态模型

工作流 run 状态为：

- `not_started`：已创建但尚未执行。
- `running`：runner 正在领取和执行节点。
- `completed`：所有节点均达到可复用终态。
- `failed`：某节点执行失败，等待用户操作。
- `interrupted`：进程重启时发现未完成的运行中工作。
- `cancelled`：用户取消，不再自动调度节点。

节点状态为：

- `not_started`
- `running`
- `completed`
- `failed`
- `stale`
- `locked`
- `needs_review`
- `cancelled`

`completed`、`locked` 和 `needs_review` 都表示节点产生了可引用结果。`locked` 结果永不被工作流覆盖；`needs_review` 可以供后续节点引用，但整个 run 的最终摘要必须保留审核提示。依赖哈希变化时，未锁定的成功节点变为 `stale`；锁定节点保持 `locked` 并记录 stale 原因，等待用户在资产工作台处理。

每次状态变化都递增 run revision。修改 API 必须携带 `expectedRevision`；不匹配返回 `CONFLICT`，确保重复点击、多个标签页或迟到请求不会覆盖较新的状态。

## 执行与幂等

`WorkflowRunner` 依赖以任务类型为 key 的 handler 注册表。handler 接口分为两个阶段：

```ts
interface WorkflowNodeHandler {
  inspect(input: WorkflowNodeInput): Promise<{
    dependencyHash: string;
    reusableOutput?: WorkflowNodeOutputReference;
  }>;
  execute(input: WorkflowNodeInput): Promise<WorkflowNodeResult>;
}
```

`inspect` 不产生 AI 调用，只计算当前依赖哈希并检查是否已有可复用输出。`execute` 调用现有应用用例并返回精确的资产 ID、revision、审核状态和锁定状态。

runner 在调用 handler 前先以事务把节点从可运行状态改为 `running`，创建 attempt，并追加事件。handler 成功后以同一 expected revision 保存输出引用、依赖哈希、终态和完成事件；失败时只保存经过安全映射的错误码与用户可读消息，不持久化上游响应、密钥或堆栈。

幂等身份为 `(workflowRunId, nodeKey, dependencyHash)`。同一 run 中已经成功且依赖哈希未变化的节点直接复用，不能再次调用 `execute`。显式重试只允许 `failed` 节点；显式恢复处理 `interrupted`、`failed`、`stale` 和 `not_started` 节点，同时跳过所有可复用成功节点。

取消是节点边界上的协作取消：API 立即把 run 标记为取消已请求；runner 在下一次持久化边界停止领取节点。若 handler 支持 `AbortSignal`，当前执行也会收到取消信号，但 v0.1 不承诺第三方模型已接收请求后的费用可撤销。

## 持久化模型

新增迁移 `0014_add-workflows.sql`，包含四个 STRICT 表：

- `workflow_runs`：商品、平台、定义版本、状态、revision、取消标志、创建/更新时间。
- `workflow_nodes`：run + node key 唯一，保存状态、顺序、dependency hash、精确输出引用、stale 原因和安全错误。
- `workflow_attempts`：每次真实执行的追加式审计记录，保存 attempt 序号、开始/结束时间和结果状态。
- `workflow_events`：每个 run 单调递增 sequence 的追加式事件，保存事件类型、run revision、node key、时间和安全 payload。

工作流定义快照随 run 保存，保证未来代码中的定义升级不会改变历史 run。节点输出只保存结构化引用，不复制或改写内容资产。attempt 和 event 使用 trigger 禁止更新、删除；run/node 只允许仓储事务中的合法状态迁移。仓储读取时校验定义快照、状态组合、revision、事件序号和输出引用结构，异常数据 fail closed。

启动生产组合根时执行一次恢复事务：所有 `running` run 改为 `interrupted`，对应 `running` 节点改为 `failed`，错误码固定为 `WORKFLOW_INTERRUPTED`，并追加 `workflow_interrupted` 事件。用户执行 resume 后，该节点才重新进入调度。恢复事务不调用 handler，也不启动 runner。

## API 与 SSE

新增以下严格接口：

- `POST /api/v1/products/:productId/workflows/preflight`
- `POST /api/v1/products/:productId/workflows`
- `GET /api/v1/products/:productId/workflows`
- `GET /api/v1/workflows/:workflowRunId`
- `POST /api/v1/workflows/:workflowRunId/resume`
- `POST /api/v1/workflows/:workflowRunId/nodes/:nodeKey/retry`
- `POST /api/v1/workflows/:workflowRunId/cancel`
- `GET /api/v1/workflows/:workflowRunId/events`

preflight 返回各节点是否可运行、缺失前置条件、当前依赖哈希和可复用资产，但不创建 run、不执行 AI。start 创建持久 run 后由本进程 runner 异步执行。resume、retry 和 cancel 请求体都必须包含 `expectedRevision`。

SSE 响应使用 `text/event-stream`、禁用缓存，并为每条事件设置持久 `id`、明确 `event` 类型和 JSON `data`。客户端首次连接或重连时先 GET 当前状态，再用最后已见 sequence 订阅后续事件；服务端先补发数据库中更大的 sequence，再注册进程内通知。事件表是事实来源，进程内发布器只用于降低延迟，因此事件不会因订阅时序而丢失。

不存在或跨商品的 run 返回 `NOT_FOUND`；非法状态迁移和 revision 冲突返回 `CONFLICT`；未知定义、平台或缺少 handler 返回 `CAPABILITY_UNAVAILABLE`；请求结构错误返回 `VALIDATION_ERROR`。

## 前端体验

商品工作台新增“生成工作流”进度面板，展示定义版本、run revision、总体状态和六个节点。每个节点显示状态、依赖变化、精确输出 revision、审核提示或安全错误。

用户可以：

- 在预检通过后启动工作流。
- 对失败节点执行重试。
- 对 interrupted/failed run 显式恢复。
- 取消运行中工作流。
- 页面重新打开或 SSE 断线后通过 GET 状态恢复界面，再继续订阅。

前端不因路由切换、平台切换或 SSE 重连自动启动、恢复或重试工作流。按钮在请求期间禁用，并以 run ID + revision 防止旧响应覆盖新状态。无障碍状态使用文本与 `aria-live`，不只依赖颜色。

## 测试与验收

纯引擎测试覆盖：

- DAG 稳定拓扑、未知依赖、循环和规模预算。
- 合法/非法状态迁移、取消和 terminal 判断。
- 依赖哈希未变时幂等复用，变化时 stale。

真实 SQLite 集成测试覆盖：

- run/node/attempt/event 原子写入和 revision CAS。
- attempt/event 不可变、事件 sequence 单调且重启后可读取。
- 启动恢复只标记 interrupted，不调用任何 handler。
- canonical failure：四个节点完成、`creative` 失败、关闭并重建生产运行时；用户 resume 后前四个 handler 调用增量均为零，只执行 `creative` 和其后尚未开始的 `detail_page`。
- 重复 resume、并发 runner 和重复 retry 不产生重复 attempt。

合同和服务端测试覆盖严格请求、错误映射、普通状态 GET、SSE 补发、实时事件、取消和断线重连。React 测试覆盖进度、失败、审核、恢复、重试、取消和过期响应保护。现有全仓测试、类型检查、lint、生产构建、提示词/规则包校验、冻结安装和 Playwright 黄金路径必须继续通过。

## 关键决策

- 使用单进程 runner + SQLite 事件日志，不引入外部队列。
- 使用稳定串行领取保证失败边界、日志和费用行为可预测；DAG 仍保留未来安全并行化空间。
- 重启只标记 interrupted，永不自动继续付费操作。
- SSE 是持久事件日志的实时投影，GET 状态始终是重连校准入口。
- 成功节点以依赖哈希和精确输出引用复用；锁定资产永不被工作流覆盖。
- Task 24 只编排既有能力，Task 25 再聚合最终运营方案。
