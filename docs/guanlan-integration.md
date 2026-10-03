# 观澜接入边界

> 本文件落实 `GUANLAN_TASKS.md`（2026-10-03）的既定契约；冲突处以该任务书为准。

## 〇、子项目命名约定（2026-10-03 定）

两个学科专题子项目按观澜命名方式（学科惯称 + 四字功能词，同构于公共板块"真题分析/时政热点/资料库"，副标 `｜观澜考研政治知识库`）:

| 子项目 | 工程根目录 | 板块中文标题 | 完整页标题 | 副标题 |
|---|---|---|---|---|
| 史纲 | `D:\code_files\考研政治工程文件\近现代史时间轴` | **史纲时间轴** | `史纲时间轴｜观澜考研政治知识库` | 1839—2009 近现代史交互时间轴：双来源日期对照、同期观察与主动回忆。 |
| 马原 | `D:\code_files\考研政治工程文件\马原知识宇宙` | **马原原理库** | `马原原理库｜观澜考研政治知识库` | 马原核心原理与范畴：概念导图、原著线索与真题切入。 |

嵌入标题由观澜 `pages` 的 `useHead` 设定；两子项目独立运行时分别保留"近现代史时间实验室 / 马原知识宇宙"作为产品名，不因此改代码。

## 一、嵌入方式（已定）

史纲探索组件（`packages/history-ui`）源码复制进观澜 `apps/web/components/history/`，观澜 `pages/history/index.vue` 用 `<ClientOnly>` 挂载；本仓库保留为上游，重要改动单向同步。内容、学习记录、身份全部由观澜接口提供，本项目不建账号/后端/服务端判分。

## 二、宿主挂载（任务 3）

`createGuanlanHistoryApp` 工厂一行完成装配：

```ts
import { createGuanlanHistoryApp } from '@history/ui';
import { GuanlanHistoryRepository, GuanlanStudyRepository } from '@history/adapters';

const repository = new GuanlanHistoryRepository({
  fetch: $fetch,
  contentEndpoint: '/api/v1/history/events',
  authHeaders: () => useRequestHeaders(['cookie']), // 或读 guanlan.token
  resolveSourceUrl: (id, page) => `/documents/${id}.pdf${page ? `#page=${page}` : ''}`,
});
const studyRepository = new GuanlanStudyRepository({
  fetch: $fetch,
  authHeaders: () => useRequestHeaders(['cookie']),
  apiBase: '',
  localName: `history-study-${userId}`,   // 按账号隔离，切账号不串
  onAuthRequired: () => navigateTo(`/login?redirect=${route.fullPath}`),
});
createGuanlanHistoryApp({ mount: '#history-app', repository, studyRepository, route });
```

`HistoryExplorer` 也可单独使用，props 接受 `repository` / `studyRepository` / `router` / `initialQuery`。视觉保持独立档案馆设计令牌，只要求观澜提供容器尺寸，不引入观澜主题变量。

## 三、内容数据（任务 5.3）

`GET /api/v1/history/events` 返回 `{data: HistoryDataset}`，结构完全沿用 `data/history.v1.json`。`GuanlanHistoryRepository` 已实现 `{data}` 解包 + `validateDataset` 校验；`contentVersion` 用 `version` 字段，观澜更新内容须递增版本号以失效旧缓存。34 项待审核对照不得进入正式 `events`。

## 四、PDF 来源解析（任务 5.2）

线上禁止暴露 F/D 盘路径（`apps/explorer/vite.config.ts` 的 `/sources/*.pdf` 仅本机开发）。注入 `resolveSourceUrl(documentId, page)` 把 `original`/`textbook` 映射为观澜文档 URL，`isPublicUrl` 校验保留，非法返回 `null`。`page` 为 PDF 文件实际页序。两种部署二选一：

- **静态**：PDF 放观澜 nginx 公开目录，`resolveSourceUrl = (id, page) => \`/documents/${id}.pdf${page ? \`#page=${page}\` : ''}\``（适合公开教材）。
- **鉴权 API**：`GET /api/v1/documents/{id}?page=N` 带 token + Range，`resolveSourceUrl = (id, page) => \`/api/v1/documents/${id}${page ? \`?page=${page}\` : ''}\``（适合限制下载）。

## 五、学习记录（任务 1/4）

`GuanlanStudyRepository` 实现 `StudyRepository`：

- 收藏：`GET/PUT /api/v1/study/favorites`（PUT 幂等，`targetType` 为 `history_event`/`history_comparison`，`url` 传 `/history/?event={id}` 深链）。
- 笔记：`GET/POST/PATCH/DELETE /api/v1/study/notes`（编辑前重新拉取，以观澜 `updatedAt` 新者为准，≤20000 字）。
- 进度：`GET/POST /api/v1/study/progress`，`scope='history'`，视图级 `ref='view:timeline'`，`label` 存视图快照。
- **attempts（排序/回忆作答）只留本地 IndexedDB 与导出备份，不写入观澜**（避免与真题统计混淆）。
- 只读免登录；写操作无 token 时提示并走 `onAuthRequired`；401 停写保留本地待同步；观澜不可用回退 IndexedDB，恢复在线后以观澜为权威做一次性合并；`localName` 按账号区分实现双账号隔离。

## 六、路由适配（任务 2）

独立模式沿用 `#/explore?event=..` hash 实现（`createHashRouter`）。观澜模式用 `createGuanlanRouter({ route, basePath })` 把导航/时间窗口/选中/筛选映射到 Nuxt query，深链 `/history/?event={id}` 打开即定位选中，登录后恢复目标；手机端纵向窗口与底部面板同样可用。观澜收藏列表 `url` 字段即跳回该深链。

### 宿主薄封装（§4.3 嵌入承载时实现，已定）

`createGuanlanRouter` 与 `createGuanlanHistoryApp` 维持现状，观澜 `pages/history/index.vue` 只需提供两层薄封装：

1. **路由薄封装**：注入 `{ get query(){ return route.query }, push, replace }`。`query` 必须用 getter，保证 `parse()` 每次读到 Nuxt 最新值（本组件 `parse()` 每次现读 `route.query`，已实现并有单测覆盖）；`GuanlanRouterLike` 契约不变。
2. **前进/回退**：组件 `listen` 为空实现、不轮询。观澜宿主 `watch(() => route.query, ...)` 并用 `:key` 强制重挂载；新组件实例挂载时经 `parse()` 自恢复选中与视图。这是 Nuxt 路由职责，不在组件内处理。

## 七、不变量（§四 不做的事）

不把 34 项待审核对照或未定位事项写进正式 `events` 或训练答案；不把 F/D 盘路径、PDF 绝对路径放进任何线上接口或备份；不把排序回忆作答写入观澜真题 attempts；保持独立档案馆视觉，不要求观澜采用本项目视觉。
