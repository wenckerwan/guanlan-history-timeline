import type { DateAssertion, HistoryDataset, StudyState } from '@history/core';

const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);
const precisions = new Set(['day', 'month', 'year', 'range', 'period', 'unknown']);
const publications = new Set(['original', 'verified', 'pending']);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown, maximum = 100_000): value is string => typeof value === 'string' && value.length <= maximum;
const isId = (value: unknown): value is string => isText(value, 256) && value.length > 0 && !forbiddenKeys.has(value) && !/[\u0000-\u001f]/.test(value);
const isYear = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100_000;
const isTimestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 8_640_000_000_000_000;
const isIds = (value: unknown, maximum = 10_000): value is string[] => Array.isArray(value) && value.length <= maximum && value.every(isId);
const hasKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function isIsoDate(value: unknown): value is string {
  if (!isText(value, 64)) return false;
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day, hour, minute, second, offsetHour = 0, offsetMinute = 0] = parts.slice(1).map(Number);
  const leap = year! % 4 === 0 && (year! % 100 !== 0 || year! % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month! >= 1 && month! <= 12 && day! >= 1 && day! <= days[month! - 1]! && hour! < 24 && minute! < 60 && second! < 60 && (Number.isNaN(offsetHour) || offsetHour < 24) && (Number.isNaN(offsetMinute) || offsetMinute < 60);
}

function check(condition: unknown, context: string): asserts condition {
  if (!condition) throw new Error(context);
}

export function validateStudyState(value: unknown): StudyState {
  const error = '学习状态 / backup state 结构无效或超出大小限制';
  check(isRecord(value) && hasKeys(value, ['version', 'bookmarks', 'notes', 'attempts', 'view']), error);
  check(value.version === 1 && isIds(value.bookmarks), error);
  check(isRecord(value.notes) && Object.keys(value.notes).length <= 10_000, error);
  check(Object.entries(value.notes).every(([key, note]) => isId(key) && isText(note)), error);
  check(Array.isArray(value.attempts) && value.attempts.length <= 10_000, error);
  for (const attempt of value.attempts) {
    check(isRecord(attempt) && hasKeys(attempt, ['id', 'mode', 'eventIds', 'correct', 'answer', 'createdAt']), error);
    check(isId(attempt.id) && (attempt.mode === 'recall' || attempt.mode === 'order') && isIds(attempt.eventIds, 1_000), error);
    check(typeof attempt.correct === 'boolean' && isText(attempt.answer) && isIsoDate(attempt.createdAt), error);
  }
  if (value.view !== null) {
    const view = value.view;
    check(isRecord(view) && hasKeys(view, ['start', 'end', 'selectedId', 'topicIds', 'query', 'compareIds', 'archive']), error);
    check(isYear(view.start) && isYear(view.end) && view.start < view.end, error);
    check((view.selectedId === null || isId(view.selectedId)) && isIds(view.topicIds), error);
    check(isText(view.query, 10_000) && isIds(view.compareIds) && typeof view.archive === 'boolean', error);
  }
  return structuredClone(value) as unknown as StudyState;
}

export interface StudyBackup { version: 1; contentVersion: string; exportedAt: string; state: StudyState }
export function parseBackup(text: string): StudyBackup {
  const error = '备份 / backup 格式无效或超出 5 MB 限制';
  check(typeof text === 'string' && text.length <= 5_000_000 && new TextEncoder().encode(text).byteLength <= 5_000_000, error);
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error(error); }
  check(isRecord(value) && hasKeys(value, ['version', 'contentVersion', 'exportedAt', 'state']), error);
  check(value.version === 1 && isId(value.contentVersion) && isIsoDate(value.exportedAt), error);
  return { version: 1, contentVersion: value.contentVersion, exportedAt: value.exportedAt, state: validateStudyState(value.state) };
}

function validateAssertion(value: unknown, sourcePages: Map<string, number>): DateAssertion | null {
  const error = '历史数据 / dataset 日期断言无效';
  if (value === null) return null;
  check(isRecord(value) && isText(value.label) && precisions.has(value.precision as string), error);
  check(isId(value.sourceId) && sourcePages.has(value.sourceId) && publications.has(value.status as string), error);
  check(value.calendar === undefined || isText(value.calendar, 256), error);
  check((value.start === null && value.end === null) || (isTimestamp(value.start) && isTimestamp(value.end) && value.start <= value.end), error);
  check(value.page === null || (typeof value.page === 'number' && Number.isSafeInteger(value.page) && value.page >= 1 && value.page <= sourcePages.get(value.sourceId)!), error);
  return value as unknown as DateAssertion;
}

export function validateDataset(value: unknown): HistoryDataset {
  const error = '历史数据 / dataset schema 无效';
  check(isRecord(value) && isId(value.version) && isText(value.title) && isIsoDate(value.generatedAt), error);
  check(isRecord(value.range) && isYear(value.range.start) && isYear(value.range.end) && value.range.start < value.range.end, error);
  check(Array.isArray(value.topics) && Array.isArray(value.sources) && Array.isArray(value.events) && Array.isArray(value.comparisons), error);
  const topics = new Set<string>();
  for (const topic of value.topics) {
    check(isRecord(topic) && isId(topic.id) && !topics.has(topic.id) && isText(topic.name) && isText(topic.color, 256) && isText(topic.description), error);
    topics.add(topic.id);
  }
  const sources = new Map<string, number>();
  for (const source of value.sources) {
    check(isRecord(source) && isId(source.id) && !sources.has(source.id) && isText(source.title) && isText(source.fileName) && isText(source.version), error);
    check((source.kind === 'original' || source.kind === 'textbook') && typeof source.pdfPages === 'number' && Number.isSafeInteger(source.pdfPages) && source.pdfPages >= 1, error);
    sources.set(source.id, source.pdfPages);
  }
  const events = new Set<string>();
  for (const event of value.events) {
    check(isRecord(event) && isId(event.id) && !events.has(event.id) && isText(event.title) && isText(event.content) && isText(event.note), error);
    check(isId(event.topicId) && topics.has(event.topicId) && isId(event.groupId) && isIds(event.tags), error);
    check(publications.has(event.publication as string) && typeof event.trainable === 'boolean' && (event.isGroup === undefined || typeof event.isGroup === 'boolean'), error);
    check(isRecord(event.dates), error);
    const original = validateAssertion(event.dates.original, sources);
    const textbook = validateAssertion(event.dates.textbook, sources);
    if (event.publication === 'original') check(original !== null && original.status !== 'pending', '历史数据 / dataset 原表日期仍待审核，不能发布为原表已确认');
    if (event.publication === 'verified') check(original?.status === 'verified' || textbook?.status === 'verified', '历史数据 / dataset 待审核日期不能发布为 verified');
    if (event.trainable) check(event.publication !== 'pending' && [original, textbook].some(date => date !== null && date.status !== 'pending' && date.start !== null && date.end !== null), '历史数据 / dataset 待审或未知日期不能进入训练');
    events.add(event.id);
  }
  const comparisons = new Set<string>();
  for (const comparison of value.comparisons) {
    check(isRecord(comparison) && isId(comparison.id) && !comparisons.has(comparison.id) && isText(comparison.title) && isText(comparison.kind) && comparison.publication === 'pending', error);
    check(validateAssertion(comparison.textbook, sources) !== null, error);
    validateAssertion(comparison.original, sources);
    check(comparison.originalLabel === undefined || isText(comparison.originalLabel), error);
    comparisons.add(comparison.id);
  }
  return structuredClone(value) as unknown as HistoryDataset;
}
