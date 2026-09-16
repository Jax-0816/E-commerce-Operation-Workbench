# Progress Log

## Session: 2026-08-31 — 建立长期完成计划

### Planning baseline

- **Status:** complete
- Actions taken:
  - 对照设计规格、原始实施计划、提交历史、现有模块和页面状态核验进度。
  - 确认 Task 1–11 已完成，Task 12–29 为后续主线。
  - 创建完整 master plan，并建立 task/findings/progress 持久执行文件。
  - 把工具链差异、测试运行注意事项和旧文档滞后写入长期记录。
  - 完成 Task 12–29 编号覆盖、规格主题覆盖、占位符扫描和 `git diff --check` 自检；未发现遗漏或格式错误。
- Files created/modified:
  - `docs/superpowers/plans/2026-08-31-workbench-completion-master-plan.md`（created）
  - `task_plan.md`（created）
  - `findings.md`（created）
  - `progress.md`（created）

## Test Results

| Test                            | Input                              | Expected                   | Actual                                                      | Status  |
| ------------------------------- | ---------------------------------- | -------------------------- | ----------------------------------------------------------- | ------- |
| Web + calculation focused tests | Vitest, source paths               | Pass                       | 14 files / 38 tests passed                                  | ✓       |
| Database workspace tests        | Vitest from `packages/database`    | Pass                       | 5 files / 20 tests passed                                   | ✓       |
| Workspace tests                 | Vitest from `packages/workspace`   | Pass                       | 3 files / 52 tests passed                                   | ✓       |
| Domain tests                    | Vitest from `packages/domain`      | Pass                       | 8 files / 28 tests passed                                   | ✓       |
| Application tests               | Vitest from `packages/application` | Pass                       | 4 files / 10 tests passed                                   | ✓       |
| Server tests                    | Vitest from `apps/server`          | Pass                       | 9 files / 19 tests passed                                   | ✓       |
| API health                      | `GET /api/v1/health`               | status ok                  | `{status:"ok", appVersion:"0.1.0"}`                         | ✓       |
| Web smoke                       | `GET http://127.0.0.1:5173/`       | HTTP 200                   | HTTP 200                                                    | ✓       |
| Full root quality gate          | root `pnpm test`                   | Run under pinned toolchain | blocked by Node/pnpm mismatch before authoritative test run | blocked |

## Error Log

| Timestamp  | Error                                                                              | Attempt | Resolution                                                                         |
| ---------- | ---------------------------------------------------------------------------------- | ------: | ---------------------------------------------------------------------------------- |
| 2026-08-31 | graphify current-progress query returned no matching nodes                         |       1 | Used code, commits and test evidence instead                                       |
| 2026-08-31 | root `pnpm test` attempted dependency preparation with unsupported local toolchain |       1 | Avoided dependency mutation; recorded environment prerequisite                     |
| 2026-08-31 | root-level raw Vitest produced cwd/dist false failures                             |       1 | Re-ran key workspaces from correct directories; all passed                         |
| 2026-08-31 | 精确 Node 可运行，但版本检查脚本在 PATH 中找不到临时 pnpm                          |       1 | 在 `/private/tmp/eaw-toolchain-bin` 创建仅本次任务使用的 pnpm wrapper              |
| 2026-08-31 | 锁文件供应链校验在沙箱内 DNS 失败                                                  |       1 | 使用获批网络完成 `pnpm install --lockfile-only`                                    |
| 2026-08-31 | `pnpm install --offline` 缺少供应链元数据并中止重建                                |       1 | 改用联网 `pnpm install --frozen-lockfile`，依赖目录恢复完成                        |
| 2026-08-31 | 单个 apply_patch 同时删除并新增同一路径被拒绝                                      |       1 | 分成删除与新增两个 apply_patch 调用，未丢失内容                                    |
| 2026-08-31 | 更新长期记录时补丁上下文定位错误                                                   |       1 | 重新读取文件并按实际段落位置更新                                                   |
| 2026-08-31 | calculation-engine typecheck 报 3 处 `unknown` 传入 `Set<string>.has`              |       1 | 根因是 Record 属性窄化未跨别名保留；在验证函数入口将 `node.type` 收窄为局部 string |
| 2026-08-31 | 新增公式文件未满足 Prettier 格式检查                                               |       1 | 对 4 个公式实现文件运行仓库 Prettier，随后根级 `format:check` 通过                 |
| 2026-08-31 | 一次聚焦测试误用了系统 pnpm 11.19.0，触发依赖状态检查                              |       1 | 未允许其修改依赖；立即改用临时精确 Node 24.19.0 / pnpm 11.22.0 工具链              |
| 2026-08-31 | GitHub HTTPS 推送两次收到空响应，随后 443 连接超时                                 |       2 | IPv4 探测成功；使用单次 `http.curloptResolve` 定向后成功推送，不改系统设置         |
| 2026-08-31 | GitHub SSH 连接可达但无可用公钥，`gh` 旧令牌失效                                   |       1 | 未创建新凭据；改用已有 Git credential + IPv4 HTTPS 完成推送                        |
| 2026-08-31 | 新增 pricing-engine 后冻结锁文件因缺少 workspace importer 拒绝安装                 |       1 | 先离线更新 lockfile-only，再恢复冻结安装                                           |
| 2026-08-31 | 离线冻结安装缺少供应链元数据并中止                                                 |       1 | 使用获批网络从本地内容仓恢复 299 个锁定包，未改变版本                              |
| 2026-08-31 | pricing-engine 测试 helper 返回宽泛联合导致 2 处 TS2322                            |       1 | 将 helper 返回类型收窄为 `AmountCostItem`，实现代码无需修改                        |
| 2026-08-31 | Prettier 无法推断 SQL parser                                                       |       1 | 不用 Prettier 改写迁移；以真实 SQLite 迁移测试和 `git diff --check` 验证           |
| 2026-08-31 | application 测试中的过期修订用例缺少 `now` 字段                                    |       1 | 修正测试输入后确认领域实现通过                                                     |
| 2026-08-31 | server 首轮 GREEN 暴露 fake 未保存状态及 prepare-internal 预期过期                 |       1 | 修正有状态 fake，并把 calculation/pricing engine 加入依赖顺序契约                  |

## Next Action

1. 读取 Task 13 范围和现有领域/数据库/API/UI 模式。
2. 按 TDD 建立成本档案与定价实验室的纯计算核心。
3. 完成 Task 13 垂直切片、门禁、审查和独立提交。

## 5-Question Reboot Check

| Question             | Answer                                                |
| -------------------- | ----------------------------------------------------- |
| Where am I?          | Wave 1 / Task 12 已完成，下一项是 Task 13             |
| Where am I going?    | 完成 master plan 的 Task 12–29                        |
| What's the goal?     | 交付完整、可追踪、可恢复的本地电商 AI 运营工作台 v0.1 |
| What have I learned? | 见 `findings.md`                                      |
| What have I done?    | 已完成进度核验和长期计划落盘                          |

## Session: 2026-08-31 — Wave 1 / Task 12

### Safe formula AST and dependency DAG

- **Status:** complete
- Actions taken:
  - 读取并审阅 master plan、task plan、findings 和历史进度。
  - 确认当前目录是分支 `codex/phase-0` 的独立 linked worktree。
  - 确认仓库没有 `.codegraph/`，按仓库规则跳过 CodeGraph。
  - 发现当前系统工具链为 Node 26.4.0 / pnpm 11.19.0；准备在临时目录恢复锁定版本，不修改系统配置。
  - 使用 Node 24.19.0 / pnpm 11.22.0 完成冻结安装和权威基线 `pnpm test`；现有测试全部通过。
  - 完成 schema 两轮 RED→GREEN：严格白名单、精确字面量、额外字段拒绝、深度 32 与节点 256 限制，14 项测试通过。
  - 完成 evaluator 两轮 RED→GREEN：精确算术、min/max、局部舍入、六种比较、条件短路、零除/负值/未知变量/币种错误，16 项测试通过。
  - 完成 DAG RED→GREEN：稳定拓扑排序、外部变量忽略、重复/非法键、定义数上限和完整循环路径，7 项测试通过。
  - 增加包根导出测试并完成公式模块公开导出。
  - 独立审查识别出 schema 未净化行为属性、BigInt 输入无界和 DFS 拓扑不稳定三个 Important 问题；逐项补 RED 回归测试后修复，并通过同一审查者复核。
  - schema 最终采用安全迭代预检 + strict recursive Zod 判别联合，返回脱离输入的纯数据副本；输入整数上限 128 位，中间精确值预算 4096 位。
  - DAG 最终采用按原始索引优先的 Kahn 排序，并在失败时用 DFS 提取完整循环路径。
  - 补充确定性性质测试，覆盖等价有理数和生成式 DAG 的依赖先行不变量；calculation-engine 共 10 个测试文件、63 项测试通过。
  - 通过 calculation-engine 的 test/typecheck/lint/build 聚焦门禁。
  - 通过根级 `format:check`、`typecheck`、`lint`、`test` 和 `build`；根级测试共 244 项通过。
- Files created/modified:
  - `task_plan.md`（Task 12 标记为 in_progress）
  - `progress.md`（新增本次执行记录）
  - `packages/calculation-engine/src/formula/*`（新增 AST、schema、evaluator、DAG、导出与测试）
  - `packages/calculation-engine/src/index.ts`（公开公式模块）
  - `packages/calculation-engine/package.json`、`pnpm-lock.yaml`（加入精确版本 Zod 依赖）

## Session: 2026-08-31 — Wave 1 / Task 13

### Cost profiles and pricing laboratory

- **Status:** complete
- Actions taken:
  - 将 Task 12 提交 `c1511e7` 推送到 GitHub `codex/phase-0` 分支并建立远端跟踪。
  - 重新读取 master plan、task plan、findings、progress，并确认继续在独立 worktree 分支执行。
  - 标记 Task 13 为 in_progress；下一步先核对现有垂直切片模式，再以失败测试定义纯定价引擎契约。
  - 完成纯 pricing-engine 的 RED→GREEN：首次正确 RED 为 calculate/solver 模块缺失；随后 8 项单元/性质测试通过。
  - 定价引擎支持固定分摊、按件、按订单、按收入百分比与安全公式成本，目标利润/毛利率/净利率/保本求解，以及 verified/warning/incomplete 状态与完整 trace。
  - 分段公式通过阈值分区、区间二分和候选复核寻找最早安全价格；固定成本增长的保本单调性测试通过。
  - 完成 CostProfile 领域模型、乐观 revision、`0005_add-cost-pricing.sql`、真实 SQLite 仓储与不可变 scenario/result 触发器。
  - 完成 application 用例、严格 Zod contracts、成本/定价 Fastify routes 和生产组合根注入。
  - 当前聚焦结果：domain 31、database 22、application 12、contracts 29、server 21 项测试通过；相关 typecheck 通过。

## Session: 2026-09-01 — Wave 1 / Task 13 验收

### Cost profiles and pricing laboratory closeout

- **Status:** complete
- Actions taken:
  - 为 `PricingRepository` 增加原子 `appendCalculation`，将 scenario/result 放入同一 `BEGIN IMMEDIATE` 事务；新增结果写入失败回滚集成测试。
  - 为持久化定价状态增加运行时枚举校验，防止类型断言掩盖畸形数据库内容。
  - 完成成本中心 React 编辑器：已启用 SKU 选择、revision、五类成本、三种输入状态、关键项、动态字段、保存与冲突错误反馈。
  - 完成价格实验室 React 页面：四类定价目标、候选价范围、可信状态、建议价、利润/利润率、完整 trace 和不可变历史。
  - 接通浏览器 API、Workbench 路由、应用组合根和响应式财务样式。
  - 新增 Phase 3 Playwright 黄金路径；第一次运行准确暴露重复文本定位器歧义，按结果区域和指标语义收紧定位后 Phase 2/3 E2E 共同通过。
  - 重连后从 Codex bundled runtime 恢复 Node 24.19.0，并把 pnpm 11.22.0 安装到临时目录，未修改系统工具链。
  - 启动独立只读代码审查，等待审查结论后再提交。
  - 独立审查首次发现 solver 非单调错误、百分比基数未显式选择、轨迹不完整、计算异常 503、UI 请求竞态和大整数展示精度问题；逐项以回归测试修复。
  - solver 最终改为 100,000 分窗口内的升序全局最小值搜索，并为所有公共入口增加 2,000,000 复合工作预算、256 节点上限和四变量白名单。
  - 补齐六类比较、有理表达式阈值、单点有效窗口、复杂公式终止、公共 solver 预算旁路、四种百分比基数、完整财务 trace、422 错误映射、跨商品/SKU 竞态、旧保存解锁和超大 BigInt 展示测试。
  - 独立审查共四轮复核；最终结论为无 Critical/Important/Minor 剩余问题，`Ready to merge: Yes`。

### Fresh verification evidence

| Gate                        | Result               |
| --------------------------- | -------------------- |
| Root unit/integration tests | 289 passed, 0 failed |
| Playwright E2E              | 2 passed, 0 failed   |
| Root typecheck              | passed               |
| Root lint                   | passed               |
| Root production build       | passed               |
| Root format check           | passed               |
| `git diff --check`          | passed               |

### Next action

1. 提交并推送 Task 13：`feat: add traceable sku cost and pricing laboratory`。
2. 进入 Wave 2 / Task 14：平台能力注册表。

## Session: 2026-09-01 — Wave 2 / Task 14

### Truthful platform capability registry

- **Status:** complete
- Actions taken:
  - 新增 `@eaw/platform-engine`，实现三平台规范注册表、旧 profile ID 别名映射、纯 context builder、固定能力矩阵、`requireCapability` 和通用内容 adapter。
  - 拼多多促销/费率在规则快照上线前固定为 `requires_rule_pack`；淘宝/抖音促销不可用、费率不完整，定价仅为通用能力。
  - 新增 application use case、按平台判别的 Zod 合同和 `/api/v1/platforms/:platformId/capabilities`，规范 ID 与别名均可访问。
  - 平台档案页增加真实能力卡，切换平台只加载档案与能力 API，不触发 AI，未支持能力不显示伪利润。
  - 档案保存使用身份和 sequence 双重竞态保护，覆盖切走和 ABA 切回后的过期保存，身份变化时立即解锁新页面。
  - 独立审查发现自证规则完整、合同可伪造、canonical API 不可访问和保存 ABA 问题；均补回归测试并修复，最终复核为无剩余问题、`Ready to merge: Yes`。
  - GitHub 同步核对显示本地与 `origin/codex/phase-0` 为 0 ahead / 0 behind，`origin/main` 无新提交需合并。

### Fresh verification evidence

| Gate                        | Result               |
| --------------------------- | -------------------- |
| Root unit/integration tests | 306 passed, 0 failed |
| Playwright E2E              | 2 passed, 0 failed   |
| Root typecheck              | passed               |
| Root lint                   | passed               |
| Root production build       | passed               |
| Root format check           | passed               |
| `git diff --check`          | passed               |

### Next action

1. 提交并推送 Task 14：`feat: add truthful platform capability registry`。
2. 进入 Wave 2 / Task 15：版本化规则包、冲突解析与不可变快照。

## Session: 2026-09-01 — Wave 2 / Task 15

### Versioned inert rule packs

- **Status:** complete
- Actions taken:
  - 将 Task 15 标记为 in_progress，重读规则系统设计、ADR 0006 与旧实施计划接口。
  - 新增 `@eaw/rule-engine` 包与 RED→GREEN 测试，当前 10 项通过：JSON/ZIP 加载、checksum、应用版本兼容、可执行数据/文件拒绝、ZIP traversal、解析优先级、同级冲突、过期/待审核状态、不可变快照与 diff。
  - 实现稳定 canonical JSON/SHA-256、有边界 ZIP 中央目录解析/CRC32 校验、惰性 Zod schema、规则 resolver、snapshot hash 和稳定 diff。
  - 添加 `default-rule-packs/pinduoduo-cn` 的 manifest/rules/schema/fixture/changelog；佣金、技术服务费和补贴归因不猜值，全部为 `null + needs_review`。
  - 将 `validate:rule-packs` 从占位命令替换为真实构建/校验脚本；当前输出 `validated pinduoduo-cn@2026.9.0 (incomplete)`。
  - 新增 `0006_add-rule-packs.sql`、真实 SQLite 仓储和集成测试：唯一 active 版本、覆盖 revision、不可变快照 trigger、读取时结构/hash fail-closed。
  - 新增 application use case、严格 HTTP 合同和 `/api/v1/rule-packs` 导入/列表/激活/diff API；生产运行时使用 UUIDv7 与真实仓储组合。
  - 将“平台与规则”从占位页升级为可操作页面，支持 JSON/ZIP 文件、粘贴导入、启用版本、显示 `needs_review` 数量和比较规则差异。
  - 收口复核发现加载器的 `sourceFormat` 与仓储 strict schema 边界不兼容；新增真实回归测试并改为只持久化 manifest/rules。

### Current verification evidence

| Gate                        | Result               |
| --------------------------- | -------------------- |
| Root unit/integration tests | 331 passed, 0 failed |
| Root typecheck              | passed               |
| Root lint                   | passed               |
| Root production build       | passed               |
| `pnpm validate:rule-packs`  | passed               |

### Next action

1. 提交并推送 Task 15：`feat: add versioned inert platform rule packs`。
2. 进入 Wave 2 / Task 16：确定性促销金额流、组件规范化、求解与 trace。

## Session: 2026-09-02 — Wave 2 / Task 16

### Deterministic promotion money flow

- **Status:** complete
- Actions taken:
  - 提交并推送 Task 15；同步核对 `codex/phase-0` 与远端分支为 0 ahead / 0 behind。
  - 新增 `@eaw/promotion-engine`，按 RED→GREEN 实现固定满减、券、百分比折扣、门槛、封顶、优先级和资方归因。
  - 组件按 `priority + key` 稳定规范化；逐步 trace 保存每一步请求优惠、实际优惠、消费者应付和商家实收前后值。
  - 平台承担优惠保留商家实收，商家承担优惠同时降低应付与实收，并在运行时强制验证钱流恒等式、非负金额和确认收入。
  - 实现最多 100,000 分搜索窗的升序求解器，保证在门槛、封顶和舍入跳变下仍返回满足最低商家实收的全局最低活动价，并明确返回无解状态。
  - 添加 9 项单元、求解和确定性性质测试，覆盖相同输入重复计算、全价格窗不变量、资金归因和边界拒绝。
  - 全仓测试偶发暴露持久密钥锁的正常原子抢占竞态：扫描后 `owner.json` 已被另一进程改名。读取逻辑对瞬时 `ENOENT` 重新扫描；workspace 测试连续三轮 52/52 通过。

### Fresh verification evidence

| Gate                        | Result               |
| --------------------------- | -------------------- |
| Promotion engine tests      | 9 passed, 0 failed   |
| Root unit/integration tests | 340 passed, 0 failed |
| Root typecheck              | passed               |
| Root lint                   | passed               |
| Root production build       | passed               |

### Next action

1. 提交并推送 Task 16：`feat: add deterministic promotion money flow`。
2. 进入 Wave 2 / Task 17：拼多多模拟器、持久化批算与可解释 UI。

## Session: 2026-09-02 — Wave 2 / Task 17

### Pinduoduo simulator and immutable batch history

- **Status:** complete
- Actions taken:
  - 增加拼多多规则 adapter，将活动价、消费者应付、确认收入、商家实收、平台承担和费用基数接入同一确定性资金流。
  - 默认规则包仍为 `needs_review` 时保留可验证钱流，但明确返回不完整状态，利润、利润率和保本点均为 `null`，不猜佣金或技术服务费。
  - 新增不可变促销场景/结果领域模型、SQLite 迁移与事务批量追加仓储；每条结果固定 SKU、成本 revision、规则快照/hash、引擎版本、输入和 trace。
  - 新增 application use case、严格合同和创建场景/批算/历史 API，生产组合根使用真实成本、规则与促销仓储。
  - 将促销占位页替换为两栏模拟器，支持多 SKU、商家/平台券、结果指标、风险状态、计算过程与不可变历史。
  - 使用真实临时工作区完成生产运行时重启持久化验证，并在应用内打开实际促销页面完成 DOM 验收。

### Fresh verification evidence

| Gate                               | Result               |
| ---------------------------------- | -------------------- |
| Promotion/PDD focused tests        | 12 passed, 0 failed  |
| Production runtime slice           | 6 passed, 0 failed   |
| Root unit/integration tests        | 354 passed, 0 failed |
| Root typecheck                     | passed               |
| Root lint                          | passed               |
| Root production build              | passed               |
| Browser DOM/API/history acceptance | passed               |

### Next action

1. 提交并推送 Task 17：`feat: add pinduoduo promotion simulator`。
2. 进入 Wave 3 / Task 18：版本化、可防注入的提示词编译器。

## Session: 2026-09-02 — Wave 3 / Task 18

### Versioned injection-safe prompt compiler

- **Status:** complete
- Actions taken:
  - 新增 `@eaw/prompt-engine`，实现严格版本化模板、JSON Schema 输出约束、规范 JSON 与 SHA-256 哈希。
  - 按 `SYSTEM → RULE → CONFIRMED_FACT → APPROVED_AI_ASSET → EXTERNAL_UNTRUSTED` 稳定排序；SYSTEM 上下文进入 system message，其余上下文保持独立分段。
  - 外部内容使用内容哈希派生的边界，并明确声明其仅为数据、不可覆盖任务/规则/输出格式；上下文 key 去重且受 32 层、10,000 节点和 200,000 字节预算保护。
  - 模板哈希、依赖哈希和输入哈希分别计算，规则或事实 revision 变化不会改写模板版本，但一定改变依赖/输入身份。
  - 新增首个竞品分析默认模板、`validate:prompts` 严格校验命令与稳定编译快照；扫描确认 route/UI 没有散落业务提示词。
  - 新增 `0008_add-prompts.sql` 与真实 SQLite 仓储，模板版本不可更新/删除，启用指针独立切换，读取时复算哈希并 fail closed。

### Fresh verification evidence

| Gate                        | Result               |
| --------------------------- | -------------------- |
| Prompt engine tests         | 5 passed, 0 failed   |
| Prompt repository tests     | 2 passed, 0 failed   |
| Root unit/integration tests | 361 passed, 0 failed |
| Root typecheck              | passed               |
| Root lint                   | passed               |
| Root production build       | passed               |
| `pnpm validate:prompts`     | passed               |
| `pnpm validate:rule-packs`  | passed               |

### Next action

1. 提交并推送 Task 18：`feat: add versioned injection-safe prompt compiler`。
2. 进入 Wave 3 / Task 19：provider 抽象、DeepSeek、结构化验证、重试与脱敏不可变日志。

## Session: 2026-09-03 — Wave 3 / Task 19

### Guarded DeepSeek generation pipeline

- **Status:** complete
- Actions taken:
  - 新增 `@eaw/ai-engine`，实现 provider 接口、稳定注册表、DeepSeek adapter 和可注入 fake HTTP 边界。
  - 对超时、HTTP 429、5xx 和网络异常执行最多 5 次的有界指数重试；对外只返回不含上游响应和密钥的安全错误。
  - 实现严格 JSON/Zod 结构化生成，首次无效时只允许一次修复；枚举、字段、证据归属、跨商品引用和无支持主张均会拒绝或降级为 `needs_review`。
  - 生成成功、审核降级和失败均通过统一入口追加脱敏日志，保存 provider/model、prompt 版本、输入哈希、token 和时间。
  - 新增 `0009_add-ai-generations.sql`和真实 SQLite 仓储；日志绑定精确提示词版本，通过外键、update/delete trigger 和读取复验 fail closed。
  - 完成本地 DeepSeek 设置用例、严格 API 合同、Fastify 路由和 React 设置页；密钥只进入 `FileSecretStore`，保存后不在响应或页面回显。
  - 真实运行时重启测试确认密钥可持续识别为“已配置”，同时 SQLite 二进制中不含密钥文本。
  - 所有 AI 测试使用 fake provider/fetch，未调用真实 DeepSeek 付费接口。

### Fresh verification evidence

| Gate                             | Result               |
| -------------------------------- | -------------------- |
| Root unit/integration tests      | 379 passed, 0 failed |
| AI engine tests                  | 11 passed, 0 failed  |
| Database tests                   | 34 passed, 0 failed  |
| Root typecheck                   | passed               |
| Root lint                        | passed               |
| Root production build            | passed               |
| Frozen lockfile install          | passed               |
| Prompt/rule-pack validation      | passed               |
| Root format check / diff check   | passed               |
| Runtime secret isolation/restart | passed               |

### Next action

1. 提交并推送 Task 19：`feat: add guarded deepseek generation pipeline`。
2. 进入 Wave 4 / Task 20：可审计竞品快照、CSV/XLSX/粘贴预览与确认导入。

## Session: 2026-09-04 — Wave 4 / Task 20

### Auditable competitor snapshots and imports

- **Status:** complete；按用户要求在此暂停，Task 21 尚未启动
- Actions taken:
  - 新增竞品身份、导入批次和不可变捕获快照领域模型；展示价格/销量/评价与标准化值并存，`10万+` 原文完整保留且只标记为下界。
  - 新增可替换 `CompetitorDataProvider` 端口及 CSV、XLSX、粘贴本地 adapter；执行大小、行列、表头、URL、时间和工作区资产路径校验，不实现抓取器。
  - 新增 preview → validation → confirm 应用流程、严格 Zod 合同、Fastify 路由和 React 竞品页，支持文件预览、确认导入及审计台账。
  - 新增 `0010_add-competitors.sql` 和真实 SQLite 仓储；同商品复合外键阻止跨商品引用，批次原子导入，快照与批次禁止更新/删除。
  - 生产运行时重启集成测试确认竞品快照可持久化，UI/API 测试确认预览、确认和重新加载仍保留展示原文。

### Fresh verification evidence

| Gate                           | Result               |
| ------------------------------ | -------------------- |
| Root unit/integration tests    | 396 passed, 0 failed |
| Competitor engine tests        | 7 passed, 0 failed   |
| Root typecheck                 | passed               |
| Root lint                      | passed               |
| Root production build          | passed               |
| Runtime persistence/restart    | passed               |
| Real paid AI / crawler request | not used             |

### Pause / resume point

1. Task 20 已完成；不要重复实现或重新设计竞品导入。
2. 下周先读取 `docs/superpowers/handoffs/2026-09-04-after-task-20.md`，确认分支与质量门禁后，从 Task 21 的失败测试开始。
3. Task 21 目标是竞品分析、市场洞察、卖点三条独立 AI 垂直链路；必须绑定本商品证据， unsupported idea 降级为 suggested fact，UI 展示证据和限制。

## Session: 2026-09-04 — Wave 4 / Task 21

### Evidence-backed market strategy

- **Status:** complete
- Actions taken:
  - 新增竞品分析、市场洞察和卖点集三类严格结构化输出 schema、独立默认提示词及启动时安装/激活逻辑。
  - 只把已确认、允许且非敏感的商品事实，以及当前商品竞品快照按信任级别送入提示词；AI 输出证据逐条校验类型、ID 和商品归属。
  - 无证据或只有外部证据的商品卖点自动移入 `suggestedFacts` 并标记 `needs_review`，避免把建议展示成已确认事实。
  - 新增 `0011_add-strategy-assets.sql` 与不可变修订仓储；每次重新生成绑定精确 AI generation log、revision 和上一个资产 ID。
  - 新增应用用例、严格合同、Fastify 路由及市场分析/卖点页面，展示证据、数据限制、审核状态和修订历史。
  - 使用 fake provider 完成生产运行时生成与重启持久化测试，未产生真实付费 AI 请求。

### Fresh verification evidence

| Gate                              | Result               |
| --------------------------------- | -------------------- |
| Root unit/integration tests       | 403 passed, 0 failed |
| Root typecheck                    | passed               |
| Root lint                         | passed               |
| Root production build             | passed               |
| Frozen lockfile install           | passed               |
| Prompt/rule-pack validation       | passed               |
| Fake-provider restart persistence | passed               |

### Next action

1. 提交并推送 Task 21：`feat: add evidence-backed market strategy`。
2. 进入 Wave 4 / Task 22：版本化标题工作室、不可变修订、锁定与上游变化 stale 原因。

## Session: 2026-09-04 — Wave 4 / Task 22

### Guarded versioned title studio

- **Status:** complete
- Actions taken:
  - 新增推荐型、搜索型、卖点型和场景型四类严格标题输出，并按拼多多、淘宝/天猫、抖音执行确定性长度、重复和禁用词校验。
  - 标题主张只能引用当前商品已确认、允许且非敏感的事实；无证据主张和模型声明的待核实词语统一标记 `needs_review`。
  - 新增 `0012_add-title-assets.sql` 和不可变修订仓储；生成、编辑与锁定只追加版本，数据库 trigger 禁止历史更新和删除。
  - 依赖哈希覆盖商品事实、卖点、平台本地规则和提示词；上游变化只返回明确 stale 原因，不覆盖锁定版本。
  - 新增严格合同、Fastify 路由和标题工作室页面，支持平台切换、四类编辑、重新生成、锁定、校验问题与历史展示。
  - 使用 fake provider 完成生产运行时生成及重启后历史读取，未发起真实付费 AI 请求。

### Fresh verification evidence

| Gate                              | Result               |
| --------------------------------- | -------------------- |
| Root unit/integration tests       | 408 passed, 0 failed |
| Playwright golden paths           | 2 passed, 0 failed   |
| Root typecheck                    | passed               |
| Root lint                         | passed               |
| Root production build             | passed               |
| Frozen lockfile install           | passed               |
| Prompt/rule-pack validation       | passed               |
| Fake-provider restart persistence | passed               |

### Next action

1. 提交并推送 Task 22：`feat: add guarded versioned title studio`。
2. 进入 Wave 4 / Task 23：结构化创意方案与详情页构建器、单项重生成、锁定和稳定重排。

## Session: 2026-09-07 — Wave 4 / Task 23

### Structured creative and detail builders

- **Status:** complete
- Actions taken:
  - 新增恰好五项、稳定 ID 和显式顺序的创意方案领域模型；每项包含中英文正向提示词、中英文负面提示词、证据引用、审核状态和锁定状态，本版本明确不生成图片。
  - 新增有序详情页区块模型；创意项与详情区块的锁定、单项重生成和重排均追加完整不可变修订，不修改历史记录。
  - 新增三份严格结构化提示词与 AI 输出审核；只编译本商品已确认、允许且非敏感的事实，以及精确卖点/标题修订，跨商品或不存在的证据统一降级为 `needs_review`。
  - 新增 `0013_add-creative-detail-assets.sql`、创意/详情独立仓储和 SQLite 不可变 trigger；生成日志、前序修订及商品/平台/revision 关系均可追踪。
  - 新增应用用例、严格合同、Fastify 路由和生产组合根；fake provider 集成测试确认生成后重启仍能读取相同创意与详情历史。
  - 将“视觉”和“详情页”占位路由替换为真实工作台，支持平台切换、生成、逐项锁定/重生成、上下移动、证据/审核/过期原因和修订历史展示。
  - 以 Node 24.19.0 / pnpm 11.22.0 完成冻结安装和全部质量门禁；所有自动化 AI 测试只使用 fake provider，未发起付费调用。

### Fresh verification evidence

| Gate                              | Result               |
| --------------------------------- | -------------------- |
| Root unit/integration tests       | 429 passed, 0 failed |
| Playwright golden paths           | 2 passed, 0 failed   |
| Root typecheck                    | passed               |
| Root lint                         | passed               |
| Root production build             | passed               |
| Frozen lockfile install           | passed               |
| Prompt/rule-pack validation       | passed               |
| Fake-provider restart persistence | passed               |
| `git diff --check`                | passed               |

### Next action

1. 提交并推送 Task 23：`feat: add structured creative and detail builders`。
2. 进入 Wave 5 / Task 24：持久化工作流 DAG、幂等恢复、取消和 SSE 进度事件。

## Session: 2026-09-08 — Wave 5 / Task 24

### Resumable persisted workflow — engine, SQLite, recovery and preflight

- **Status:** complete
- 已完成工作流定义、状态模型、串行 runner 与内存幂等恢复测试。
- 已完成 SQLite run/node/attempt/event 持久化、revision CAS、不可变审计、失败关闭读取及启动中断恢复。
- 已完成只读预检与归档商品保护；预检不会调用 `execute` 或产生付费 AI 请求。
- 已分别通过 workflow-engine 10 项、database 44 项及 application 28 项测试，以及相关类型检查、lint 和构建。
- 已推送 `27acb0c` 至 `185f670` 共八个 Task 24 阶段提交，远端与本地同步。
- 复核发现并已补齐 runner `retryNode/cancel`：显式重试只接受指定失败节点，取消和重试均执行 revision/状态保护；workflow-engine 12 项测试及类型检查、lint、构建通过。
- 已完成 Application 的 start/list/get 生命周期首段：启动先持久化再调度，后台 runner 拒绝被安全接住，列表/详情均重新校验商品归属；SQLite 新增按商品最新优先查询。
- 最新门禁：application 30 项、database 45 项测试通过，两个包的相关类型检查、lint 和构建通过。
- 已补齐 resume/retry/cancel/listEvents：所有操作先验证 run 商品归属与 expected revision，恢复/重试后台拒绝被安全收敛，取消直接返回原子转换结果；application 31 项测试及类型检查、lint、构建通过。
- 已完成安全事件订阅器：订阅时先回放持久事件、注册后再次补齐竞态窗口，按 sequence 去重；runner/取消完成后才从 durable event 仓储发布，监听器异常与取消订阅均被隔离。Application 32 项测试及类型检查、lint、构建通过。
- 已完成六节点 handler 路由与统一结果映射：三类策略、标题、创意和详情均复用现有应用用例，保留商品/平台身份、精确资产 ID/revision 以及 completed/locked/needs_review 状态；检查快照使用规范 JSON + SHA-256。Application 34 项测试及类型检查、lint、构建通过。
- 已完成真实仓储依赖检查：仅纳入已确认、策略允许且非敏感的事实，并追踪竞品快照、上游资产 ID/revision、平台资料、活动规则包/覆盖项和活动提示词哈希；仅在同商品、同平台且资产保存的 workflow 哈希完全一致时复用。Application 36 项测试及全部包门禁通过，Task 3 完成。
- 已完成 workflow HTTP/SSE 严格 contracts：UUIDv7、平台、固定定义、节点键、正 revision、非负事件游标及所有响应结构均拒绝未知字段。Contracts 35 项测试及类型检查、lint、构建通过。
- 已完成七个 workflow HTTP 操作路由：preflight/start/list/get/resume/retry/cancel 严格解析输入，异步调度操作返回 202，并复用全局安全错误映射。Server 42 项测试及类型检查、lint、构建通过。
- 已完成 durable SSE 适配器：严格校验事件游标，订阅期间先缓冲持久回放再切到实时写入，输出持久 id/event/JSON data 和禁缓存头，连接关闭时可靠取消订阅。Server 44 项测试及全部门禁通过。
- 已完成生产 workflow 组合与 canonical restart：启动恢复先于 buildApp 且绝不自动执行 handler；首次在 creative 失败后重启调用增量为 0，显式 resume 的六节点调用增量严格为 0/0/0/0/1/1。SSE 增加非持久 heartbeat，真实 definition node key 已校正。Application 36、Contracts 35、Server 46 项测试及类型检查、lint、构建通过，Task 4 完成。
- 已完成前端 workflow API 客户端：七个 JSON 操作保留严格 definition/revision guard，typed SSE 按持久事件类型监听并显式提供连接清理。Web 聚焦测试、类型检查和 lint 通过。
- 已完成可访问 workflow 进度组件：六节点状态、精确输出 revision、安全错误、人工复核/依赖变化提示及显式 start/resume/retry/cancel；平台切换丢弃过期结果，SSE 断线严格先 GET 对账再重连。3 项组件测试、类型检查和 lint 通过。
- 已将工作流进度接入真实 `/products/:productId/plans` 路由与顶部入口，补齐页面样式；用户显式启动/操作后会立即订阅该 run。Web 49 项测试、typecheck、lint 和生产构建全部通过。
- 已完成 Phase 10 Playwright 黄金路径：独立 E2E 服务入口使用确定性 fake provider，真实页面验证前四节点成功、creative 首次失败、重载后显式恢复和六节点全部产出。审计日志调用序列严格为 `1/1/1/1/2/1`；Phase 2/3/10 共 3 条 E2E 全部通过，无真实 AI 请求。

### Fresh verification evidence

| Gate                        | Result               |
| --------------------------- | -------------------- |
| Runtime / frozen install    | passed               |
| Root unit/integration tests | 459 passed, 0 failed |
| Playwright golden paths     | 3 passed, 0 failed   |
| Root format/typecheck/lint  | passed               |
| Root production build       | passed               |
| Prompt/rule-pack validation | passed               |
| `git diff --check`          | passed               |
| Real paid AI calls          | 0                    |

### Next action

1. Task 24 全部阶段提交已推送至 `origin/codex/phase-0`，最新收口提交为 `b3ec7c8`。
2. 进入 Task 25：只引用精确上游 revision/result/snapshot ID 的可追踪、可锁定运营方案。

## Session: 2026-09-09 — Wave 5 / Task 25

### Traceable operation plans — domain aggregate

- **Status:** in_progress
- 已写入 Task 25 设计与 5 段实施计划，固定六节点输出、竞品快照、定价结果、可选促销结果和规则快照的精确引用边界。
- 已实现 `OperationPlanRevision`、五类结构化 blocker、严格六节点/资产类型配对、深冻结和只允许无阻塞草稿转为锁定修订的状态机。
- Domain 48 项测试、typecheck、lint 和 build 通过。
- 已新增 `0015_add-operation-plans.sql` 和 `SqliteOperationPlanRepository`：计划头、六节点、竞品快照、定价、促销与促销结果分表保存，全部来源表拒绝 update/delete。
- 真实 SQLite 测试证明草稿/锁定追加、重启后精确重建、最新修订、新到旧历史、revision CAS 冲突回滚和直接 SQL 篡改拒绝。Database 47 项测试、typecheck、lint 和 build 通过。
- 已实现运营方案应用门面：活跃商品归属、确定性 source hash、显式草稿创建、锁定前重新校验、最新修订/预期 revision 并发保护，且不调用任何 AI 生成。Application 38 项测试、typecheck、lint 和 build 通过。

### Next action

1. Task 25 应用门面小任务已由提交 `28c5f39` 推送至 `origin/codex/phase-0`。
2. 已将持续 GitHub 同步和 Windows 新克隆兼容写入主计划、Task 25 计划及长期决策记录；本次记录提交推送后才继续实现。
3. 继续实现真实多仓储精确来源解析与 blocker 计算，并把 Windows 敏感面纳入每个小任务的验收。

## Session: 2026-09-09 — Continuous GitHub and Windows delivery constraint

- **Status:** complete
- 用户确认 GitHub 是跨机器交付源，Windows 必须能从全新克隆直接安装、迁移和启动。
- 主计划现要求每个验证通过的小任务先提交并推送，确认本地与 `origin/codex/phase-0` 同步后才能继续。
- Windows 兼容提升为持续门禁：禁止本机绝对路径和隐式 POSIX-only 依赖，持续覆盖空格/中文路径、CRLF、路径分隔符、大小写、进程行为、符号链接和 SQLite 原生依赖。
- Task 27 仍负责幂等 Windows 安装启动的专项实现；Task 29 必须从 GitHub 全新克隆在 Windows 与 Ubuntu 执行完整统一门禁。

## Session: 2026-09-09 — Task 25 exact repository source resolver

- **Status:** complete
- RED：repository resolver 聚焦测试因模块不存在而失败；公共 barrel 导出测试随后因函数未导出而失败。
- GREEN：实现六节点精确 revision、竞品证据快照、商品 SKU 定价历史、可选促销结果与规则快照的跨仓储解析。
- revalidate 会重新读取精确来源并计算五类稳定 blocker；检测新 revision 时返回 `SOURCE_STALE`，但保留计划原 asset ID/revision 和成本 revision，不自动前移。
- 固定 Node.js 24.19.0 下 Application 19 个测试文件、42 项测试全部通过，typecheck、lint 和 build 通过。
- Windows 敏感检查通过：本次代码未引入文件路径、路径分隔符、CRLF 解析、子进程、符号链接或本机绝对路径依赖。

### Next action

1. 本小任务随本次记录提交并推送至 `origin/codex/phase-0`，确认本地与远端一致。
2. 进入 Task 25 HTTP contracts、routes 与生产组合，继续先写失败测试。

## Session: 2026-09-09 — Task 25 strict HTTP contracts

- **Status:** complete
- RED：contracts 聚焦测试先因 `operation-plans` 模块不存在失败；blocker 来源空白规范化测试随后证明宽松 `.trim()` 会静默接受脏响应。
- GREEN：新增严格 create/lock/params、固定六节点来源、定价/促销来源、blocker、单项响应和列表响应 schema，并通过公共 barrel 导出。
- 生命周期约束拒绝 locked + null 时间、带 blocker 的 locked 计划和错误 lineage；所有嵌套对象拒绝未知字段，所有 hash 只接受 64 位小写 SHA-256。
- 固定 Node.js 24.19.0 下 Contracts 10 个测试文件、38 项测试全部通过，typecheck、lint 和 build 通过。
- Windows 敏感检查通过：合同实现不包含文件路径、shell、换行或平台专用运行时行为。

### Next action

1. 提交并推送 contracts 小任务，确认本地与远端一致。
2. 为 operation-plan Fastify routes 先写失败测试，再实现四个端点和安全错误映射。

## Session: 2026-09-09 — Task 25 Fastify operation-plan routes

- **Status:** complete
- RED：真实 Fastify inject 验证创建、列表、读取、锁定四个目标端点全部返回 404，证明路由尚未注册。
- GREEN：新增四个严格 route，草稿与锁定返回 201，列表/读取返回 200；Date 只在 HTTP 边界序列化。
- malformed UUID、unknown field 和非正 revision 在调用应用层前返回 400；未配置、未找到和 revision 冲突分别安全映射为 503/404/409。
- 固定 Node.js 24.19.0 下 Server 19 个测试文件、49 项测试全部通过，typecheck、lint 和 build 通过。
- Windows 敏感检查通过：路由未引入路径、shell、换行解析、子进程或平台专用 API。

### Next action

1. 提交并推送 Fastify routes 小任务，确认本地与远端一致。
2. 实现 operation-plan 生产 SQLite 组合与重启持久化集成测试。

## Session: 2026-09-09 — Task 25 production composition and restart

- **Status:** complete
- 调试回归 RED 证明草稿 GET/list 没有重新调用 resolver；修复后读取返回当前 blocker，同时持久化 revision 保持未变。
- 组合 RED 证明重启后的 operation-plan API 因未注入应用返回 503；接入真实 SQLite repository、跨仓储 resolver 和应用门面后返回 200。
- 真实重启集成测试直接写入 draft + locked 两个不可变 revision，重启服务后锁定来源 ID/revision/hash 完全一致，AI provider 调用次数为 0。
- 固定 Node.js 24.19.0 下 Application 43、Contracts 38、Server 50 项测试通过；三包 typecheck、lint、build 通过。
- Windows 敏感检查通过：生产组合沿用 Node `path.join`、临时目录和既有跨平台 workspace API，没有新增绝对路径、shell 或符号链接依赖。

### Next action

1. 提交并推送生产组合小任务，确认本地与远端一致。
2. 进入 Task 25 UI 与 Phase 11 Playwright 验收，先实现浏览器 API 和失败组件测试。

## Session: 2026-09-09 — Task 25 operation-plan browser API

- **Status:** complete
- RED：聚焦 Vitest 因 `features/operation-plans/api` 不存在失败。
- GREEN：实现显式创建、按商品列出、按 ID 读取和携带 `expectedRevisionNo` 锁定四个浏览器方法；所有动态路径段均用 `encodeURIComponent`。
- 2 项聚焦测试通过，并通过 Web typecheck、目标目录 lint 和 Prettier 检查。
- Windows 敏感检查通过：浏览器 API 不含文件系统路径、shell、换行解析、绝对路径或平台专用 API。

### Next action

1. 提交并推送浏览器 API 小任务，确认本地与远端一致。
2. 按失败组件测试实现运营方案面板、路由依赖注入和样式。

## Session: 2026-09-09 — Task 25 traceable operation-plan panel

- **Status:** complete
- RED：面板聚焦测试因组件不存在失败；新增测试锁定精确来源呈现、blocker 无障碍公告、阻塞时禁用锁定、显式 mutation、准确 revision guard、新到旧历史和迟到商品/平台结果隔离。
- GREEN：运营方案页保留六节点工作流在上方，并新增可选择已完成工作流、已验证/警告定价历史及可选拼多多活动批次的草稿组合器。
- 当前修订使用语义化 details/list 展示工作流、六项资产 ID/revision/dependency hash、竞品快照、定价/成本修订、促销规则 hash 和总 source hash；五类 blocker 提供所属工作区处理链接。
- 任何创建与锁定都只由用户点击触发；锁定提交当前草稿的精确 `revisionNo`，有 blocker 时按钮禁用。
- 固定 Node.js 24.19.0 下 Web 22 个测试文件、54 项测试通过，typecheck、lint、build、变更文件格式与 `git diff --check` 通过。
- Windows 敏感检查通过：新增前端不含文件系统路径、shell、大小写冲突、CRLF 解析、符号链接或本机绝对路径依赖。

### Next action

1. 提交并推送运营方案面板小任务，确认本地与远端一致。
2. 添加 Phase 11 确定性 Playwright，验证草稿、blocker 处理、锁定、重载后的精确来源与零额外 provider 调用。

## Session: 2026-09-11 — Task 25 Phase 11 acceptance and closeout

- **Status:** complete
- Phase 11 在真实 API/UI 上建立商品、竞品快照、已确认事实、SKU 成本和定价结果，验证首个草稿稳定显示 3 项锁定 blocker。
- E2E 暴露并修复了跨 run 复用缺口：新 run 现在只播种 dependency hash 完全相同的已完成输出，标题、创意和详情资产持久化精确 workflow hash，不再重生成并覆盖用户锁定的修订。
- 确定性 fake provider 从编译后上下文读取精确竞品/事实证据，JSONL 日志增加 productId 隔离；Phase 10 和 Phase 11 并发执行稳定通过。
- 锁定标题、创意项和详情模块后，最终方案草稿无 blocker；锁定和重载后的 source IDs/source hash 完全一致，草稿/锁定/历史操作额外 provider 调用为 0。

### Fresh verification evidence

| Gate                                          | Result                                |
| --------------------------------------------- | ------------------------------------- |
| Runtime / frozen install                      | Node.js 24.19.0 + pnpm 11.22.0 passed |
| Root unit/integration tests                   | 141 files, 498 passed, 0 failed       |
| Playwright golden paths                       | Phase 2/3/10/11: 4 passed, 0 failed   |
| Root format/typecheck/lint/build              | passed                                |
| Prompt/rule-pack validation                   | 7 prompts + 1 rule pack passed        |
| Changed-file lint/format + `git diff --check` | passed                                |
| Real paid AI calls                            | 0                                     |

### Next action

1. 提交并推送 Task 25 Phase 11 收口，确认 `HEAD...origin/codex/phase-0` 为 `0 0`。
2. 进入 Wave 6 / Task 26：WAL 活跃时一致备份、归档安全和失败不破坏旧工作区的事务恢复。

## Session: 2026-09-11 — Task 26 strict manifest and ZIP codec

- **Status:** complete
- 已写入 Task 26 设计与六段实施计划，固定在线 SQLite 快照、密钥/绝对路径排除、暂存恢复和失败逆序回滚边界。
- RED：归档安全聚焦测试因 `archive-security.ts` 不存在失败。
- GREEN：实现严格 manifest 和无外部依赖的 ZIP writer/reader；恢复前检查绝对/穿越/反斜杠路径、重复/大小写冲突、加密标志、未支持压缩、符号链接属性、资源上限、CRC32、SHA-256 和字节数。
- Workspace 4 个测试文件、70 项测试全部通过；typecheck、lint、build、Prettier 和 `git diff --check` 通过。
- Windows 敏感边界已由测试覆盖 drive/UNC 绝对路径、反斜杠、大小写冲突和中文/空格文件名；实现不调用 shell 或外部 ZIP 程序。

### Next action

1. 提交并推送 Task 26.1，确认本地与 GitHub 一致。
2. 进入 Task 26.2：在活跃 WAL 上创建 SQLite 一致、密钥免疫的可移植备份。

## Session: 2026-09-11 — Task 26 consistent portable backup creation

- **Status:** complete
- RED：真实 SQLite/WAL 集成测试因 `createWorkspaceBackup` 不存在失败。
- GREEN：使用 Node.js `sqlite.backup()` 生成单文件一致快照，仅收集 `workspace.json`、快照数据库、`assets/**` 和 `rule-packs/**`，以不可覆盖的硬链接发布不可变备份。
- 每个输入文件都校验常规文件类型、device/inode、大小和读取前后时间；符号链接或中途变动会失败，临时快照在 `finally` 清理。
- 集成测试证明 WAL 备份数据库 `PRAGMA integrity_check = ok` 且包含已提交商品；ZIP 不含 `.secrets.json`、密钥值、源工作区绝对路径、WAL 或 SHM。
- 备份在重新读取后仍可列表/下载，无效候选不会被宣称为可用备份。Workspace 5 个测试文件、73 项测试通过，typecheck、lint、build、Prettier 和 `git diff --check` 通过。

### Next action

1. 提交并推送 Task 26.2，确认本地与 GitHub 一致。
2. 进入 Task 26.3：解压到暂存目录、迁移/完整性预检，并在下次启动执行失败可逆的事务替换。

## Session: 2026-09-11 — Task 26 staged transactional restore

- **Status:** complete
- RED：跨机器恢复集成测试因恢复 API 不存在失败；测试目标路径同时覆盖中文和空格。
- GREEN：归档先解压到 `backups` 下的真实暂存目录，只在归档、manifest、文件哈希和数据库副本验证全部通过后发布 pending marker。
- 下次启动再次验证暂存内容及数据库，然后只激活 `database`、`assets`、`rule-packs`、`workspace.json`；目标工作区 `.secrets.json` 和运行目录不被替换。
- 四个激活阶段分别注入失败，已完成的 rename 均按逆序回滚；旧数据库、资产、规则、workspace metadata 和本机密钥全部保持可用，错误状态不泄露内部异常。
- 重复启动在已应用后为无操作；高版本、损坏归档及数据库预检失败都不会创建 pending marker。
- Workspace 6 个测试文件、80 项测试通过，typecheck、lint、build、Prettier 和 `git diff --check` 通过。

### Next action

1. 提交并推送 Task 26.3，确认本地与 GitHub 一致。
2. 进入 Task 26.4：建立数据管理应用用例、严格 HTTP 合同、Fastify 路由，并在生产启动早期应用 pending restore。

## Session: 2026-09-11 — Task 26 data-management API and startup composition

- **Status:** complete
- RED：应用/合同聚焦测试先因模块不存在失败；Fastify 与真实重启测试先因五个数据管理端点未注册返回 404。
- GREEN：实现五端口 `DataManagementApplication`，备份公开记录只含 ID、时间、版本、大小和同源下载 URL；下载只返回复制后的字节与安全文件名，恢复上传为空、超限或损坏时均返回脱敏验证错误。
- 严格合同拒绝未知字段、非法 ID/时间/版本/大小/下载 URL 及不可能的恢复状态组合；`pending` 必须携带 `restartRequired: true`。
- Fastify 提供创建、列表、ZIP 下载、ZIP 暂存和状态五个端点；能力未组合返回 503，非法参数/媒体体返回 400，损坏归档响应不包含内部路径。
- 生产组合在 `initializeWorkspace`、workspace lock 和生产数据库打开之前应用 pending restore；候选数据库在打开后执行当前迁移与 `integrity_check` 并关闭。
- 真实中文/空格工作区集成测试证明：备份后新增商品不会出现在恢复后的数据库，备份内商品保留，恢复状态为 `applied`。

### Fresh verification evidence

| Gate                                  | Result                     |
| ------------------------------------- | -------------------------- |
| Application unit/integration tests    | 20 files, 49 passed        |
| Contracts tests                       | 11 files, 40 passed        |
| Server route/runtime tests            | 20 files, 54 passed        |
| Three-package typecheck/lint/build    | passed                     |
| Changed-file Prettier / diff check    | passed                     |
| Windows-sensitive path/symlink review | no new platform dependency |

### Next action

1. 提交并推送 Task 26.4，确认本地与 GitHub 一致。
2. 进入 Task 26.5：实现数据管理页面与 Phase 12 跨机器备份恢复验收。

## Session: 2026-09-11 — Task 26 data-management UI and Phase 12 acceptance

- **Status:** complete
- RED：浏览器 API 与 React 面板聚焦测试先因模块不存在失败；Phase 12 首次真实业务运行在缺少 E2E 重启控制端点时返回 404。
- GREEN：`/capabilities/data` 已替换占位页，展示备份时间、版本、大小和安全下载；页面明确说明不包含 API 密钥/本机路径/日志，并且挂载时只读取列表和状态。
- 创建备份只由按钮触发；恢复只接受 ZIP，选择后还需勾选确认并再次点击。忙碌、成功和错误使用语义化公告，成功才清空文件输入，API 依赖切换后的迟到初始响应会被忽略。
- 确定性 E2E 控制只暴露 generation，不暴露工作区路径；Phase 12 从源工作区创建 ZIP，确认归档字节不含源密钥和绝对路径，再切到中文/空格目标工作区验证损坏归档不改数据、有效归档在重启后事务生效。
- 联合回归发现 Playwright 会并行运行测试文件，Phase 12 重启共享服务器会打断其他路径；固定 `workers: 1` 后 Phase 2/3/10/11/12 全部通过。冷启动门限增至 240 秒以覆盖 Windows 较慢构建。

### Fresh verification evidence

| Gate                                      | Result              |
| ----------------------------------------- | ------------------- |
| Web unit/component tests                  | 24 files, 59 passed |
| Web typecheck/lint/build                  | passed              |
| Server source lint + E2E script runtime   | passed              |
| Phase 12 focused Playwright               | 1 passed            |
| Phase 2/3/10/11/12 combined Playwright    | 5 passed            |
| Paid/provider calls for backup operations | 0                   |

### Next action

1. 提交并推送 Task 26.5，确认本地与 GitHub 一致。
2. 进入 Task 26.6：运行全仓发布门禁、更新主计划状态并将 Task 27 设为 in progress。

## Session: 2026-09-14 — Task 26 release gates and closeout

- **Status:** complete
- 精确运行时检查和离线冻结安装通过：Node.js 24.19.0、pnpm 11.22.0，18 个 workspace 项目依赖无漂移。
- 全仓格式、typecheck、lint 和生产构建通过；完整单元/集成测试共 149 个文件、541 项测试，0 失败。
- 7 个版本化提示词和 1 个拼多多规则包校验通过；Phase 2/3/10/11/12 共 5 条 Playwright 黄金路径在当前实现上通过，备份流程未产生真实付费 provider 调用。
- WAL 在线备份测试证明独立 SQLite 快照 `integrity_check = ok`；严格 ZIP 校验覆盖 traversal、绝对/反斜杠路径、重复/大小写冲突、符号链接、CRC32、SHA-256 和资源上限。
- 备份仅含相对路径白名单，不含 `.secrets.json`、密钥值、源工作区绝对路径、WAL/SHM 或日志；中文/空格目标工作区可恢复，损坏归档及四阶段注入失败均保持旧工作区和本机密钥可用。
- Windows 可移植性审计通过：无大小写冲突跟踪路径、无跟踪符号链接、无生产 CRLF 敏感解析、无机器绝对路径、无外部归档命令或 POSIX-only 替换假设；win32 drive/UNC/反斜杠测试继续通过。

### Fresh verification evidence

| Gate                             | Result                                 |
| -------------------------------- | -------------------------------------- |
| Runtime / frozen offline install | Node 24.19.0 + pnpm 11.22.0 passed     |
| Root unit/integration tests      | 149 files, 541 passed, 0 failed        |
| Playwright golden paths          | Phase 2/3/10/11/12: 5 passed, 0 failed |
| Root format/typecheck/lint/build | passed                                 |
| Prompt/rule-pack validation      | 7 prompts + 1 rule pack passed         |
| Windows portability / diff audit | passed                                 |
| Real paid AI calls               | 0                                      |

### Next action

1. 提交并推送 Task 26 收口，确认 `HEAD...origin/codex/phase-0` 为 `0 0`。
2. 进入 Task 27：先审计现有启动、迁移和 CI 边界，再以失败测试驱动幂等 Windows setup/start 工作流。

## Session: 2026-09-14 — Task 27.1 production bootstrap and default resources

- **Status:** complete
- 已写入并推送 Windows setup/start 设计与五段详细实施计划，选择“PowerShell 负责 OS 编排、TypeScript 生产组合负责业务 bootstrap”的单一权威路径。
- RED：默认规则测试先因模块不存在失败；GREEN 后证明首次安装、重复无追加、保留既有 metadata、同版本 checksum 漂移失败关闭，且默认包保持 inactive。
- RED：bootstrap 集成测试先因入口不存在失败；实现严格 `--workspace` 参数、生产组合 ready/close 后，在 `工作台 空格` 路径连续执行两次并保留中间写入的商品。
- bootstrap 后数据库固定包含 16 个迁移、7 个提示词、7 个 activation、1 个未启用 bundled 规则包；编译后 CLI 连续运行成功，非法参数非零失败。
- 新默认安装行为暴露旧促销集成测试重复导入假设；改为从真实列表取得 bundled pack 后显式激活，Server 22 个文件、59 项测试通过。
- Server typecheck、lint、build、变更文件格式、`git diff --check` 和联网 frozen-lockfile 安装通过；无真实 provider 调用。

### Next action

1. 提交并推送 Task 27.1，确认本地与 GitHub 为 `0 0`。
2. 进入 Task 27.2：安装/调用 PowerShell 7，先运行缺失模块的 Pester RED，再实现命令、版本、路径和健康等待安全边界。

## Session: 2026-09-14 — Task 27.2 Windows command and path safety

- **Status:** complete
- 从 Microsoft 官方 GitHub release 取得 PowerShell 7.6.6 x64，压缩包 SHA-256 与官方 `hashes.sha256` 完全一致；官方 PSGallery 当前稳定 Pester 6.2.0 被固定为本地与 Windows CI 版本。
- RED：Pester 发现 7 项行为测试，因 `scripts/windows/Workbench.psm1` 不存在失败；GREEN 后 7/7 通过。
- 模块只导出四个边界：原生命令非零退出码终止、复用项目 Node/pnpm 版本检查器、工作区默认位于 `LOCALAPPDATA` 且拒绝源码子目录、健康轮询只接受匹配的 status/version 并在单调时限内失败。
- 从 `/private/tmp` 作为当前目录执行同一 Pester 入口仍 7/7 通过，证明中文/空格仓库路径及非仓库 cwd 不会破坏导入。
- 根级脚本 Vitest 1 文件/3 项通过；CI YAML Prettier 和 `git diff --check` 通过。

### Next action

1. 提交并推送 Task 27.2，确认本地与 GitHub 为 `0 0`。
2. 进入 Task 27.3：先以真实重复执行测试驱动幂等 `scripts/setup.ps1`，并验证已有工作区数据不被覆盖。

## Session: 2026-09-14 — Task 27.3 idempotent Windows setup

- **Status:** complete
- RED：2 项 setup 行为测试因 `scripts/setup.ps1` 不存在失败；实现后从不同 cwd 对 `工作台 安装` 路径连续执行两次完整 setup，2/2 通过。
- `scripts/setup.ps1` 只解析自身相对路径、导入公共模块并输出解析后工作区/成功两行；实际阶段固定为版本检查、`pnpm install --frozen-lockfile`、全仓构建、编译后 bootstrap。
- 两次之间写入的 `keep.txt` 和 SQLite sentinel 均保留；数据库仍包含 7 个提示词、7 个 activation 和 1 个未激活规则包。
- 仓库子目录在任何命令或创建之前失败关闭；无 TTY 时两个 pnpm 阶段临时设置 `CI=true`，结束后精确恢复调用者原有环境。
- 安全模块回归 7/7、Server bootstrap 集成 2/2、全仓 typecheck、构建与 `git diff --check` 通过；源码树未产生工作区数据。

### Next action

1. 提交并推送 Task 27.3，确认本地与 GitHub 为 `0 0`。
2. 进入 Task 27.4：以真实进程测试驱动仅回环地址绑定、健康等待、进程 marker 复用及超时清理。

## Session: 2026-09-14 — Task 27.4 healthy loopback Windows start

- **Status:** complete
- RED：真实启动与端口冲突测试因 `scripts/start.ps1` / `Start-WorkbenchServer` 不存在失败；首次 GREEN 暴露 marker 根 URL 被误当健康端点，根因修正为固定 `/api/v1/health`。
- 生产子进程只获得 `HOST=127.0.0.1`、指定 PORT 和解析后工作区；父进程的三个环境值在 spawn 后精确恢复。
- 健康成功后才以 UTF-8 原子发布 `logs/workbench-server.json`，记录 PID/port/loopback URL/version；复用前先校验 marker metadata 为回环地址，再校验活进程与精确健康版本。
- 真实 API 写入的“启动路径商品”在指定中文/空格工作区 SQLite 中可见；第二次启动复用同一 PID，从非仓库 cwd 调用不受影响。
- 已启动子进程因 workspace lock 立即失败时，在 2 秒健康时限和显式 5 秒进程清理预算内移除 marker，且端口可立即重新绑定；无关监听端口不启动新进程并在 1 秒内失败。
- 完整 PowerShell 套件 3 文件/12 项通过；加强后启动聚焦测试 3/3 通过，确认日志不包含子进程继承的测试密钥，AfterAll 等待并断言精确 PID 退出。

### Next action

1. 提交并推送 Task 27.4，确认本地与 GitHub 为 `0 0`。
2. 进入 Task 27.5：在 GitHub Windows runner 验证干净检出，完成 README/主计划文档和 Task 27 发布门禁收口。

## Session: 2026-09-15 — Task 27.5 Windows release closeout

- **Status:** complete
- GitHub run `34920871679` 从全新检出验证通过：`windows-latest` 16m07s、`ubuntu-latest` 9m23s；Windows 完整执行重复 setup、中文/空格工作区、回环启动、健康检查和精确子进程终止。
- 首轮 Windows CI 暴露 Node 24 直接 `execFileSync('pnpm.cmd')` 的 `EINVAL`；版本检查改为固定 `ComSpec /d /s /c` 静态命令后，聚焦 Vitest 5/5 通过。
- 第二轮 Windows CI 暴露活跃日志写句柄与 `ReadAllText` 的共享冲突；测试改用 `FileShare.ReadWrite` 只读流后，本地启动 Pester 3/3、完整 Pester 12/12 和真实 Windows Pester 均通过。
- 本地精确工具链为 Node.js 24.19.0、pnpm 11.22.0、PowerShell 7.6.6、Pester 6.2.0；冻结安装、格式、typecheck、lint、生产构建、7 个提示词和 1 个规则包校验均通过。
- 全仓单元/集成测试为 151 个文件、548 项通过、0 失败；Phase 2/3/10/11/12 Playwright 为 5/5 通过，自动化未发起真实付费 AI 调用。
- 可移植性审计覆盖 698 个跟踪文件：0 大小写冲突、0 Windows 非法名称、0 跟踪符号链接、0 机器路径泄漏；源码树未生成 workspace，原生命令参数、仅回环绑定、有界健康等待和失败 PID 清理均由行为测试覆盖。
- 新增 `.gitattributes` 固定文本 LF 并标记常见二进制资产，避免 Windows `core.autocrlf` 产生脚本、JSON 或校验差异。
- README 已替换过时 Phase 0 说明，写明 Windows 全新克隆、精确工具链、幂等 setup/start、默认及自定义工作区、数据保留、备份恢复和安全排障。
- CI 增补格式与提示词校验，并将耗时 Windows Pester 放在普通质量门禁之后；Task 27 已完成，Task 28 进入 in progress。

### Fresh verification evidence

| Gate                             | Result                                 |
| -------------------------------- | -------------------------------------- |
| Runtime / frozen install         | Node 24.19.0 + pnpm 11.22.0 passed     |
| Root unit/integration tests      | 151 files, 548 passed, 0 failed        |
| PowerShell acceptance            | 3 files, 12 passed, 0 failed           |
| Playwright golden paths          | Phase 2/3/10/11/12: 5 passed, 0 failed |
| Root format/typecheck/lint/build | passed                                 |
| Prompt/rule-pack validation      | 7 prompts + 1 rule pack passed         |
| GitHub clean Windows/Ubuntu run  | `34920871679`: both jobs passed        |
| Windows portability / diff audit | 698 tracked files audited; passed      |
| Real paid AI calls               | 0                                      |

### Next action

1. 提交并推送 Task 27 收口，确认增强后的最终 CI 与 `HEAD...origin/codex/phase-0` 均为绿色/`0 0`。
2. 进入 Task 28：先以失败测试定义总控台风险摘要、脱敏设置、离线能力边界与无障碍语义，再分小任务实现并逐次提交推送。

## Session: 2026-09-15 — Task 28.1 operational dashboard read model

- **Status:** complete
- 新增严格 `DashboardResponseSchema`：六项非负安全整数、两项配置布尔值、封闭的 attention code/severity 和仅允许站内绝对路径的行动链接；额外字段、未知枚举、负数/非安全整数及外部/相对链接均失败关闭。
- 新增只读 `DashboardApplication`，依赖面只暴露查询方法，不包含任何写入或 provider 调用。
- 当前风险按未归档商品与已启用 SKU 聚合；定价和促销各自仅采用每个 SKU 最新结果，旧亏损不会覆盖新盈利，禁用 SKU 不计入成本和风险。
- 定价严格读取 `outcome.netProfit.minorUnits`，促销严格读取 `financial.netProfit.minorUnits`；合法 `financial: null` 表示未形成财务结论，其他畸形快照使整个读取失败。
- 标题、创意图和详情页按商品/平台/资产种类只取最新修订判断过期；平台固定覆盖拼多多、淘宝、抖音。
- 规则风险只统计拼多多/CN 当前启用规则包中的 `needs_review`；仅安装未启用时单独提示缺少活动规则包；AI 只暴露是否已配置。
- RED 已分别证明缺失模块；GREEN 后 Contracts 9 项、Application 3 项聚焦测试通过，两个包 typecheck、变更文件 lint/Prettier 与 `git diff --check` 通过。

### Next action

1. 提交并推送 Task 28.1，确认 GitHub 同步为 `0 0`。
2. 进入 Task 28.2：先为 `GET /api/v1/dashboard` 写路由 RED 测试，再完成生产 runtime 组合与持久化集成验证。

## Session: 2026-09-15 — Task 28.2 dashboard HTTP and production composition

- **Status:** complete
- 新增 `GET /api/v1/dashboard` 并注册到服务端：只接受无查询、无请求体的读取，应用缺失返回安全的 503，非法输入返回 400，输出再次经过严格契约验证。
- 路由测试覆盖严格 200 映射、能力缺失、查询/请求体拒绝及应用意外返回路径或密钥字段时失败关闭且响应不回显敏感值，共 5/5 通过。
- 生产 runtime 复用已构造的商品、SKU、定价、促销、规则、AI、标题和内容应用创建总控台，不重复打开数据库或复制过期判断。
- 真实工作区集成从 HTTP 创建商品与两个 SKU、为一个 SKU 保存成本、生成旧/新定价记录、配置 AI、启用默认规则包，并生成一份因平台档案变化而过期的拼多多标题和一份当前淘宝标题。
- 重启后总控台精确返回 1 商品、2 个启用 SKU、1 个缺失成本、1 份过期资产、0 个最新亏损、3 条待审核规则；AI/规则配置状态持久化，响应不含密钥或工作区绝对路径，读取前后 provider 调用数不变。
- 完整 Server 23 个测试文件、65 项测试通过；Server typecheck/build、变更文件 lint/Prettier 和 `git diff --check` 通过。
- 完整套件并行时真实数据库 TypeScript 子构建由约 2.5 秒增至超过默认 5 秒；确认隔离通过后仅将该真实构建用例设置为有界 20 秒，消除本地及较慢 Windows runner 的资源竞争误报。

### Next action

1. 提交并推送 Task 28.2，确认 GitHub 同步为 `0 0`。
2. 进入 Task 28.3：以 Web API/UI RED 测试替换旧 Phase 占位总控台，接入真实风险快照和站内行动链接。

## Session: 2026-09-15 — Task 28.3 actionable dashboard web UI

- **Status:** complete
- 新增浏览器 `DashboardApi`，只读取 `/api/v1/dashboard` 并用共享严格契约解析；HTTP 失败和带额外内部字段的成功响应均拒绝。
- 旧商品列表推测式总控台及“成本 Phase 3”占位已删除，替换为真实运营快照：六项具名指标、DeepSeek/拼多多规则包文本状态、按稳定优先级展示的风险行动链接。
- 加载阶段不显示伪造零值；失败只显示安全告警且不回显后端错误；空工作区明确引导创建第一个商品；无风险状态有文字结论。
- 页面不再依赖商品列表猜测就绪度，风险链接仅使用契约允许的站内绝对路径并进入商品、规则或 AI 工作区。
- 新增六列桌面指标、1100px 三列、600px 两列、440px 单列样式；配置与风险项在窄屏改为单列，行动内容不被裁切。
- 为浏览器增加 `@eaw/contracts/dashboard` 专用导出，避免从 contracts 根入口把 Domain 的 Node `crypto` 依赖带入前端；生产构建模块数由误引入时的 235 降至 170，构建无 browser-external 警告。
- API/UI/路由聚焦 15 项测试通过；完整 Web 26 个文件、63 项测试通过，Web typecheck/lint/build、Prettier 与 `git diff --check` 通过。

### Next action

1. 提交并推送 Task 28.3，确认 GitHub 同步为 `0 0`。
2. 进入 Task 28.4：建立脱敏系统状态契约、只读应用/路由及真实系统设置页面。

## Session: 2026-09-15 — Task 28.4 redacted system settings

- **Status:** complete
- 新增严格系统状态契约与 `/api/v1/system/status`：只包含应用版本、`localOnly: true`、固定 `127.0.0.1`、AI 配置布尔值/模型、提示词统计和拼多多/CN 规则包统计。
- 契约拒绝额外字段、远程绑定、负数/非安全计数；路由在应用缺失或返回路径/密钥字段时安全 503，响应不回显敏感数据。
- 只读应用固定遍历 7 个已知默认提示词 ID，统计已安装版本和当前启用数；规则只返回已安装数、当前启用版本或 `null`、当前待审核规则数，不暴露正文、hash 或来源细节。
- 生产 runtime 复用现有提示词仓库、规则与 AI 应用。真实工作区重启后返回 7/7 提示词、1 个规则包、活动版本和 3 条待审核规则，读取不新增 provider 调用且不含 API key/绝对路径。
- `/capabilities/settings` 已从通配占位变为真实只读页面，说明本机回环边界并链接 AI、规则、备份恢复三个现有修改页面；设置页自身没有写操作。
- 聚焦契约/应用/路由/生产/UI/路由 25 项测试通过；四个相关包 typecheck、变更 lint/Prettier、Web build 和 `git diff --check` 通过。

### Next action

1. 提交并推送 Task 28.4，确认 GitHub 同步为 `0 0`。
2. 进入 Task 28.5：建立浏览器连接状态模型，只禁止联网 AI 行为并保持本地 CRUD、财务、历史、规则、导入和备份恢复可用。

## Session: 2026-09-15 — Task 28.5 truthful offline capability policy

- **Status:** complete
- 新增纯函数能力策略与可注入连接状态 provider，仅使用 `navigator.onLine` 和浏览器 `online`/`offline` 事件，不进行探测、轮询或定时重试。
- 全局离线横幅使用 `role=status` 与 `aria-live=polite` 明确提示：联网 AI 操作暂停，本地数据和财务功能仍可使用；恢复联网只更新可用状态，不会自动发起操作。
- 离线时精确禁用 DeepSeek 连接测试、策略/标题/五图/详情页生成、创意单项重新生成及工作流启动/恢复/节点重试；每个禁用控件都关联可见原因。
- 本地回环读取不经过拦截；AI 密钥保存/清除、标题编辑/锁定、创意与详情锁定/排序、工作流取消仍可离线执行。能力表同时覆盖 CRUD、定价历史、促销、竞品导入、规则和备份恢复。
- 离线行为测试逐一证明被阻止的方法调用数为 0，同时验证本地操作仍会调用所属 API；连接 provider 验证事件更新、清理订阅和重连零副作用。
- 完整 Web 29 个测试文件、75 项测试通过；Web typecheck、lint、生产构建和 `git diff --check` 通过。构建共转换 175 个模块。

### Next action

1. 提交并推送 Task 28.5，确认 GitHub 同步为 `0 0`。
2. 进入 Task 28.6：以失败测试驱动全局错误恢复、跳转链接、路由焦点管理与 1440/720/390 窄屏验收。

## Session: 2026-09-15 — Task 28.6 accessibility, recovery and narrow-screen acceptance

- **Status:** complete
- 新增顶层错误边界：渲染异常时只显示安全中文说明，不回显异常消息或堆栈，不自动重试；只有用户明确点击后才重新加载工作台。
- 新增首个可聚焦的“跳到主要内容”链接和唯一主内容 landmark；路径变化后焦点进入主内容，初始加载及仅查询参数变化不会抢夺用户焦点。
- 主导航继续通过 `aria-current=page` 暴露当前位置；没有商品时“生成运营方案”保留 `aria-disabled=true` 并阻止误导航。
- 商品事实、SKU、竞品表格补齐具名 caption、列/行 header scope；事实与 SKU 表格置于具名内部横向滚动区域，窄屏不再推动整个文档横向溢出。
- Playwright 真实创建商品并在 1440、720、390 三档宽度验证商品事实和系统设置：主导航、主内容、设置入口均可见，文档无水平溢出，390px 宽表格可独立滚动。
- Playwright 进一步验证离线横幅出现/消失不产生写请求，键盘首次 Tab 命中跳转链接，Enter 和站内路径导航都把焦点移动到主内容；1/1 完整黄金路径通过。
- 完整 Web 31 个测试文件、77 项测试通过；Web typecheck、lint、生产构建和 `git diff --check` 通过。构建共转换 177 个模块。

### Next action

1. 提交并推送 Task 28.6，确认 GitHub 同步为 `0 0`。
2. 进入 Task 28.7：运行 Task 28 全部发布门禁、审计脱敏/离线/键盘/窄屏结果，更新 README 和主计划记录。

## Session: 2026-09-16 — Task 28.7 release closeout

- **Status:** complete
- 精确工具链 Node.js 24.19.0、pnpm 11.22.0 下，冻结离线安装、格式、typecheck、lint、生产构建、7 个提示词和 1 个规则包校验全部通过。
- 全仓单元/集成测试为 164 个文件、595 项通过、0 失败；Task 28 Web 回归为 31 个文件、77 项通过，构建转换 177 个模块。
- 完整 Playwright Phase 2/3/10/11/12 为 5/5 通过；Task 28 专项在 1440/720/390 宽度验证无文档级横向溢出、键盘跳转和路由焦点，并证明离线横幅切换不会产生写请求。
- PowerShell 6.2.0 验收共 12 项通过：普通沙箱内 setup/common 9/9，通过授权的本机回环环境补跑 start 3/3；区分记录是因为沙箱禁止监听回环端口，不是产品失败。
- 可移植性审计覆盖 727 个跟踪文件：0 大小写冲突、0 Windows 非法路径、0 跟踪符号链接、0 CRLF 文本、0 本机绝对路径泄漏；`git diff --check` 通过。
- GitHub 干净检出首次暴露 Web typecheck 依赖本机旧 `packages/contracts/dist`；新增统一 `prepare:contracts` pre-hook 后，移走本地 dist 仍可自动重建 dashboard/system-status 子路径声明并通过 Web typecheck、77 项测试及构建。
- GitHub run `35049892068` 的 Ubuntu 作业 10m20s 通过，Windows 的安装、类型、lint、595 项测试、构建和资源校验也全部通过；最终 Pester 仅因 4 秒硬编码断言在 4.714 秒失败，而 marker 已删除且端口已释放。断言改为真实的 2 秒健康时限 + 5 秒清理预算 + 1 秒 runner 余量后，锁定工具链本地 start Pester 3/3 通过（2.85 秒完成失败子进程清理）。
- 总控台、脱敏系统设置、离线允许/禁止边界、显式错误恢复、键盘语义和窄屏行为已写入 README；自动化真实付费 AI 调用数为 0。
- 已知剩余范围仅为 Task 29：把现有分阶段 Playwright 场景合并为从空白工作区到锁定运营方案的单一黄金路径，并纳入最终 Windows/Ubuntu 发布门禁；当前 CI 执行质量门禁与 Windows Pester，Playwright 证据来自本地支持环境。

### Fresh verification evidence

| Gate                             | Result                                  |
| -------------------------------- | --------------------------------------- |
| Runtime / frozen install         | Node 24.19.0 + pnpm 11.22.0 passed      |
| Root unit/integration tests      | 164 files, 595 passed, 0 failed         |
| Task 28 Web regression           | 31 files, 77 passed, 0 failed           |
| PowerShell acceptance            | 9 sandbox + 3 loopback, 12 passed total |
| Playwright golden paths          | Phase 2/3/10/11/12: 5 passed, 0 failed  |
| Root format/typecheck/lint/build | passed                                  |
| Prompt/rule-pack validation      | 7 prompts + 1 rule pack passed          |
| Windows portability / diff audit | 727 tracked files audited; passed       |
| Real paid AI calls               | 0                                       |

### Next action

1. 确认 Task 28 最终文档提交的 Windows/Ubuntu CI 全绿且 `HEAD...origin/codex/phase-0` 为 `0 0`。
2. 执行 Task 29：先写统一黄金路径 RED 测试，再按第一个真实行为缺口逐项修复并保留聚焦回归。

## Session: 2026-09-16 — Task 29 execution plan

- **Status:** complete
- Task 28 最终提交 `2c60f94` 已推送；GitHub run `35051664130` 从干净检出通过，Ubuntu 7m29s、Windows 19m49s，远端同步为 `0 0`。
- 已核对现有 Phase 2/3/10/11/12 五条 Playwright：分别覆盖建档/窄屏/离线、定价 trace、工作流显式恢复、运营方案不可变锁定、事务备份恢复，但尚无一条从空白工作区贯穿全部业务步骤的规范路径。
- 已核对 E2E 服务使用本地确定性 fake provider，首个 creative 调用按商品固定失败一次并写调用日志；这可直接验证显式恢复与已完成节点不重跑，不需要真实 DeepSeek 调用。
- 新计划固定五个小任务：统一 RED、逐 owner 修复、跨平台隔离、双平台强制浏览器门禁、最终升级/恢复/可移植性审计；每个绿色小任务都先提交推送再继续。
- 详细计划：`docs/superpowers/plans/2026-09-16-final-golden-path-release.md`。

### Next action

1. 提交并推送 Task 29 详细计划。
2. 创建 `tests/e2e/golden-path.spec.ts` 与 UTF-8 竞品 fixture，运行单 spec RED 并记录第一个真实行为缺口。

## Session: 2026-09-16 — Task 29.1–29.2 canonical golden path

- **Status:** complete
- 新增从空白工作区开始的单一 Playwright 黄金路径：可见 UI 完成商品、已确认事实、SKU、成本、UTF-8 竞品导入、AI 设置、规则包、显式失败/恢复工作流、标题/五图/详情锁定、定价与促销 trace、精确来源选择、草稿与显式锁定。
- 确定性 provider 调用顺序严格为前四节点各 1 次、creative 失败后重试 1 次、detail 1 次；已完成节点未重跑，无公网请求、无真实付费 AI 调用。
- 增加确定性已验证拼多多 test-only 规则夹具；内置待复核规则仍先通过 UI 显式启用，不会被伪装为可确定计算的财务值。
- 修复三个产品缺口：已完成运行后缺少“启动新工作流”显式入口；无 body 内容锁定 POST 错误携带 JSON header；运营方案二次校验用字段顺序敏感的 JSON 比较误判来源过期。
- 锁定修订在页面刷新和 E2E 服务重启后保持相同来源对象与 64 位来源哈希；精确包含 6 个工作流资产节点、1 个竞品快照、定价与活动来源。

### Verification evidence

| Gate                                        | Result                  |
| ------------------------------------------- | ----------------------- |
| Canonical Playwright                        | 1 passed in 1.3m        |
| Application tests                           | 22 files, 55 passed     |
| Web tests                                   | 32 files, 80 passed     |
| Focused workflow/content/source regressions | 15 passed total         |
| Application/Web typecheck + lint + build    | passed                  |
| Verified E2E rule fixture                   | 3 rules, checksum valid |
| Real paid AI calls                          | 0                       |

### Next action

1. 提交并推送 Task 29.1–29.2，确认 GitHub 同步为 `0 0`。
2. 执行 29.3：将工作区与 provider 日志改为每次运行唯一的中文/空格临时路径，联跑全部 Playwright 场景并验证失败 trace 策略。
