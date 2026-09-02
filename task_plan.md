# Task Plan: 完成电商 AI 运营工作台

## Goal

按照 `docs/superpowers/plans/2026-08-31-workbench-completion-master-plan.md` 完成 Task 12–29，使工作台达到本地可安装、数据可恢复、财务可追踪、AI 有事实守卫、全链路可验收的 v0.1 状态。

## Current Phase

Wave 3 — Task 18：版本化提示词编译器（in_progress）

## Phases

### Baseline: 已完成能力核验

- [x] Phase 0：仓库、应用壳、质量基线
- [x] Phase 1：领域基础、工作区安全、SQLite
- [x] Phase 2：商品、事实、SKU、平台档案和可用性收口
- [x] Phase 3 / Task 11：精确金额、费率、舍入与 trace
- **Status:** complete

### Wave 1: 完成财务基础

- [x] Task 12：安全公式 AST 与依赖 DAG（complete）
- [x] Task 13：成本档案与定价实验室（complete）
- **Status:** complete

### Wave 2: 平台规则与促销闭环

- [x] Task 14：平台能力注册表（complete）
- [x] Task 15：版本化规则包与快照（complete）
- [x] Task 16：确定性促销引擎（complete）
- [x] Task 17：拼多多模拟器与批算（complete）
- **Status:** complete

### Wave 3: AI 安全基础设施

- [ ] Task 18：版本化提示词编译器（in_progress）
- [ ] Task 19：DeepSeek provider、结构化验证与日志
- **Status:** pending

### Wave 4: 竞品、策略与内容资产

- [ ] Task 20：竞品快照与导入
- [ ] Task 21：竞品分析、市场洞察与卖点
- [ ] Task 22：版本化标题工作室
- [ ] Task 23：创意和详情页构建器
- **Status:** pending

### Wave 5: 工作流与运营方案

- [ ] Task 24：持久化工作流 DAG 与 SSE
- [ ] Task 25：可追踪、可锁定运营方案
- **Status:** pending

### Wave 6: 工作区可靠性与 Windows 交付

- [ ] Task 26：一致性备份与事务恢复
- [ ] Task 27：幂等 Windows 安装启动
- **Status:** pending

### Wave 7: 产品收口与发布验收

- [ ] Task 28：总控台、设置、离线和无障碍体验
- [ ] Task 29：完整 Playwright 黄金路径与发布门禁
- **Status:** pending

## Key Questions

1. 当前受支持的 Node 24.19.0 / pnpm 11.22.0 环境如何在本机稳定复现？
2. Task 13 的成本模型是否覆盖固定、按件、按订单、按收入和估算/待确认状态？
3. 拼多多默认规则包中哪些规则能标记 verified，哪些必须 needs_review？
4. DeepSeek 配置、调用日志和备份如何持续证明不泄露密钥？
5. 最终黄金路径是否能在 Windows 和 Ubuntu 的全新工作区重复通过？

## Decisions Made

| Decision                                     | Rationale                                        |
| -------------------------------------------- | ------------------------------------------------ |
| 以 2026-08-31 master plan 为唯一剩余范围计划 | 旧计划复选框未随实现更新，容易误判进度           |
| 保留原 Task 12–29 编号                       | 与设计、提交历史和既有任务描述保持可追踪性       |
| 按 7 个依赖波次串行推进                      | 财务、规则、AI、内容、工作流和交付之间存在硬依赖 |
| 每次只允许一个任务 in_progress               | 降低跨模块半成品和回归风险                       |
| 不使用真实付费 AI 完成自动测试               | 可重复、无费用且避免泄露凭据                     |

## Errors Encountered

| Error                                                     | Attempt | Resolution                                                                                       |
| --------------------------------------------------------- | ------: | ------------------------------------------------------------------------------------------------ |
| 旧 graphify 图只覆盖设计文档，查询当前进度无匹配节点      |       1 | 改用提交历史、源码、路由和测试证据建立基线                                                       |
| 当前终端 Node 26.4 / pnpm 11.19 与锁定版本不符            |       1 | 未重装依赖；实施前先恢复受支持工具链                                                             |
| 从仓库根直接扫全部 Vitest 导致重复 dist 和错误 cwd 假失败 |       1 | 按各 workspace 的真实 cwd 复核，关键测试通过                                                     |
| GitHub HTTPS 默认路由连续空响应/超时                      |       2 | 诊断为 IPv6 路由异常；仅对本次 Git 命令绑定 GitHub IPv4 后推送成功                               |
| Phase 3 E2E 的“已验证”同时命中结果和历史                  |       1 | 按结果面板与指标语义收紧定位器；Phase 2/3 E2E 共同通过                                           |
| 初版定价 solver 对公式分段作单调性假设                    |       1 | 独立审查复现漏选全局最低价；改为有复合工作预算的有界穷举，并覆盖六种比较符、有理阈值和非单调窗口 |
| 全仓并发密钥测试偶发读取已原子改名的 owner 文件           |       1 | 锁状态读取遇到瞬时 `ENOENT` 时重新扫描目录；连续三轮 workspace 测试及全仓测试通过                |
| 浏览器驱动不支持 `networkidle` 等待条件                   |       1 | 改用 `domcontentloaded` 并通过真实 DOM、接口结果与历史记录完成页面验收                           |

## Notes

- 开始任何实现前先读 master plan、findings 和 progress。
- 完成任务后同步更新四个文件中的状态与证据。
- 未通过聚焦测试、相关 workspace 测试和构建时不得标记 complete。
- 任何新范围先写进 master plan，再进入实现。
