import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { StudyState, ViewState } from '@history/core';
import { GuanlanStudyRepository } from '@history/adapters';

const view: ViewState = { start: 1839, end: 2010, selectedId: 'e1', topicIds: [], query: '', compareIds: [], archive: false };
const attempt = (id: string) => ({ id, mode: 'recall' as const, eventIds: ['e1'], correct: true, answer: '1840', createdAt: '2026-10-03T00:00:00Z' });

interface MockApi {
  favorites: Record<string, { id: number; targetType: string; targetId: string; title: string; url: string; updatedAt: string }>;
  notes: Record<string, { id: number; targetType: string; targetId: string; title: string; content: string; updatedAt: string }>;
  progress: Record<string, { scope: string; ref: string; label: string; status: string; progress: number; updatedAt: string }>;
  nextId: number;
  calls: { method: string; path: string; body: unknown }[];
  failNext: number;
  auth: boolean;
}
function makeApi(): MockApi {
  return { favorites: {}, notes: {}, progress: {}, nextId: 1, calls: [], failNext: 0, auth: true };
}
function mockFetch(api: MockApi): typeof fetch {
  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const json = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status, headers: { 'Content-Type': 'application/json' } });
    const headers = new Headers(init.headers);
    const authed = api.auth && headers.has('Authorization');
    if (api.failNext > 0) { api.failNext -= 1; throw new TypeError('offline'); }
    if (!authed && (method !== 'GET')) { api.calls.push({ method, path: url, body }); return json({ message: 'unauthenticated' }, 401); }
    if (authed) api.calls.push({ method, path: url, body });
    if (url.startsWith('/api/v1/study/favorites')) {
      if (method === 'GET') {
        const type = new URL(url, 'http://x').searchParams.get('targetType');
        return json(Object.values(api.favorites).filter(f => !type || f.targetType === type));
      }
      if (method === 'PUT') {
        const key = `${body.targetType}:${body.targetId}`;
        if (body.favorited) api.favorites[key] ??= { id: api.nextId++, targetType: body.targetType, targetId: body.targetId, title: body.title ?? '', url: body.url ?? '', updatedAt: new Date().toISOString() };
        else delete api.favorites[key];
        return json(api.favorites[key] ?? null);
      }
    }
    if (url.startsWith('/api/v1/study/notes')) {
      if (method === 'GET') return json(Object.values(api.notes));
      if (method === 'POST') {
        const key = `${body.targetType}:${body.targetId}`;
        const existing = api.notes[key];
        api.notes[key] = { id: existing?.id ?? api.nextId++, targetType: body.targetType, targetId: body.targetId, title: body.title ?? '', content: String(body.content ?? '').slice(0, 20000), updatedAt: new Date().toISOString() };
        return json(api.notes[key]);
      }
      const match = url.match(/\/api\/v1\/study\/notes\/(\d+)/);
      if (match) {
        const row = Object.entries(api.notes).find(([, value]) => value.id === Number(match[1]));
        if (!row) return json(null, 404);
        if (method === 'PATCH') { row[1].content = String(body.content ?? '').slice(0, 20000); row[1].updatedAt = new Date().toISOString(); return json(row[1]); }
        if (method === 'DELETE') { delete api.notes[row[0]]; return json(null); }
      }
    }
    if (url.startsWith('/api/v1/study/progress')) {
      if (method === 'GET') return json(Object.values(api.progress));
      if (method === 'POST') { api.progress[`${body.scope}:${body.ref}`] = { scope: body.scope, ref: body.ref, label: body.label ?? '', status: body.status ?? 'reading', progress: body.progress ?? 0, updatedAt: new Date().toISOString() }; return json(null); }
    }
    return json(null, 404);
  }) as typeof fetch;
}
const authHeaders = () => ({ Authorization: 'Bearer token-1' });
const state = (partial: Partial<StudyState>): StudyState => ({ version: 1, bookmarks: [], notes: {}, attempts: [], view: null, ...partial });

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('GuanlanStudyRepository', () => {
  it('loads remote favorites/notes/progress and keeps attempts local only', async () => {
    const api = makeApi();
    api.favorites['history_event:e1'] = { id: 1, targetType: 'history_event', targetId: 'e1', title: 't', url: '/history/?event=e1', updatedAt: '2026-10-03T00:00:00Z' };
    api.notes['history_event:e1'] = { id: 2, targetType: 'history_event', targetId: 'e1', title: 't', content: '观澜笔记', updatedAt: '2026-10-03T00:00:00Z' };
    api.progress['history:view:timeline'] = { scope: 'history', ref: 'view:timeline', label: JSON.stringify(view), status: 'reading', progress: 0, updatedAt: '2026-10-03T00:00:00Z' };
    // 先把 attempts 写入本地（空快照，且不触碰远端夹具）
    const seed = new GuanlanStudyRepository({ fetch: mockFetch(api), authHeaders: () => ({}), localName: 'gs-load' });
    await seed.save(state({ attempts: [attempt('a1')] }));
    const loaded = await new GuanlanStudyRepository({ fetch: mockFetch(api), authHeaders, localName: 'gs-load' }).load();
    expect(loaded.bookmarks).toEqual(['e1']);
    expect(loaded.notes).toEqual({ e1: '观澜笔记' });
    expect(loaded.view).toEqual(view);
    expect(loaded.attempts.map(a => a.id)).toEqual(['a1']);
    expect(api.calls.some(c => c.path.includes('/study/attempts'))).toBe(false);
  });

  it('writes bookmarks via idempotent PUT and notes via POST then PATCH', async () => {
    const api = makeApi();
    const repo = new GuanlanStudyRepository({ fetch: mockFetch(api), authHeaders, localName: 'gs-write' });
    await repo.load();
    await repo.save(state({ bookmarks: ['e1', 'e2'], notes: { e1: '第一版' } }));
    await repo.save(state({ bookmarks: ['e1'], notes: { e1: '第二版' } }));
    const puts = api.calls.filter(c => c.method === 'PUT' && c.path.includes('favorites'));
    expect(puts.map(c => (c.body as { targetId: string; favorited: boolean }).targetId + ':' + (c.body as { favorited: boolean }).favorited)).toEqual(['e1:true', 'e2:true', 'e2:false']);
    expect(Object.keys(api.favorites)).toEqual(['history_event:e1']);
    expect(api.calls.some(c => c.method === 'POST' && c.path.endsWith('/study/notes'))).toBe(true);
    expect(api.calls.some(c => c.method === 'PATCH')).toBe(true);
    expect(api.notes['history_event:e1']?.content).toBe('第二版');
    // 重复保存同一状态不再产生写调用
    const before = api.calls.length;
    await repo.save(state({ bookmarks: ['e1'], notes: { e1: '第二版' } }));
    const writes = api.calls.slice(before).filter(c => c.method !== 'GET');
    expect(writes).toEqual([]);
  });

  it('falls back to local IndexedDB when offline and marks pending sync', async () => {
    const api = makeApi();
    api.failNext = 99; // 全部请求失败
    const repo = new GuanlanStudyRepository({ fetch: mockFetch(api), authHeaders, localName: 'gs-offline' });
    const loaded = await repo.load();
    expect(loaded.bookmarks).toEqual([]);
    expect(repo.status.mode).toBe('local');
    expect(repo.status.warning).toMatch(/本地|联网/);
    await repo.save(state({ bookmarks: ['e1'], notes: { e1: '离线笔记' } }));
    expect(repo.status.pendingSync).toBe(true);
    const restored = await new GuanlanStudyRepository({ fetch: mockFetch(api), authHeaders, localName: 'gs-offline' }).load();
    expect(restored.bookmarks).toEqual(['e1']);
    expect(restored.notes).toEqual({ e1: '离线笔记' });
  });

  it('merges pending local changes back to Guanlan when back online (remote authoritative)', async () => {
    const api = makeApi();
    const offline = new GuanlanStudyRepository({ fetch: mockFetch(api), authHeaders, localName: 'gs-merge' });
    api.failNext = 99;
    await offline.load();
    await offline.save(state({ bookmarks: ['e-local'], notes: { 'e-local': '离线补记' } }));
    api.failNext = 0;
    api.favorites['history_event:e-remote'] = { id: 9, targetType: 'history_event', targetId: 'e-remote', title: 't', url: '', updatedAt: '2026-10-03T01:00:00Z' };
    const online = new GuanlanStudyRepository({ fetch: mockFetch(api), authHeaders, localName: 'gs-merge' });
    const merged = await online.load();
    expect(online.status.mode).toBe('online');
    expect(merged.bookmarks.sort()).toEqual(['e-local', 'e-remote']);
    expect(merged.notes['e-local']).toBe('离线补记');
    expect(api.favorites['history_event:e-local']).toBeTruthy();
    expect(api.notes['history_event:e-local']?.content).toBe('离线补记');
  });

  it('stops writing on 401, keeps local copy and calls onAuthRequired', async () => {
    const api = makeApi();
    const onAuth = vi.fn();
    const repo = new GuanlanStudyRepository({ fetch: mockFetch(api), authHeaders, localName: 'gs-auth', onAuthRequired: onAuth });
    await repo.load(); // 建立远端快照
    api.auth = false; // 此后写操作返回 401
    await expect(repo.save(state({ bookmarks: ['e1'] }))).rejects.toThrow(/401|失效/);
    expect(repo.status.mode).toBe('auth');
    expect(onAuth).toHaveBeenCalled();
    // 本地仍保留（用无 token 的新实例读本地，避免触发远端覆盖）
    const local = await new GuanlanStudyRepository({ fetch: mockFetch(api), authHeaders: () => ({}), localName: 'gs-auth' }).load();
    expect(local.bookmarks).toEqual(['e1']);
    // 服务端未被写入
    expect(Object.keys(api.favorites)).toEqual([]);
  });

  it('never deletes a favorite the user never removed (regression)', async () => {
    const api = makeApi();
    // 远端已有一条由其它设备/账号操作产生的收藏，本地基线为空。
    api.favorites['history_event:other'] = { id: 7, targetType: 'history_event', targetId: 'other', title: 't', url: '', updatedAt: '2026-10-03T00:00:00Z' };
    const repo = new GuanlanStudyRepository({ fetch: mockFetch(api), authHeaders, localName: 'gs-nodelete' });
    await repo.save(state({ bookmarks: ['mine'] }));
    expect(api.favorites['history_event:other']).toBeTruthy();
    expect(api.favorites['history_event:mine']).toBeTruthy();
    // 远端也拉取 history_comparison 时不被误删
    api.favorites['history_comparison:c1'] = { id: 8, targetType: 'history_comparison', targetId: 'c1', title: 't', url: '', updatedAt: '2026-10-03T00:00:00Z' };
    await repo.save(state({ bookmarks: ['mine'] }));
    expect(api.favorites['history_comparison:c1']).toBeTruthy();
  });

  it('does not write remotely when no token is provided', async () => {
    const api = makeApi();
    const repo = new GuanlanStudyRepository({ fetch: mockFetch(api), authHeaders: () => ({}), localName: 'gs-anon' });
    const loaded = await repo.load();
    expect(loaded.bookmarks).toEqual([]);
    expect(repo.status.mode).toBe('local');
    await repo.save(state({ bookmarks: ['e1'] }));
    expect(api.calls.filter(c => c.method !== 'GET')).toEqual([]);
    expect(repo.status.warning).toMatch(/本地|登录/);
  });

  it('isolates accounts by localName so switching accounts never leaks records', async () => {
    const apiA = makeApi();
    const apiB = makeApi();
    const userA = new GuanlanStudyRepository({ fetch: mockFetch(apiA), authHeaders: () => ({ Authorization: 'Bearer A' }), localName: 'gs-acc-a' });
    await userA.save(state({ bookmarks: ['a-secret'], notes: { 'a-secret': 'A 的笔记' }, attempts: [attempt('a1')] }));
    // 切到 B 账号：不同 localName，观澜为权威，A 的记录不可见
    const userB = new GuanlanStudyRepository({ fetch: mockFetch(apiB), authHeaders: () => ({ Authorization: 'Bearer B' }), localName: 'gs-acc-b' });
    const bState = await userB.load();
    expect(bState.bookmarks).toEqual([]);
    expect(bState.notes).toEqual({});
    expect(bState.attempts).toEqual([]);
    // B 写入后不影响 A 的本地库
    await userB.save(state({ bookmarks: ['b-item'] }));
    const aAgain = await new GuanlanStudyRepository({ fetch: mockFetch(apiA), authHeaders: () => ({ Authorization: 'Bearer A' }), localName: 'gs-acc-a' }).load();
    expect(aAgain.bookmarks).toEqual(['a-secret']);
    expect(aAgain.notes['a-secret']).toBe('A 的笔记');
    expect(aAgain.attempts.map(a => a.id)).toEqual(['a1']);
  });

  it('export/import keeps JSON format and dedupes attempts by id', async () => {
    const api = makeApi();
    const repo = new GuanlanStudyRepository({ fetch: mockFetch(api), authHeaders, localName: 'gs-backup' });
    await repo.save(state({ bookmarks: ['e1'], notes: { e1: '笔记' }, attempts: [attempt('a1')], view }));
    const text = await repo.exportBackup();
    const parsed = JSON.parse(text);
    expect(parsed.version).toBe(1);
    expect(parsed.contentVersion).toBe('history.v1');
    expect(JSON.stringify(parsed)).not.toMatch(/[FD]:[\\/]/);
    const other = new GuanlanStudyRepository({ fetch: mockFetch(api), authHeaders, localName: 'gs-backup-2' });
    await other.save(state({ attempts: [{ ...attempt('a1'), answer: 'other' }, attempt('a2')] }));
    const merged = await other.importBackup(text);
    expect(merged.attempts.map(a => a.id)).toEqual(['a1', 'a2']);
    expect(merged.notes.e1).toBe('笔记');
    expect(merged.bookmarks).toEqual(['e1']);
  });
});
