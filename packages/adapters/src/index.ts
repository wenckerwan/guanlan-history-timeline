import type { HistoryDataset, HistoryRepository, StudyRepository, StudyState } from '@history/core';
import { accessRecord } from './indexed-db';
import { parseBackup, validateDataset, validateStudyState } from './validation';
export { GuanlanStudyRepository } from './guanlan-study';
export type { GuanlanStudyConfig, GuanlanStudyStatus, StudySyncStatus } from './guanlan-study';

export function createEmptyStudyState(): StudyState {
  return { version: 1, bookmarks: [], notes: {}, attempts: [], view: null };
}

/** Accept public relative or HTTP(S) URLs; never expose Windows/file paths. */
function isPublicUrl(value: string): boolean {
  if (!value || value.trim() !== value || /[\\\u0000-\u001f]/.test(value) || value.startsWith('//')) return false;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    try {
      const url = new URL(value);
      return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
    } catch { return false; }
  }
  return !value.split(/[?#]/)[0]!.split('/').includes('..');
}
const validPage = (page: number | null | undefined) => page == null || (Number.isSafeInteger(page) && page >= 1);

export interface LocalHistoryOptions { dataUrl?: string; sourceBaseUrl?: string; fetch?: typeof fetch }
export interface ContentLoadStatus { source: 'network' | 'cache' | null; persistence: 'available' | 'unavailable'; warning: string | null }
export class LocalHistoryRepository implements HistoryRepository {
  readonly status: ContentLoadStatus = { source: null, persistence: 'available', warning: null };
  private readonly dataUrl: string;
  private readonly sourceBaseUrl: string;
  private readonly fetcher: typeof fetch;
  constructor(options: LocalHistoryOptions = {}) {
    this.dataUrl = options.dataUrl ?? '/data/history.v1.json';
    this.sourceBaseUrl = (options.sourceBaseUrl ?? '/sources').replace(/\/+$/, '');
    if (!isPublicUrl(this.dataUrl) || !isPublicUrl(this.sourceBaseUrl) || /[?#]/.test(this.sourceBaseUrl)) throw new Error('数据与 PDF 地址必须是公开 HTTP(S) 或相对 URL');
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }
  async loadDataset(): Promise<HistoryDataset> {
    this.status.source = null;
    this.status.warning = null;
    let response: Response;
    try {
      response = await this.fetcher(this.dataUrl, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch {
      try {
        const cached = await accessRecord('history-content-cache-v1', 'datasets', this.dataUrl, 'readonly', value => validateDataset(value));
        this.status.source = 'cache';
        this.status.persistence = 'available';
        this.status.warning = '网络数据不可用，正在使用上次验证的缓存；PDF 原页未离线缓存';
        return cached;
      } catch {
        this.status.persistence = 'unavailable';
        this.status.warning = '无法读取有效的离线缓存';
        throw new Error('历史数据加载失败，网络与有效 IndexedDB 离线缓存均不可用');
      }
    }
    let raw: unknown;
    try { raw = await response.json(); } catch { throw new Error('历史数据 / dataset JSON 无效'); }
    // Invalid network content is an integrity error: never hide it using older content.
    const dataset = validateDataset(raw);
    this.status.source = 'network';
    try {
      await accessRecord('history-content-cache-v1', 'datasets', this.dataUrl, 'readwrite', (_value, store) => { store.put(dataset, this.dataUrl); });
      this.status.persistence = 'available';
    } catch {
      this.status.persistence = 'unavailable';
      this.status.warning = 'IndexedDB 缓存不可用；本次数据可阅读，但离线恢复无法保证';
    }
    return dataset;
  }
  sourceUrl(sourceId: string, page?: number | null): string | null {
    if (!['original', 'textbook'].includes(sourceId) || !validPage(page)) return null;
    return `${this.sourceBaseUrl}/${sourceId}.pdf${page == null ? '' : `#page=${page}`}`;
  }
}

const mutationQueues = new Map<string, Promise<unknown>>();
export class IndexedDbStudyRepository implements StudyRepository {
  constructor(private readonly name = 'history-study-v1', private readonly contentVersion = 'history.v1') {}
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const previous = mutationQueues.get(this.name) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    mutationQueues.set(this.name, next);
    void next.finally(() => { if (mutationQueues.get(this.name) === next) mutationQueues.delete(this.name); }).catch(() => undefined);
    return next;
  }
  load(): Promise<StudyState> {
    return this.enqueue(() => accessRecord(this.name, 'study', 'state', 'readonly', value => value === undefined ? createEmptyStudyState() : validateStudyState(value)));
  }
  async save(state: StudyState): Promise<void> {
    const snapshot = validateStudyState(state);
    await this.enqueue(() => accessRecord(this.name, 'study', 'state', 'readwrite', (_value, store) => { store.put(snapshot, 'state'); }));
  }
  async exportBackup(): Promise<string> {
    const state = await this.load();
    const text = JSON.stringify({ version: 1, contentVersion: this.contentVersion, exportedAt: new Date().toISOString(), state }, null, 2);
    parseBackup(text);
    return text;
  }
  async importBackup(text: string): Promise<StudyState> {
    const imported = parseBackup(text).state;
    return this.enqueue(() => accessRecord(this.name, 'study', 'state', 'readwrite', (value, store) => {
      const existing = value === undefined ? createEmptyStudyState() : validateStudyState(value);
      const seen = new Set(existing.attempts.map(attempt => attempt.id));
      const attempts = [...existing.attempts];
      for (const attempt of imported.attempts) if (!seen.has(attempt.id)) { attempts.push(attempt); seen.add(attempt.id); }
      const merged = validateStudyState({ version: 1, bookmarks: [...new Set([...existing.bookmarks, ...imported.bookmarks])], notes: { ...imported.notes, ...existing.notes }, attempts, view: existing.view ?? imported.view });
      store.put(merged, 'state');
      return merged;
    }));
  }
}
export interface GuanlanHistoryConfig {
  fetch: typeof fetch;
  contentEndpoint?: string;
  authHeaders?: () => HeadersInit | Promise<HeadersInit>;
  resolveSourceUrl: (documentId: string, page?: number | null) => string | null;
}
export class GuanlanHistoryRepository implements HistoryRepository {
  private readonly endpoint: string;
  constructor(private readonly config: GuanlanHistoryConfig) {
    this.endpoint = config.contentEndpoint ?? '/api/v1/history/events';
    if (!isPublicUrl(this.endpoint)) throw new Error('观澜内容端点必须是公开 HTTP(S) 或相对 URL');
  }
  async loadDataset(): Promise<HistoryDataset> {
    const headers = this.config.authHeaders ? await this.config.authHeaders() : undefined;
    const response = await this.config.fetch(this.endpoint, { headers });
    if (!response.ok) throw new Error(`观澜历史内容请求失败：HTTP ${response.status}`);
    const envelope: unknown = await response.json();
    if (typeof envelope !== 'object' || envelope === null || !('data' in envelope)) throw new Error('观澜内容响应缺少 data 包络');
    return validateDataset(envelope.data);
  }
  sourceUrl(sourceId: string, page?: number | null): string | null {
    if (!sourceId || !validPage(page)) return null;
    const url = this.config.resolveSourceUrl(sourceId, page);
    return url !== null && isPublicUrl(url) ? url : null;
  }
}
