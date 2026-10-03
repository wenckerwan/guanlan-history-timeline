# 近现代史时间实验室 Implementation Plan

> **For agentic workers:** Use subagent-driven-development to implement independent tasks in this session, with tests and a final review. Steps use checkbox syntax for tracking.

**Goal:** Build a standalone Vue history explorer with precise source-aware dates, comparison, active recall and persistent local learning state; leave an explicit adapter contract for Guanlan.

**Architecture:** Vite app consumes a reusable Vue UI, a framework-independent TypeScript history core, and repository adapters. Versioned source data remains under the engineering root; PDF files are served by a local document resolver without putting drive paths into the public dataset.

**Tech Stack:** Vue 3, TypeScript, Vite, Vue Router, IndexedDB, SVG, Vitest and Playwright.

## Global Constraints

- All engineering code, data, logs, screenshots and build outputs stay in `D:\code_files\考研政治工程文件\近现代史时间轴`.
- Original PDF and Obsidian learning documents in F drive are preserved.
- Textbook edition is 2023. Show source immediately after each displayed date in the evidence panel.
- Draft additions, post-2009 extensions and speculative relations do not enter the published explorer or training.
- Year/month dates remain intervals; same-period events cannot be falsely marked in the wrong order.
- Original merged groups remain available with group IDs and source-page links; independent event mappings require explicit source evidence.
- No changes to Guanlan or new account system.

## Tasks and file boundaries

1. Core and validated data: `packages/history-core/src/{types,index}.ts`, `tests/core.test.ts`, `tools/build_dataset.py`, `data/history.v1.json`. Tests cover year/month/day ranges, overlap-aware ordering, training eligibility, filters and selected-event-centered zoom. Run `npm test -- tests/core.test.ts`, first failing and then passing.
2. Adapters and source resolution: `packages/adapters/src/{index,storage}.ts`, `tests/adapters.test.ts`, `tools/document-plugin.ts`. IndexedDB must persist and restore bookmarks, notes, attempts and view state, report failures, import validated backups without silently overwriting current data. Guanlan repository consumes configured `/api/v1` envelope and leaves unsupported writes explicit. Run adapter tests before UI integration.
3. New frontend: `packages/history-ui/src/HistoryExplorer.vue`, focused components and design tokens; `apps/explorer/src/{main,App}.ts/vue`. Test initially missing app via Playwright smoke, then implement exploration, timeline scale/drag, topic tracks, evidence, 2–3-item comparison, active recall, local study records and responsive navigation. No UI dependency on Guanlan styles.
4. Integration and browser acceptance: `tests/e2e/*.cjs`, `README.md`, `docs/guanlan-integration.md`. Run typecheck, unit tests, app+library build and browser flows for search, zoom, interval display, source resolution, comparison, training, reload persistence, export/import, navigation restoration, mobile layout and offline warmed application. Review implementation, fix consequential findings, then rerun affected checks.

## Progress

- [x] Core tests and versioned data
- [x] Persistence, repositories and local source resolver
- [x] New frontend
- [x] Integration, browser acceptance and final review

## Execution notes

Use `npm.cmd` on Windows and the available Node runtime. `npm run dev -- --host 127.0.0.1` starts local preview; `npm run build` produces deployable static app and embeddable Vue library in the engineering directory. The source resolver reads only the two known PDF files; standalone static hosting requires explicitly configured document URLs. Test artifacts remain under `artifacts/`.

## 完成记录（2026-10-03）

- 124 个原表组全文保留、103 个独立事项、35 个同日期教材核验训练项、34 项待审日期对照。
- 日期/存储/内容验证共 47 项单元测试通过；Vue TypeScript 检查与 app/library 构建通过。
- 生产浏览器验收 13 场景覆盖主题、直接拖动、来源PDF Range、笔记/收藏刷新、三事件上限、前进返回、待审隔离、回忆排序、导入导出、全部档案、390px、读取故障不覆盖、预热离线、运行错误。
- 独立复核发现并修复：离线 Worker 过宽缓存账号接口、读取学习记录失败自动保存空状态、在线静态部署PDF服务限制无提示。Worker 仅缓存应用白名单；读取失败保持只读直至恢复。
- 本机生产预览端口4173；实际观澜服务接入留待后续。
