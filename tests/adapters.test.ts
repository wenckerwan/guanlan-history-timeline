import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import type { HistoryDataset, StudyState } from '@history/core';
import { GuanlanHistoryRepository, IndexedDbStudyRepository, LocalHistoryRepository } from '@history/adapters';

const dataset: HistoryDataset = {
  version: '1.0.0', title: '测试数据', range: { start: 1839, end: 2009 },
  topics: [{ id: 'war', name: '战争', color: '#123456', description: '' }],
  sources: [{ id: 'original', title: '原表', fileName: 'original.pdf', kind: 'original', version: '1', pdfPages: 3 }],
  events: [{ id: 'e1', title: '事件', content: '原文', note: '', topicId: 'war', groupId: 'g1', dates: {
    original: { label: '1840年', start: 1840, end: 1841, precision: 'year', sourceId: 'original', page: 1, status: 'original' }, textbook: null,
  }, publication: 'original', tags: [], trainable: true }],
  comparisons: [], generatedAt: '2026-10-03T00:00:00.000Z',
};
const empty = (): StudyState => ({ version: 1, bookmarks: [], notes: {}, attempts: [], view: null });
const view = { start: 1839, end: 2009, selectedId: 'e1', topicIds: ['war'], query: '', compareIds: [], archive: false };
const attempt = (id: string) => ({ id, mode: 'recall' as const, eventIds: ['e1'], correct: true, answer: '1840', createdAt: '2026-10-03T00:00:00Z' });
const backup = (state: unknown) => JSON.stringify({ version: 1, contentVersion: '1.0.0', exportedAt: '2026-10-03T00:00:00Z', state });
const response = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('LocalHistoryRepository', () => {
  it('accepts the generated project dataset with epoch timestamps and microsecond metadata', async () => {
    const actual = JSON.parse(readFileSync(new URL('../data/history.v1.json', import.meta.url), 'utf8')) as HistoryDataset;
    const repository = new LocalHistoryRepository({ fetch: () => response(actual) });
    expect(await repository.loadDataset()).toEqual(actual);
    expect(actual.events.length).toBeGreaterThan(100);
  });
  it('loads the configured dataset and restores its validated persistent cache offline', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => response(dataset));
    const online = new LocalHistoryRepository({ fetch: fetcher });
    expect(await online.loadDataset()).toEqual(dataset);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/data/history.v1.json');
    const offline = new LocalHistoryRepository({ fetch: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')) });
    expect(await offline.loadDataset()).toEqual(dataset);
    expect(offline.status.source).toBe('cache');
    expect(offline.status.warning).toMatch(/缓存|cache/i);
  });
  it('never replaces a valid cache with a malformed network response', async () => {
    await new LocalHistoryRepository({ fetch: () => response(dataset) }).loadDataset();
    const invalid = new LocalHistoryRepository({ fetch: () => response({ ...dataset, events: [{ id: 'broken' }] }) });
    await expect(invalid.loadDataset()).rejects.toThrow(/数据|dataset|schema/i);
    const offline = new LocalHistoryRepository({ fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')) });
    expect(await offline.loadDataset()).toEqual(dataset);
  });
  it('rejects invalid range values and promoted pending assertions', async () => {
    await expect(new LocalHistoryRepository({ fetch: () => response(dataset) }).loadDataset()).resolves.toEqual(dataset);
    const malformed = structuredClone(dataset);
    malformed.range.end = Number.NaN;
    await expect(new LocalHistoryRepository({ fetch: () => response(malformed) }).loadDataset()).rejects.toThrow();
    const promoted = structuredClone(dataset);
    promoted.events[0]!.dates.original!.status = 'pending';
    await expect(new LocalHistoryRepository({ fetch: () => response(promoted) }).loadDataset()).rejects.toThrow();
  });
  it('reports unavailable caching while allowing a valid online dataset', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const repository = new LocalHistoryRepository({ fetch: () => response(dataset) });
    expect(await repository.loadDataset()).toEqual(dataset);
    expect(repository.status.persistence).toBe('unavailable');
    expect(repository.status.warning).toMatch(/IndexedDB/);
  });
  it('keeps source links on public URLs and validates PDF page anchors', () => {
    const repository = new LocalHistoryRepository({ sourceBaseUrl: 'https://files.example/history/' });
    expect(repository.sourceUrl('original', 2)).toBe('https://files.example/history/original.pdf#page=2');
    expect(repository.sourceUrl('textbook', null)).toBe('https://files.example/history/textbook.pdf');
    expect(repository.sourceUrl('../secret', 1)).toBeNull();
    expect(repository.sourceUrl('original', -1)).toBeNull();
    expect(repository.sourceUrl('original', 1.5)).toBeNull();
    expect(() => new LocalHistoryRepository({ sourceBaseUrl: 'F:/私人资料' })).toThrow();
  });
});

describe('IndexedDbStudyRepository', () => {
  it('starts empty and restores records from a new repository instance', async () => {
    const repository = new IndexedDbStudyRepository('restore');
    expect(await repository.load()).toEqual(empty());
    const state = { ...empty(), bookmarks: ['e1'], notes: { e1: '笔记' }, view, attempts: [attempt('a1')] };
    await repository.save(state);
    expect(await new IndexedDbStudyRepository('restore').load()).toEqual(state);
  });
  it('exports a versioned backup that round trips to another store', async () => {
    const source = new IndexedDbStudyRepository('export');
    const state = { ...empty(), notes: { e1: '笔记' } };
    await source.save(state);
    const text = await source.exportBackup();
    const parsed = JSON.parse(text);
    expect(parsed.version).toBe(1);
    expect(typeof parsed.contentVersion).toBe('string');
    expect(Number.isFinite(Date.parse(parsed.exportedAt))).toBe(true);
    expect(await new IndexedDbStudyRepository('import').importBackup(text)).toEqual(state);
  });
  it('merges backups preserving existing notes, attempt IDs and current view', async () => {
    const repository = new IndexedDbStudyRepository('merge');
    await repository.save({ ...empty(), bookmarks: ['e1'], notes: { e1: '现有' }, attempts: [attempt('a1')], view });
    const merged = await repository.importBackup(backup({ ...empty(), bookmarks: ['e1', 'e2'], notes: { e1: '冲突', e2: '新笔记' }, attempts: [{ ...attempt('a1'), answer: 'other' }, attempt('a2')], view: { ...view, query: 'new' } }));
    expect(merged.bookmarks).toEqual(['e1', 'e2']);
    expect(merged.notes).toEqual({ e1: '现有', e2: '新笔记' });
    expect(merged.attempts).toEqual([attempt('a1'), attempt('a2')]);
    expect(merged.view).toEqual(view);
    expect(await repository.load()).toEqual(merged);
  });
  it('serializes save and import calls so import sees the preceding save', async () => {
    const repository = new IndexedDbStudyRepository('serialized');
    const saving = repository.save({ ...empty(), bookmarks: ['e1'] });
    const importing = repository.importBackup(backup({ ...empty(), bookmarks: ['e2'] }));
    await Promise.all([saving, importing]);
    expect((await repository.load()).bookmarks).toEqual(['e1', 'e2']);
  });
  it.each([
    ['wrong state version', { ...empty(), version: 2 }],
    ['non-string bookmark', { ...empty(), bookmarks: [4] }],
    ['non-string note', { ...empty(), notes: { e1: 4 } }],
    ['invalid mode', { ...empty(), attempts: [{ ...attempt('a1'), mode: 'quiz' }] }],
    ['invalid answer', { ...empty(), attempts: [{ ...attempt('a1'), answer: false }] }],
    ['invalid correctness', { ...empty(), attempts: [{ ...attempt('a1'), correct: 'yes' }] }],
    ['invalid timestamp', { ...empty(), attempts: [{ ...attempt('a1'), createdAt: 'yesterday' }] }],
    ['impossible calendar timestamp', { ...empty(), attempts: [{ ...attempt('a1'), createdAt: '2026-02-30T00:00:00Z' }] }],
    ['invalid view range', { ...empty(), view: { ...view, start: 2010, end: 1900 } }],
    ['invalid view selected ID', { ...empty(), view: { ...view, selectedId: 4 } }],
    ['invalid view topic IDs', { ...empty(), view: { ...view, topicIds: [4] } }],
    ['invalid view query', { ...empty(), view: { ...view, query: 4 } }],
    ['invalid view compare IDs', { ...empty(), view: { ...view, compareIds: [4] } }],
    ['invalid view archive', { ...empty(), view: { ...view, archive: 'false' } }],
    ['oversized note', { ...empty(), notes: { e1: 'x'.repeat(100_001) } }],
  ])('rejects backup %s without modifying persisted state', async (_label, state) => {
    const repository = new IndexedDbStudyRepository('invalid');
    await repository.save({ ...empty(), bookmarks: ['safe'] });
    await expect(repository.importBackup(backup(state))).rejects.toThrow(/备份|backup|state/i);
    expect((await repository.load()).bookmarks).toEqual(['safe']);
  });
  it('rejects wrong envelopes, prototype keys and oversized files', async () => {
    const repository = new IndexedDbStudyRepository('envelope');
    await repository.save(empty());
    for (const text of [JSON.stringify(empty()), backup({ ...empty(), notes: JSON.parse('{"__proto__":"pollute"}') }), backup({ ...empty(), bookmarks: ['x'.repeat(1000)] }), 'x'.repeat(5_000_001)]) {
      await expect(repository.importBackup(text)).rejects.toThrow();
    }
  });
  it('does not claim persistent saves when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const repository = new IndexedDbStudyRepository('missing');
    await expect(repository.load()).rejects.toThrow(/IndexedDB/);
    await expect(repository.save(empty())).rejects.toThrow(/IndexedDB/);
  });
  it('rejects failed transactions without losing the old state or poisoning future writes', async () => {
    const repository = new IndexedDbStudyRepository('write-error');
    await repository.save({ ...empty(), bookmarks: ['safe'] });
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    await expect(repository.save({ ...empty(), bookmarks: ['lost'] })).rejects.toThrow(/IndexedDB.*未保存/);
    put.mockRestore();
    expect((await repository.load()).bookmarks).toEqual(['safe']);
    await repository.save({ ...empty(), bookmarks: ['recovered'] });
    expect((await repository.load()).bookmarks).toEqual(['recovered']);
  });
});

describe('GuanlanHistoryRepository', () => {
  it('uses the injected host auth and unwraps the content envelope', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => response({ data: dataset }));
    const repository = new GuanlanHistoryRepository({ fetch: fetcher, authHeaders: () => ({ Authorization: 'Bearer host-context' }), resolveSourceUrl: (id, page) => `https://files.example/${id}?page=${page}` });
    expect(await repository.loadDataset()).toEqual(dataset);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/history/events');
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer host-context');
    expect(repository.sourceUrl('original', 2)).toBe('https://files.example/original?page=2');
  });
  it('rejects HTTP failures, invalid envelopes and local source paths', async () => {
    const failure = new GuanlanHistoryRepository({ fetch: () => Promise.resolve(new Response('', { status: 401 })), resolveSourceUrl: () => null });
    await expect(failure.loadDataset()).rejects.toThrow(/401/);
    const invalid = new GuanlanHistoryRepository({ fetch: () => response({ data: { events: [] } }), resolveSourceUrl: () => 'D:/private/file.pdf' });
    await expect(invalid.loadDataset()).rejects.toThrow();
    expect(invalid.sourceUrl('original', 1)).toBeNull();
  });
});
