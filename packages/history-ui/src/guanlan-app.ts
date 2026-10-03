import { createApp, h, type App } from 'vue';
import type { HistoryRepository, StudyRepository } from '@history/core';
import HistoryExplorer from './HistoryExplorer.vue';
import { createGuanlanRouter, createHashRouter, type GuanlanRouterLike, type HistoryRouter } from './router';

export interface CreateGuanlanHistoryAppOptions {
  /** 观澜挂载点（CSS 选择器或元素）。 */
  mount: string | Element;
  /** 内容仓库（宿主用 GuanlanHistoryRepository 构造后注入）。 */
  repository: HistoryRepository;
  /** 学习仓库（宿主用 GuanlanStudyRepository 构造后注入）。 */
  studyRepository: StudyRepository;
  /** Nuxt 路由适配（useRoute() 的薄封装）；不提供则用 hash 路由（纯静态宿主/演示）。 */
  route?: GuanlanRouterLike;
  /** 页面路径，默认 /history/。 */
  basePath?: string;
  /** 复用已构造的 router（测试用）；不提供则由 route 创建。 */
  router?: HistoryRouter;
}

/**
 * 观澜宿主一行挂载工厂（供 pages/history/index.vue 在 <ClientOnly> 内调用）。
 * 内部组装 HistoryExplorer + 观澜路由适配；内容与学习仓库由宿主注入，
 * 视觉令牌独立，仅需要观澜提供容器尺寸。
 */
export function createGuanlanHistoryApp(options: CreateGuanlanHistoryAppOptions): App {
  const router = options.router ?? (options.route ? createGuanlanRouter({ route: options.route, basePath: options.basePath }) : createHashRouter());
  const app = createApp({
    render: () => h(HistoryExplorer, {
      repository: options.repository,
      studyRepository: options.studyRepository,
      router,
    }),
  });
  app.mount(options.mount);
  return app;
}
