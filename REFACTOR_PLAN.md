# SGU ACW Rank 重构计划

## 已完成

### 第一批（初期重构）

- 加入 ClientRouter 顶部加载条和页面进入动画，并处理减少动态偏好。
- 修复桌面侧栏和手机底部导航在 ClientRouter 切页后不更新当前高亮的问题。
- 管理工作台导航改为桌面稳定、手机横向滚动的共享结构。
- 集训管理在手机端改成列表 → 详情 → 返回，空状态不再保留无意义的双栏。
- 文章管理在手机端改成列表 → 编辑 → 返回，并补上文章详情加载状态。
- 抽出统一的管理操作成功反馈组件，接入成员、题单、题解、文章、集训管理。
- 管理成员页接入学院 / 专业候选数据，并补上学院筛选。
- 题单编辑补上已有题单移动到合集 / 移出合集的能力。
- 成员详情改为通过统一 API 模块读取用户信息。
- 删除已舍弃的成员获奖空路由和 CPC Finder 死代码。
- 后端成员分页改为数据库 `COUNT`，集训列表统计改为聚合查询，减少内存加载和 N+1 查询。

### 第二批（集训状态机与站内信）

- 集训状态机：`scheduled → running → finalizing → finalized` 四阶段，截止后持久化。
- 历史完成也计分；洛谷无时间戳时以截止后首次同步快照为最终成绩。
- 截止后锁定题目、报名名单和时间；开始后成员不能自行取消报名。
- 最终同步逐账号重试，失败不覆盖已成功结果；封榜后导出结果与榜单一致。
- 重复题目、非法排序、跨集训排序请求均被服务端拒绝。
- 管理员手动加人触发平台同步加速。
- 新增 `CampFinalization`、`CampAccountResult` 持久化模型及对应 migration。
- 管理员站内信：同步失败、封榜等待超时、每日一题抽题失败、题解自动发布失败、API 5xx 触发通知。
- 相同故障合并计数，恢复后标记已恢复；管理员独立维护已读状态。
- 全量删除用户时同步清除 `CampRegistration` 和 `NotificationRead`，修复外键约束风险。
- 前端新增全局确认框、站内信铃铛、通知收件箱、集训榜单和状态提示组件。
- `AppNav` 补全 `/editorials/admin` 进入管理工作台高亮。
- 后端测试：368 项通过（含集训生命周期、站内信权限去重恢复、用户删除级联清理）。

### 第三批（导航统一与最终修复）

- 全站组件的页内跳转从 `window.location.href` 改为 Astro `navigate()`，ClientRouter 切页无全量刷新。
  - 受影响组件：`CampList`、`ProblemListEditor`、`ProblemListIndex`、`PracticeRank`、`BlogIndex`、`AccountPanel`、`ProblemListDetail`、`Dashboard`。
  - 保留两处合理的全量刷新：登出后跳首页（重置 session 状态）、登录成功后跳目标页（同）。
- `AppNav.isAdminRoute()` 补上 `/editorials/admin`，题解管理页高亮修复。
- `MobileTabBar.isAdminRoute()` 已包含 `/editorials/admin`，已同步。
- `app/cleanup.py` 删用户时新增清理 `CampRegistration` 和 `NotificationRead`，防止外键报错。
- 后端 Ruff 全量通过；前端 ESLint + `astro check` + build 全量通过。
- 最终测试：368 项通过。

## 架构备忘

### 技术栈

- 前端：Astro 5 静态输出、Vue 3、Tailwind、lucide-vue-next、SortableJS、Radix Vue
- 后端：Python 3.12、FastAPI + SQLModel + SQLite、uv
- 部署：前端 Cloudflare Pages（`pnpx wrangler`），后端 systemd + uvicorn（`root@154.9.228.109`）

### 关键路径

- 前端 API 全部走 `src/lib/api.ts`，生产由 `functions/api/[[path]].js` 转发到 `sgu-acw-api.hsn8086.com`。
- 同步服务 `sgu-acw-sync.timer` 每 5 分钟触发，负责平台过题抓取、每日一题抽取、集训结算、题解自动发布。
- 数据库位于 `/var/lib/sgu-acw/api.db`；备份脚本定期导出到 `/var/backups/`。

### 未纳入范围

- CPC Finder / 成员获奖：已确认下线，不恢复。
- 后端工作坊状态服务（`/status`）：独立维护，前端读取但不管理。
- 草稿 vs 已发布文章状态：现有"上架 / 下架"已满足需求，未拆分草稿态。
