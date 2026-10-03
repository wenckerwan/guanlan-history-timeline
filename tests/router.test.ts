import { describe, expect, it, vi } from 'vitest';
import { createGuanlanRouter, createHashRouter, parseViewParams, viewToParams, type GuanlanRouterLike, type GuanlanRouterOptions } from '../packages/history-ui/src/router';
import type { ViewState } from '@history/core';

const view: ViewState = { start: 1919.2, end: 1921.8, selectedId: 'p1-r001', topicIds: ['war'], query: '五四', compareIds: ['a', 'b'], archive: true };

describe('view <-> params roundtrip', () => {
  it('serializes all fields and parses them back', () => {
    const params = viewToParams({ nav: 'explore', view });
    const { view: parsed, selectedId } = parseViewParams(params);
    expect(parsed.start).toBeCloseTo(1919.2);
    expect(parsed.end).toBeCloseTo(1921.8);
    expect(parsed.query).toBe('五四');
    expect(parsed.topicIds).toEqual(['war']);
    expect(parsed.compareIds).toEqual(['a', 'b']);
    expect(parsed.archive).toBe(true);
    expect(selectedId).toBe('p1-r001');
  });
  it('rejects invalid window and unknown extras', () => {
    const { view: parsed } = parseViewParams(new URLSearchParams('start=2010&end=1900&q=x'));
    expect(parsed.start).toBeUndefined();
    expect(parsed.end).toBeUndefined();
  });
});

describe('createHashRouter (standalone)', () => {
  it('writes and parses hash state, builds event deep-link', () => {
    const hashes: string[] = [];
    const originalHistory = globalThis.history;
    const originalLocation = globalThis.location;
    // jsdom 不在此环境，构造最小 location/history 替身
    const fakeLocation = { hash: '' };
    vi.stubGlobal('location', fakeLocation);
    vi.stubGlobal('history', { pushState: (_s: unknown, _t: string, url: string) => { fakeLocation.hash = url; hashes.push(url); }, replaceState: (_s: unknown, _t: string, url: string) => { fakeLocation.hash = url; } });
    vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined });
    const router = createHashRouter();
    router.write({ nav: 'explore', view }, true);
    expect(fakeLocation.hash).toContain('#/explore?');
    expect(fakeLocation.hash).toContain('event=p1-r001');
    expect(fakeLocation.hash).toContain('archive=1');
    expect(router.eventUrl('p1-r001')).toBe('#/explore?event=p1-r001');
    const parsed = router.parse();
    expect(parsed.nav).toBe('explore');
    expect(parsed.selectedId).toBe('p1-r001');
    expect(parsed.view.archive).toBe(true);
    vi.unstubAllGlobals();
    void originalHistory; void originalLocation;
  });
});

describe('createGuanlanRouter (Nuxt embed)', () => {
  function makeRoute(initial: Record<string, unknown> = {}): GuanlanRouterLike & { query: Record<string, unknown>; pushed: Record<string, string>[]; replaced: Record<string, string>[] } {
    const route = {
      query: { ...initial },
      pushed: [] as Record<string, string>[],
      replaced: [] as Record<string, string>[],
      push(query: Record<string, string>) { this.pushed.push(query); this.query = { ...query }; },
      replace(query: Record<string, string>) { this.replaced.push(query); this.query = { ...query }; },
    };
    return route;
  }
  it('reads Nuxt query including string-array values and builds /history/?event= deep link', () => {
    const route = makeRoute({ event: 'p1-r001', topics: ['war,thought'], archive: '1', start: '1919', end: '1921' });
    const router = createGuanlanRouter({ route });
    const parsed = router.parse();
    expect(parsed.selectedId).toBe('p1-r001');
    expect(parsed.view.topicIds).toEqual(['war', 'thought']);
    expect(parsed.view.archive).toBe(true);
    expect(router.eventUrl('p1-r001')).toBe('/history/?event=p1-r001');
  });
  it('writes via push/replace on the host route', () => {
    const route = makeRoute({});
    const router = createGuanlanRouter({ route });
    router.write({ nav: 'compare', view }, true);
    expect(route.pushed).toHaveLength(1);
    expect(route.pushed[0]).toMatchObject({ nav: 'compare', event: 'p1-r001', archive: '1' });
    router.write({ nav: 'explore', view }, false);
    expect(route.replaced).toHaveLength(1);
    // 写回的 query 可被再次解析（观澜刷新/前进回退恢复）
    const parsed = router.parse();
    expect(parsed.nav).toBe('explore');
    expect(parsed.selectedId).toBe('p1-r001');
  });
  it('custom basePath is honored in eventUrl', () => {
    const route = makeRoute({});
    const router = createGuanlanRouter({ route, basePath: '/learning/history/' });
    expect(router.eventUrl('x')).toBe('/learning/history/?event=x');
  });
  it('reads route.query lazily on each parse so a host getter sees live Nuxt state', () => {
    // 模拟观澜 pages/history/index.vue 的 { get query(){ return route.query } } 薄封装：
    // 宿主 watch + :key 重挂载后，新组件实例 parse() 必须读到最新 query。
    let live: Record<string, unknown> = { event: 'first' };
    const route = {
      get query() { return live; },
      push(q: Record<string, string>) { live = { ...q }; },
      replace(q: Record<string, string>) { live = { ...q }; },
    };
    const router = createGuanlanRouter({ route });
    expect(router.parse().selectedId).toBe('first');
    live = { event: 'second', nav: 'compare' }; // 宿主路由变化（未重建 router）
    expect(router.parse().selectedId).toBe('second');
    expect(router.parse().nav).toBe('compare');
  });
});
