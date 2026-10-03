# 观澜融入开发任务书（近现代史时间实验室）

> 日期：2026-10-03 ｜ 状态：观澜侧契约已确认，本文档为子项目开发依据。
> 观澜工程：`D:\code_files\观澜｜考研政治知识库 - 副本\guanlan`（Nuxt 3 前端 + Hyperf 3.1/PHP 后端 + MySQL）
> 本文替代此前 `docs/guanlan-integration.md` 与 `docs/独立子项目方案_2026-10-03.md` §6 的开放问题；以本文为准。

## 一、架构决策（已定，不得变更）

**融入模式：前端组件嵌入 + 观澜数据/学习接口。**

与马原不同，本项目**无后端、纯静态**，因此不走 Bearer 直通、不走摘要同步。融入方式是：

- 史纲探索组件（`history-ui`）**源码复制进观澜** `apps/web/components/history/`，观澜新增页面 `/history/` 承载。本仓库保留为"上游"，重要改动单向同步到观澜。
- 内容数据：由观澜 `GET /api/v1/history/events` 提供（包装 `history.v1.json`，`{data: HistoryDataset}` 包络）。
- 学习记录（收藏/笔记/进度）：权威存储在观澜，复用现有 `/api/v1/study/*`。
- 身份：复用观澜 Cookie `guanlan.token`；只读探索可不登录，写操作（收藏/笔记/进度）需登录。
- 不建第二套账号、不建独立后端、不做服务端判分（本项目无判分概念，先后排序回忆的对错在浏览器本地算，仅代表当前用户作答）。

## 二、观澜侧已确认的接口契约

### 2.1 内容数据（观澜将新建）

```
GET {GUANLAN_API}/api/v1/history/events
Authorization: Bearer <guanlan.token>   （可选；不登录也可读）
→ { "data": <HistoryDataset> }
```

`HistoryDataset` 结构**完全沿用** `data/history.v1.json` 顶层字段：
`version / title / range / topics / sources / events / comparisons / generatedAt`。

**开发要求**：
- 本项目 `GuanlanHistoryRepository`（`packages/adapters/src/index.ts`）已实现读取 `{data}` 包络 + `validateDataset` 校验，**字段结构不得变更**，只改 endpoint 与注入的 `fetch`/`authHeaders`/`resolveSourceUrl`。
- `contentVersion` 用数据包 `version` 字段；观澜更新内容后版本号必须递增，前端据此失效旧缓存。
- 待审核数据（34 项对照、`待审核数据.json`）**不得**进入该接口的正式 `events`；保持现有"发布/待审"分离。

### 2.2 PDF 来源解析（观澜将新建文档服务）

线上不能暴露 F 盘/D 盘本地路径（当前 `apps/explorer/vite.config.ts` 的 `/sources/*.pdf` 仅是本机开发用）。

观澜将提供按文档标识 + Range 的 PDF 服务：

```
GET {GUANLAN_API}/api/v1/documents/{documentId}?page=N
（或静态化：/documents/{documentId}.pdf#page=N，由观澜部署决定，见任务 5）
```

**开发要求**：
- 注入 `resolveSourceUrl(documentId, page)`：把 `sourceId ∈ {original, textbook}` 映射为观澜文档 URL，**禁止**拼接任何本地盘符路径。
- `page` 为 PDF 文件实际页序（非印刷页码），保持现有 `DateAssertion.page` 语义。
- 现有 `isPublicUrl` 校验保留：解析结果必须是公开相对或 HTTP(S) URL，否则返回 null。

### 2.3 收藏（观澜权威，复用现有接口）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/study/favorites?targetType=history_event` | 列表 |
| PUT | `/api/v1/study/favorites` | **幂等**（观澜将新增）：`{targetType, targetId, title, url, favorited: bool}`，重试安全 |
| POST | `/api/v1/study/favorites` | 切换语义（重试不安全，勿用于写入） |
| DELETE | `/api/v1/study/favorites/{id}` | 删除 |

**史纲对象类型（观澜白名单将加入，共 2 类）**：
`history_event`、`history_comparison`

**开发要求**：
- 写收藏**一律用 PUT 幂等接口**。
- `targetId` 用稳定 `event.id` / `comparison.id`（如 `p1-r001`），≤191。
- `url` 传站内 `/history/?event={id}`（相对路径），观澜收藏列表据此跳回并定位到该事件（见任务 3 路由适配）。
- `title` 传事件/对照当前标题快照。

### 2.4 笔记（观澜权威，复用现有接口）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/study/notes?targetType=&targetId=` | 列表 |
| POST | `/api/v1/study/notes` | 新建 `{targetType, targetId, title, content}`，≤20000 字 |
| PATCH | `/api/v1/study/notes/{id}` | **编辑**（观澜将新增）`{content}` |
| DELETE | `/api/v1/study/notes/{id}` | 删除 |

类型同收藏 2 类。冲突策略：编辑前重新拉取，以观澜 updatedAt 新者为准（v1 不做自动合并）。

### 2.5 学习进度（观澜权威，复用现有接口）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/study/progress` | 当前用户全部进度 |
| POST | `/api/v1/study/progress` | upsert：`{scope, ref, label, status, progress}` |

**史纲约定**：
- `scope = 'history'`。
- `ref`：视图级进度用 `view:<视图名>`（如 `view:timeline`、`view:compare`）；事件级用 `event:<event.id>`。
- `status`：`reading` / `practising`；`progress` 0-100。
- 本地 IndexedDB 保留为**离线缓存**：登录后按用户从观澜拉取合并；未登录仅本地（与现状一致），并明确提示"本地保存，登录后同步"。

**开发要求**：
- 实现 `GuanlanStudyRepository`（见任务 1），`load/save` 调上述接口；`exportBackup/importBackup` 保持现有 JSON 格式不变（含 `contentVersion`），导入去重逻辑沿用。
- 排序回忆的作答记录（`attempts`）**留在本地/导出备份**，不写入观澜 `/study/attempts`（避免与真题统计混淆，观澜已确认）；观澜 `progress` 只记宏观进度与计数。

## 三、史纲侧开发内容（按依赖排序）

### 任务 1：`GuanlanStudyRepository`（adapters）｜优先级 P0

在 `packages/adapters/src/` 新增，实现 `@history/core` 的 `StudyRepository` 接口：

1. 构造注入 `{ fetch, authHeaders, apiBase }`；`authHeaders` 由观澜宿主提供（读 `guanlan.token`）。
2. `load()`：聚合观澜 `favorites`（history_* 类型）+ `notes` + `progress`（scope=history）→ 映射为 `StudyState`（bookmarks/notes/view；attempts 仍走本地）。
3. `save()`：把 bookmarks/notes 变化写入观澜（幂等 PUT / POST / PATCH / DELETE），view 写 `progress`。
4. 离线降级：观澜不可用时回退 IndexedDB 读写，并在 UI 提示"本地保存，联网后同步"；恢复在线后做一次性合并（观澜为权威，冲突取新）。
5. 复用现有 `validateStudyState` / `parseBackup`，导入去重（attempt.id）逻辑不变。

### 任务 2：路由适配（explorer / 嵌入层）｜优先级 P0

`docs/guanlan-integration.md` 已明确：独立应用用 hash 存导航/选择并监听前进返回，**嵌入观澜时须映射到宿主路由**。

1. 抽出现有 hash 状态（时间窗口 start/end、选中 eventId、topicId 筛选、视图）为可注入的 `HistoryRouter` 接口：
   - 独立模式：现有 hash 实现（不变）。
   - 观澜模式：读写 Nuxt 路由 query（`/history/?event=..&topic=..&from=..&to=..`），支持观澜收藏 `/history/?event={id}` 深链定位。
2. 深链接：带 `?event={id}` 打开时自动定位并选中该事件；登录后恢复目标。
3. 手机端：保留纵向时间窗口与底部详情面板，深链同样可用。

### 任务 3：观澜宿主集成（apps/explorer 提供嵌入入口）｜优先级 P0

1. 导出稳定的嵌入组件（沿用 `HistoryExplorer`，`packages/history-ui`），props 接受 `repository` / `studyRepository` / `router` / `initialQuery`。
2. 提供 `createGuanlanHistoryApp(options)` 工厂：内部组装 `GuanlanHistoryRepository` + `GuanlanStudyRepository` + 观澜路由适配，供观澜 `pages/history/index.vue` 一行挂载（`ClientOnly`）。
3. 视觉保持独立设计令牌（档案馆风），只要求观澜提供容器尺寸；不引入观澜主题变量。
4. 加载失败重试、PDF 不可用的明确标注，保持现状。

### 任务 4：登录态与权限（轻量）｜优先级 P0

1. 只读探索：无需登录（内容接口不强制鉴权）。
2. 写操作（收藏/笔记/进度同步）：无 token 时提示并跳观澜 `/login?redirect=/history/<当前>`；登录后恢复。
3. token 失效：写操作 401 → 停写并保留本地待同步，重新登录后合并。
4. 双账号隔离：观澜接口已按用户隔离，本项目不在前端缓存中存他人数据；切账号时清空内存态并重拉。

### 任务 5：部署配合（运维）｜优先级 P1

1. 组件源码复制进观澜构建：观澜 `apps/web` 引入 `history-ui`（复制源码或 workspace），`pages/history/index.vue` 挂载。本仓库 `dist/lib` 构建保留给独立模式。
2. PDF 服务：与观澜确定二选一——
   - **静态**（简单）：PDF 放观澜 nginx 公开目录 `/documents/original.pdf`、`/documents/textbook.pdf`（可下载，适合公开教材）。
   - **鉴权 API**（可控）：`GET /api/v1/documents/{id}` 带 token + Range（适合限制下载）。
   - `resolveSourceUrl` 按最终选择实现；本机开发仍可用 `vite.config.ts` 的本地映射。
3. 数据更新：`tools/build_dataset.py` 产物 `history.v1.json` 交给观澜入库/发布；版本号递增，待审核数据不入正式发布。

### 任务 6：回归与联调｜优先级 P0（随各任务）

- `npm test`、`npm run typecheck`、`npm run test:e2e` 保持全绿。
- 新增：`GuanlanStudyRepository` 单测（fake-indexeddb + mock fetch）、路由适配双模式测试。
- 真实观澜联调：深链定位、收藏重试、笔记编辑、双账号隔离、离线合并。

## 四、不做的事（明确边界）

- ❌ 不建账号/后端/服务端判分。
- ❌ 不把 34 项待审核对照或未定位事项写进正式 `events` 或训练答案。
- ❌ 不把 F 盘/D 盘路径、本地 PDF 绝对路径放进任何线上接口或备份。
- ❌ 不把排序回忆作答写入观澜真题 attempts。
- ❌ 不要求观澜采用本项目视觉；保持独立档案馆设计。

## 五、验收清单（融入专项）

- [ ] 观澜 `/history/` 页面嵌入组件正常渲染，保留独立视觉。
- [ ] 只读探索无需登录；收藏/笔记/进度写操作登录后可用。
- [ ] 内容来自观澜 `/api/v1/history/events`，`{data}` 包络，版本号递增可失效旧缓存。
- [ ] 深链 `/history/?event={id}` 打开即定位选中；登录后恢复目标；手机可用。
- [ ] 收藏重试不意外取消；笔记编辑不产生重复；双账号互相不可见、切账号不串。
- [ ] PDF 来源经 `resolveSourceUrl` 解析为观澜 URL，无本地盘符泄露；Range 加载原页正常。
- [ ] 离线可读已加载内容 + 本地记录，联网后按观澜权威合并，导入去重。
- [ ] 待审核数据不进入正式发布或训练答案；模糊日期无伪精度。
- [ ] `npm test` / `typecheck` / `e2e` 全绿；真实观澜双账号联调通过后才宣称"已接入"。

## 六、关键文件索引（开发时对照）

| 内容 | 文件 |
|---|---|
| 观澜内容读取适配 | `packages/adapters/src/index.ts`（`GuanlanHistoryRepository`） |
| 本地学习存储 | `packages/adapters/src/index.ts`（`IndexedDbStudyRepository`）、`indexed-db.ts` |
| 数据/备份校验 | `packages/adapters/src/validation.ts` |
| 可嵌入组件 | `packages/history-ui/src/`（`HistoryExplorer`） |
| 独立应用/hash 路由 | `apps/explorer/src/App.vue`、`apps/explorer/vite.config.ts` |
| 数据构建 | `tools/build_dataset.py`、`data/history.v1.json`、`data/event-map.tsv` |
| 融入边界说明 | `docs/guanlan-integration.md`、`docs/独立子项目方案_2026-10-03.md` §6（本文 §一已收敛其开放项） |
