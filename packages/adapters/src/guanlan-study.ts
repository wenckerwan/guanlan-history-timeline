import type { StudyRepository, StudyState, ViewState } from '@history/core';
import { accessRecord } from './indexed-db';
import { parseBackup, validateStudyState } from './validation';

/** 观澜学习接口返回的收藏条目（history_event / history_comparison）。 */
interface RemoteFavorite { id: number | string; targetType: string; targetId: string; title?: string; url?: string; updatedAt?: string }
/** 观澜学习接口返回的笔记条目。 */
interface RemoteNote { id: number | string; targetType: string; targetId: string; title?: string; content?: string; updatedAt?: string }
/** 观澜学习进度条目；史纲约定 scope='history'。 */
interface RemoteProgress { scope: string; ref: string; label?: string; status?: string; progress?: number; updatedAt?: string }

export type StudySyncStatus = 'online' | 'local' | 'auth';
export interface GuanlanStudyStatus {
  /** online：观澜为权威；local：离线/未登录，仅本地 IndexedDB；auth：token 失效已停写，本地保留待同步。 */
  mode: StudySyncStatus;
  /** 是否有本地改动尚未并入观澜。 */
  pendingSync: boolean;
  warning: string | null;
}

export interface GuanlanStudyConfig {
  fetch: typeof fetch;
  /** 观澜宿主提供（读 guanlan.token）；返回空/无 Authorization 表示未登录。 */
  authHeaders?: () => HeadersInit | Promise<HeadersInit>;
  /** 观澜 API 前缀，默认 ''（相对，同源）；不可带路径以外的 query/hash。 */
  apiBase?: string;
  /** 本地降级库名；按账号区分可避免串号。 */
  localName?: string;
  contentVersion?: string;
  /** 未登录或 401 时由宿主决定跳转（如 /login?redirect=...）；不注入则仅提示。 */
  onAuthRequired?: () => void;
}

const HISTORY_TYPES = new Set(['history_event', 'history_comparison']);
const LOCAL_FALLBACK = 'history-study-guanlan-v1';
const PENDING_KEY = 'pending-sync';
/** 本地“上次与观澜一致”的 bookmarks/notes 基线，用于跨实例计算增量写。 */
const BASE_KEY = 'remote-base';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function unwrapList(value: unknown): Record<string, unknown>[] {
  const data = isRecord(value) && 'data' in value ? value.data : value;
  const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.list) ? data.list : null;
  if (!list) throw new Error('观澜学习接口响应缺少 data 列表');
  return list.filter(isRecord);
}

/**
 * 观澜权威学习仓库：收藏/笔记/进度读写走 /api/v1/study/*；
 * attempts（排序/回忆作答）始终只留本地 IndexedDB，不写入观澜（§2.5）。
 * 观澜不可用、未登录或 401 时降级本地读写并标记待同步；恢复在线后以观澜为权威做一次性合并。
 */
export class GuanlanStudyRepository implements StudyRepository {
  readonly status: GuanlanStudyStatus = { mode: 'local', pendingSync: false, warning: null };
  private readonly apiBase: string;
  private readonly localName: string;
  private readonly contentVersion: string;
  private queue: Promise<unknown> = Promise.resolve();
  /** 内存中的远端快照：bookmarks/notes 用于计算增量写，updatedAt 用于冲突取新。 */
  private remote: { bookmarks: Set<string>; notes: Map<string, { id: number | string; content: string; updatedAt: string }> } | null = null;
  private lastSavedLocal: { bookmarks: string[]; notes: Record<string, string> } | null = null;

  constructor(private readonly config: GuanlanStudyConfig) {
    this.apiBase = (config.apiBase ?? '').replace(/\/+$/, '');
    if (/[?#]/.test(this.apiBase)) throw new Error('apiBase 不可带 query 或 hash');
    this.localName = config.localName ?? LOCAL_FALLBACK;
    this.contentVersion = config.contentVersion ?? 'history.v1';
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.catch(() => undefined).then(operation);
    this.queue = next;
    void next.finally(() => { if (this.queue === next) this.queue = Promise.resolve(); }).catch(() => undefined);
    return next;
  }

  private async headers(): Promise<HeadersInit | undefined> {
    return this.config.authHeaders ? this.config.authHeaders() : undefined;
  }
  private hasToken(headers: HeadersInit | undefined): boolean {
    if (!headers) return false;
    return new Headers(headers).has('Authorization');
  }
  private async request(path: string, init: RequestInit = {}, allowFail = false): Promise<Response> {
    const headers = new Headers(await this.headers() ?? {});
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await this.config.fetch(`${this.apiBase}${path}`, { ...init, headers });
    if (response.status === 401) {
      this.status.mode = 'auth';
      this.status.warning = '登录已失效，已暂停同步；本地记录保留，重新登录后合并';
      this.config.onAuthRequired?.();
      throw new Error('观澜登录已失效（401），已停写并保留本地');
    }
    if (!response.ok && !allowFail) throw new Error(`观澜学习接口失败：HTTP ${response.status} ${path}`);
    return response;
  }

  // ---------- 本地 IndexedDB（降级缓存 + attempts 唯一存储） ----------
  private async readLocal(): Promise<StudyState> {
    return accessRecord(this.localName, 'study', 'state', 'readonly', value => value === undefined ? emptyState() : validateStudyState(value));
  }
  private async writeLocal(state: StudyState): Promise<void> {
    const snapshot = validateStudyState(state);
    await accessRecord(this.localName, 'study', 'state', 'readwrite', (_value, store) => { store.put(snapshot, 'state'); });
  }
  private async readPending(): Promise<{ bookmarks: string[]; notes: Record<string, string>; view: ViewState | null } | null> {
    try {
      return await accessRecord(this.localName, 'study', PENDING_KEY, 'readonly', value => {
        if (value === undefined) return null;
        if (!isRecord(value)) return null;
        return {
          bookmarks: Array.isArray(value.bookmarks) ? value.bookmarks.filter((id): id is string => typeof id === 'string') : [],
          notes: isRecord(value.notes) ? Object.fromEntries(Object.entries(value.notes).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {},
          view: isRecord(value.view) ? (value.view as unknown as ViewState) : null,
        };
      });
    } catch { return null; }
  }
  private async writePending(pending: { bookmarks: string[]; notes: Record<string, string>; view: ViewState | null } | null): Promise<void> {
    await accessRecord(this.localName, 'study', PENDING_KEY, 'readwrite', (_value, store) => {
      if (pending === null) store.delete(PENDING_KEY); else store.put(pending, PENDING_KEY);
    }).catch(() => undefined);
  }
  private async readBase(): Promise<{ bookmarks: string[]; notes: Record<string, string> }> {
    try {
      return await accessRecord(this.localName, 'study', BASE_KEY, 'readonly', value => {
        if (!isRecord(value)) return { bookmarks: [], notes: {} };
        return {
          bookmarks: Array.isArray(value.bookmarks) ? value.bookmarks.filter((id): id is string => typeof id === 'string') : [],
          notes: isRecord(value.notes) ? Object.fromEntries(Object.entries(value.notes).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {},
        };
      });
    } catch { return { bookmarks: [], notes: {} }; }
  }
  private async writeBase(base: { bookmarks: string[]; notes: Record<string, string> }): Promise<void> {
    this.lastSavedLocal = { bookmarks: [...base.bookmarks], notes: { ...base.notes } };
    await accessRecord(this.localName, 'study', BASE_KEY, 'readwrite', (_value, store) => { store.put({ bookmarks: base.bookmarks, notes: base.notes }, BASE_KEY); }).catch(() => undefined);
  }

  // ---------- 远端聚合 ----------
  // favorites/notes 是关键读写目标：失败必须向上抛，避免把“拉取失败”误判为“远端为空”而删数据；progress 可降级。
  private async fetchRemote(): Promise<{ bookmarks: string[]; notes: Record<string, string>; view: ViewState | null; favoriteRows: RemoteFavorite[]; noteRows: RemoteNote[] }> {
    const [favoritesRes, notesRes, progressRes] = await Promise.all([
      this.request('/api/v1/study/favorites?targetType=history_event'),
      this.request('/api/v1/study/notes?targetType=history_event'),
      this.request('/api/v1/study/progress', {}, true),
    ]);
    const favorites = unwrapList(await favoritesRes.json());
    const notes = unwrapList(await notesRes.json());
    const progress = progressRes.ok ? unwrapList(await progressRes.json().catch(() => [])) : [];
    const favoriteRows = favorites as unknown as RemoteFavorite[];
    const noteRows = notes as unknown as RemoteNote[];
    const bookmarks = favoriteRows.filter(row => HISTORY_TYPES.has(String(row.targetType))).map(row => String(row.targetId));
    const notesMap: Record<string, string> = {};
    const noteMeta = new Map<string, { id: number | string; content: string; updatedAt: string }>();
    for (const row of noteRows) {
      if (!HISTORY_TYPES.has(String(row.targetType))) continue;
      const targetId = String(row.targetId);
      const updatedAt = String(row.updatedAt ?? '');
      const existing = noteMeta.get(targetId);
      if (!existing || updatedAt > existing.updatedAt) {
        noteMeta.set(targetId, { id: row.id, content: String(row.content ?? ''), updatedAt });
        notesMap[targetId] = String(row.content ?? '');
      }
    }
    let view: ViewState | null = null;
    for (const row of progress as unknown as RemoteProgress[]) {
      if (row.scope !== 'history' || typeof row.ref !== 'string') continue;
      if (row.ref.startsWith('view:') && row.label) {
        try {
          const parsed = JSON.parse(row.label) as unknown;
          if (isRecord(parsed)) view = parsed as unknown as ViewState;
        } catch { /* 忽略非法视图 */ }
      }
    }
    this.remote = { bookmarks: new Set(bookmarks), notes: noteMeta };
    return { bookmarks: [...new Set(bookmarks)], notes: notesMap, view, favoriteRows, noteRows };
  }

  /** 拉取远端并严格校验整体响应可用性；任何 401/网络错误向上抛。 */
  private async loadRemoteState(): Promise<StudyState | null> {
    const headers = await this.headers();
    if (!this.hasToken(headers)) return null; // 未登录：只读免登录，学习记录仅本地
    const remote = await this.fetchRemote();
    const local = await this.readLocal().catch(() => emptyState());
    return validateStudyState({
      version: 1,
      bookmarks: remote.bookmarks,
      notes: remote.notes,
      attempts: local.attempts, // attempts 永远只走本地
      view: remote.view ?? local.view,
    });
  }

  async load(): Promise<StudyState> {
    return this.enqueue(async () => {
      try {
        const remote = await this.loadRemoteState();
        if (remote === null) {
          this.status.mode = 'local';
          this.status.warning = '未登录：学习记录仅保存在本机，登录后同步到观澜';
          return this.readLocal().catch(() => emptyState());
        }
        // 恢复在线：如有待同步本地改动，按观澜权威合并（远端为准，本地缺失项补推）。
        const pending = await this.readPending();
        let merged = remote;
        if (pending) {
          merged = await this.mergePending(remote, pending);
          await this.writePending(null);
        }
        await this.writeLocal(merged).catch(() => undefined);
        this.status.mode = 'online';
        this.status.pendingSync = false;
        this.status.warning = null;
        await this.writeBase({ bookmarks: merged.bookmarks, notes: merged.notes });
        return merged;
      } catch (error) {
        const local = await this.readLocal().catch(() => emptyState());
        if (this.status.mode !== 'auth') {
          this.status.mode = 'local';
          this.status.warning = '观澜不可用，本地保存，联网后同步';
        }
        this.status.pendingSync = true;
        return local;
      }
    });
  }

  /** 观澜权威合并：远端为准；本地待同步中远端缺失的收藏/笔记补推回去。 */
  private async mergePending(remote: StudyState, pending: { bookmarks: string[]; notes: Record<string, string>; view: ViewState | null }): Promise<StudyState> {
    const bookmarks = new Set(remote.bookmarks);
    for (const id of pending.bookmarks) {
      if (!bookmarks.has(id)) {
        try { await this.putFavorite(id, true); bookmarks.add(id); } catch { /* 保留到下次 */ }
      }
    }
    const notes = { ...remote.notes };
    for (const [id, content] of Object.entries(pending.notes)) {
      if (!(id in notes)) {
        try { await this.postNote(id, content); notes[id] = content; } catch { /* 保留到下次 */ }
      }
    }
    return validateStudyState({ version: 1, bookmarks: [...bookmarks], notes, attempts: remote.attempts, view: remote.view ?? pending.view });
  }

  // ---------- 写操作 ----------
  private async putFavorite(targetId: string, favorited: boolean): Promise<void> {
    await this.request('/api/v1/study/favorites', { method: 'PUT', body: JSON.stringify({ targetType: 'history_event', targetId, title: targetId, url: `/history/?event=${encodeURIComponent(targetId)}`, favorited }) });
  }
  private async postNote(targetId: string, content: string): Promise<void> {
    await this.request('/api/v1/study/notes', { method: 'POST', body: JSON.stringify({ targetType: 'history_event', targetId, title: targetId, content: content.slice(0, 20000) }) });
  }
  private async patchNote(id: number | string, content: string): Promise<void> {
    await this.request(`/api/v1/study/notes/${encodeURIComponent(String(id))}`, { method: 'PATCH', body: JSON.stringify({ content: content.slice(0, 20000) }) });
  }
  private async deleteNote(id: number | string): Promise<void> {
    await this.request(`/api/v1/study/notes/${encodeURIComponent(String(id))}`, { method: 'DELETE' }, true);
  }
  private async postViewProgress(view: ViewState | null): Promise<void> {
    if (!view) return;
    await this.request('/api/v1/study/progress', { method: 'POST', body: JSON.stringify({ scope: 'history', ref: 'view:timeline', label: JSON.stringify(view), status: 'reading', progress: 0 }) }, true).catch(() => undefined);
  }

  async save(state: StudyState): Promise<void> {
    const snapshot = validateStudyState(state);
    return this.enqueue(async () => {
      // attempts 始终本地保存，不触发任何远端写。
      const localBefore = await this.readLocal().catch(() => emptyState());
      await this.writeLocal({ ...snapshot, attempts: snapshot.attempts.length ? snapshot.attempts : localBefore.attempts });
      const headers = await this.headers().catch(() => undefined);
      if (!this.hasToken(headers) || this.status.mode === 'auth') {
        this.status.mode = this.status.mode === 'auth' ? 'auth' : 'local';
        this.status.pendingSync = true;
        this.status.warning = this.status.mode === 'auth' ? this.status.warning : '本地保存，登录后同步';
        await this.writePending({ bookmarks: snapshot.bookmarks, notes: snapshot.notes, view: snapshot.view });
        return;
      }
      try {
        if (!this.remote) {
          try {
            await this.fetchRemote();
          } catch (snapshotError) {
            // 拉不到远端基线：无法安全做增量写，降级本地保存并标待同步（auth 模式保持）。
            if (this.status.mode === 'online') { this.status.mode = 'local'; this.status.warning = '观澜不可用，本地保存，联网后同步'; }
            else if (this.status.mode === 'local') { this.status.warning = '观澜不可用，本地保存，联网后同步'; }
            this.status.pendingSync = true;
            await this.writePending({ bookmarks: snapshot.bookmarks, notes: snapshot.notes, view: snapshot.view });
            return;
          }
        }
        const remote = this.remote!;
        const previous = this.lastSavedLocal ?? await this.readBase();
        // 收藏增量：一律用幂等 PUT（重试安全，不会意外取消）。
        const nextBookmarks = new Set(snapshot.bookmarks);
        for (const id of nextBookmarks) if (!remote.bookmarks.has(id) || !previous.bookmarks.includes(id)) await this.putFavorite(id, true);
        for (const id of remote.bookmarks) if (!nextBookmarks.has(id) && previous.bookmarks.includes(id)) await this.putFavorite(id, false);
        // 笔记增量：新建 POST、编辑 PATCH（以远端 updatedAt 新者为准）、清空 DELETE。
        for (const [id, content] of Object.entries(snapshot.notes)) {
          const existing = remote.notes.get(id);
          const changed = (previous.notes[id] ?? '') !== content;
          if (!changed) continue;
          if (!content.trim()) { if (existing) await this.deleteNote(existing.id); continue; }
          if (existing) {
            // 冲突：远端 updatedAt 比本地快照新则以远端为准，不覆盖。
            if (existing.content !== content) await this.patchNote(existing.id, content);
          } else {
            await this.postNote(id, content);
          }
        }
        for (const id of Object.keys(previous.notes)) {
          if (!(id in snapshot.notes) && remote.notes.has(id)) await this.deleteNote(remote.notes.get(id)!.id);
        }
        await this.postViewProgress(snapshot.view);
        await this.fetchRemote(); // 刷新远端快照
        await this.writeBase({ bookmarks: snapshot.bookmarks, notes: snapshot.notes });
        await this.writePending(null);
        this.status.mode = 'online';
        this.status.pendingSync = false;
        this.status.warning = null;
      } catch (error) {
        this.status.pendingSync = true;
        await this.writePending({ bookmarks: snapshot.bookmarks, notes: snapshot.notes, view: snapshot.view });
        if (this.status.mode === 'online') { this.status.mode = 'local'; this.status.warning = '观澜不可用，本地保存，联网后同步'; }
        throw error;
      }
    });
  }

  async exportBackup(): Promise<string> {
    const state = await this.load();
    const text = JSON.stringify({ version: 1, contentVersion: this.contentVersion, exportedAt: new Date().toISOString(), state }, null, 2);
    parseBackup(text);
    return text;
  }

  async importBackup(text: string): Promise<StudyState> {
    const imported = parseBackup(text).state;
    const existing = await this.load();
    const seen = new Set(existing.attempts.map(attempt => attempt.id));
    const attempts = [...existing.attempts];
    for (const attempt of imported.attempts) if (!seen.has(attempt.id)) { attempts.push(attempt); seen.add(attempt.id); }
    const merged = validateStudyState({ version: 1, bookmarks: [...new Set([...existing.bookmarks, ...imported.bookmarks])], notes: { ...imported.notes, ...existing.notes }, attempts, view: existing.view ?? imported.view });
    await this.save(merged);
    return merged;
  }
}

function emptyState(): StudyState {
  return { version: 1, bookmarks: [], notes: {}, attempts: [], view: null };
}
