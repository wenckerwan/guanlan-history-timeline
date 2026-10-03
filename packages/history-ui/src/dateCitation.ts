import type { DateAssertion, SourceDocument } from '@history/core';

/** Compact, source-aware annotation for dates shown outside the evidence panel. */
export function briefDateSource(date: DateAssertion | null, sources: SourceDocument[]): string {
  if (!date) return '来源未定位';
  const source = sources.find(item => item.id === date.sourceId);
  const name = source?.kind === 'textbook' ? `纲要${source.version.replace(/[^0-9]/g, '') || '2023'}` : source?.kind === 'original' ? '原PDF' : source?.title || '来源未登记';
  return `${name}·${source?.kind === 'textbook' ? 'PDF' : ''}${date.page ? `第${date.page}页` : '页码未定位'}`;
}
