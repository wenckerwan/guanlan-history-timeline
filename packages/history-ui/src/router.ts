import type { ViewState } from '@history/core';

/** 组件当前可序列化的导航状态（导航 + 视图）。 */
export interface HistoryRouteState {
  nav: string;
  view: ViewState;
}

/**
 * 可注入的历史路由契约：独立模式用 hash，观澜模式映射 Nuxt query。
 * 组件只依赖该接口，不直接读写 location/Nuxt。
 */
export interface HistoryRouter {
  /** 解析当前 URL，返回初始状态；无法解析的字段回退 null。 */
  parse(): { nav: string | null; view: Partial<ViewState>; selectedId: string | null };
  /** 把组件状态写回 URL；push 区分“前进/回退”与“替换”。 */
  write(state: HistoryRouteState, push: boolean): void;
  /** 订阅宿主路由变化（浏览器前进/回退、观澜收藏跳入）；返回取消订阅函数。 */
  listen(callback: () => void): () => void;
  /** 生成某事件的站内深链（观澜收藏 url 用）。 */
  eventUrl(eventId: string): string;
}

const NAVS = new Set(['explore', 'compare', 'practice', 'study']);

export function parseViewParams(params: URLSearchParams): { view: Partial<ViewState>; selectedId: string | null } {
  const view: Partial<ViewState> = {};
  if (params.has('start') && params.has('end')) {
    const start = Number(params.get('start')), end = Number(params.get('end'));
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) { view.start = start; view.end = end; }
  }
  if (params.has('q')) view.query = params.get('q') ?? '';
  if (params.has('topics')) view.topicIds = (params.get('topics') ?? '').split(',').filter(Boolean);
  if (params.has('compare')) view.compareIds = (params.get('compare') ?? '').split(',').filter(Boolean).slice(0, 3);
  if (params.has('archive')) view.archive = params.get('archive') === '1';
  const selectedId = params.has('event') ? params.get('event') || null : null;
  return { view, selectedId };
}

export function viewToParams(state: HistoryRouteState): URLSearchParams {
  const v = state.view;
  return new URLSearchParams({
    start: v.start.toFixed(4),
    end: v.end.toFixed(4),
    event: v.selectedId ?? '',
    compare: v.compareIds.join(','),
    q: v.query,
    topics: v.topicIds.join(','),
    archive: v.archive ? '1' : '0',
  });
}

/** 独立模式：沿用现有 `#/nav?start=..&end=..&event=..` hash 实现。 */
export function createHashRouter(): HistoryRouter {
  const read = () => {
    const [path = '', search = ''] = (typeof location !== 'undefined' ? location.hash.slice(1) : '').split('?');
    const nav = NAVS.has(path.replace(/^\//, '')) ? path.replace(/^\//, '') : null;
    const { view, selectedId } = parseViewParams(new URLSearchParams(search));
    return { nav, view, selectedId };
  };
  return {
    parse: read,
    write(state, push) {
      if (typeof location === 'undefined') return;
      const hash = `#/${state.nav}?${viewToParams(state)}`;
      if (location.hash !== hash) history[push ? 'pushState' : 'replaceState'](null, '', hash);
    },
    listen(callback) {
      if (typeof window === 'undefined') return () => undefined;
      window.addEventListener('hashchange', callback);
      window.addEventListener('popstate', callback);
      return () => { window.removeEventListener('hashchange', callback); window.removeEventListener('popstate', callback); };
    },
    eventUrl: eventId => `#/explore?event=${encodeURIComponent(eventId)}`,
  };
}

export interface GuanlanRouterLike {
  /** 当前路由 query（Nuxt useRoute().query 同名字段，值为 string | string[]）。 */
  query: Record<string, unknown>;
  /** 写回路由；对应 Nuxt navigateTo({ query }, { replace: !push })。 */
  push(query: Record<string, string>): void;
  replace(query: Record<string, string>): void;
}
export interface GuanlanRouterOptions {
  route: GuanlanRouterLike;
  /** 页面路径，默认 /history/；生成的 eventUrl 会带上。 */
  basePath?: string;
}

const queryValue = (value: unknown): string => Array.isArray(value) ? String(value[0] ?? '') : typeof value === 'string' ? value : '';

/** 观澜模式：读写 Nuxt 路由 query，深链 `/history/?event={id}`。 */
export function createGuanlanRouter(options: GuanlanRouterOptions): HistoryRouter {
  const basePath = options.basePath ?? '/history/';
  const toParams = () => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.route.query)) {
      const text = queryValue(value);
      if (text) params.set(key, text);
    }
    return params;
  };
  return {
    parse() {
      const params = toParams();
      const nav = NAVS.has(queryValue(options.route.query.nav)) ? queryValue(options.route.query.nav) : null;
      const { view, selectedId } = parseViewParams(params);
      return { nav, view, selectedId };
    },
    write(state, push) {
      const params = viewToParams(state);
      const query: Record<string, string> = { nav: state.nav };
      params.forEach((value, key) => { query[key] = value; });
      if (push) options.route.push(query); else options.route.replace(query);
    },
    listen() {
      // Nuxt 的 route.query 是响应式的，宿主可用 watch 触发组件刷新；此处无需订阅。
      return () => undefined;
    },
    eventUrl: eventId => `${basePath}?event=${encodeURIComponent(eventId)}`,
  };
}
