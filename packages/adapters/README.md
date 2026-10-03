# Repository 适配器契约

适配器实现 `@history/core` 的 `HistoryRepository` 与 `StudyRepository`。核心与界面不依赖观澜运行；观澜适配器仅提供可配置的只读合同，不表示真实接口、账号权限或同步已经上线。

## 独立内容

```ts
const history = new LocalHistoryRepository({
  dataUrl: '/data/history.v1.json',
  sourceBaseUrl: '/sources',
});
const dataset = await history.loadDataset();
```

`dataUrl` 默认 `/data/history.v1.json`，`sourceBaseUrl` 默认 `/sources`；可注入 `fetch`。加载校验主题、来源与事件唯一 ID、引用、完整字段、有限日期及发布状态。日期断言的起止值使用 UTC epoch 毫秒；整体范围与视图窗口使用十进制年份。`original` 发布需存在非待审原表断言，`verified` 需存在已确认断言，待审或无日期记录不能标为可训练。`comparisons` 始终保留 `pending`，不提升为正式事件。

验证成功的数据按 `dataUrl` 保存到独立 IndexedDB `history-content-cache-v1` 的 `datasets` store。网络失败或 HTTP 非成功状态才尝试已验证缓存；JSON 或结构校验错误直接报错，且不覆盖有效旧缓存。缓存读出时再次校验。无有效缓存时拒绝加载。

`history.status` 在每次加载后提供 `source`（`network` / `cache` / `null`）、`persistence`（`available` / `unavailable`）与 `warning`。在线读取成功但无法缓存时允许阅读，并明确报告离线保存不可保证。UI 应展示 `warning`。

`sourceUrl(id, page)` 仅接受 `original`、`textbook`，返回 `{sourceBaseUrl}/{id}.pdf#page=N`。省略或传 `null` 页码时省略 anchor；非正整数页码及未知 ID 返回 `null`。不从 `fileName` 拼接任意路径，不暴露 F/D 盘或 `file:` 路径。配置的地址只能是 HTTP(S) 或公开相对 URL。

PDF 不由本适配器缓存或打包。开发服务器的来源解析由宿主负责；静态部署应提供对应 `/sources` 文件，或配置可访问的 `sourceBaseUrl`。UI 应注明“原页需要联网，静态部署未提供 PDF 时暂不可用”，链接不能作为 PDF 已存在的证明。

## 本地学习状态

```ts
const study = new IndexedDbStudyRepository('history-study-v1', 'history.v1');
const state = await study.load();
await study.save(state); // 只有 resolve 后才能提示“已保存”
const backupText = await study.exportBackup();
const merged = await study.importBackup(backupText);
```

第一参数为数据库名称，默认 `history-study-v1`；第二参数为导出标注的内容版本，默认 `history.v1`。内容版本是来源信息，不限制不同内容版本的学习记录迁移。`createEmptyStudyState()` 返回独立空状态。数据库存在且尚无记录时才返回空状态；IndexedDB 缺失、被阻塞、打开失败、损坏记录或事务失败均拒绝操作。无静默内存替代。

记录字段为 `{version:1,bookmarks,notes,attempts,view}`。记录与备份严格检查必需字段、版本、字符串、布尔、练习模式、ISO 日期、完整视图、有限且递增的窗口、数组和条目大小。防止 `__proto__`、`constructor`、`prototype` 键。日期校验拒绝不存在的日历日期，支持带时区与小数秒的 ISO 时间。

JSON 备份包络仅接受：

```json
{
  "version": 1,
  "contentVersion": "history.v1",
  "exportedAt": "2026-10-03T00:00:00.000Z",
  "state": {
    "version": 1,
    "bookmarks": [],
    "notes": {},
    "attempts": [],
    "view": null
  }
}
```

备份文件上限 5,000,000 UTF-8 字节；ID 上限 256 字符，书签/笔记/练习各上限 10,000 条，单条笔记/答案上限 100,000 字符，练习事件最多 1,000 项，查询最多 10,000 字符。未知额外学习字段、非字符串笔记与类型不符的视图均拒绝。

导入合并在同一 readwrite 事务内完成：书签取并集；笔记冲突保留现有值（包括现有空字符串）；练习按 ID 去重，现有项优先；现有非空视图优先。验证失败或合并超出限制不产生写入。调用入队时保存状态快照；同数据库的本页多个实例串行执行操作，避免较早保存与导入读写交错。事务提交后才 resolve。跨标签导入的读/写也使用同一事务，但全状态 `save` 为替换语义；UI 不应把陈旧页面的全状态自动同步到其他标签。当前没有跨标签实时刷新或观澜学习记录写入。

## 观澜只读接入

```ts
const history = new GuanlanHistoryRepository({
  fetch: hostFetch,
  contentEndpoint: '/api/v1/history/events',
  authHeaders: () => hostAccountContext.headers(),
  resolveSourceUrl: (documentId, page) => hostDocuments.publicPageUrl(documentId, page),
});
```

`fetch` 与同步的 `resolveSourceUrl(documentId, page)` 必须由宿主注入。内容端点默认 `/api/v1/history/events`；认证 header 回调可同步或异步，每次加载调用。内容响应需为 `{data: HistoryDataset}`，适用与独立数据相同的校验。HTTP 错误、缺失包络与无效数据均拒绝。

来源地址由宿主文档服务按 documentId 解析；返回 `null` 表示暂不可访问。适配器过滤本地文件路径、非 HTTP(S) 协议、带用户名密码的地址与非法页码。账号凭证由宿主 header 上下文提供，本包不创建登录页、不读取本机凭证、不将 token 写入 URL。接入前仍须确认真实接口、账号隔离与文档访问规则。未定义或假装启用收藏、笔记和作答记录服务端写入。

## 验证

运行 `npm test -- tests/adapters.test.ts`。测试使用真实 IndexedDB API 的 `fake-indexeddb`，覆盖真实项目数据包、离线恢复、缓存保护、备份迁移/合并、类型与大小限制、并发调用、存储不可用和事务失败；观澜测试仅验证上述合同，不连接线上服务。
