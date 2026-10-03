<script setup lang="ts">
import type { DateAssertion, HistoryEvent, SourceDocument, HistoryRepository } from '@history/core';
import ArchiveIcon from './ArchiveIcon.vue';
const props = defineProps<{ event: HistoryEvent; sources: SourceDocument[]; repository: HistoryRepository; bookmarked: boolean; compared: boolean; note: string; saveStatus: string; studyReadOnly?: boolean; sourcesOffline?: boolean }>();
defineEmits<{ close: []; bookmark: []; compare: []; note: [value: string]; flush: [] }>();
const annotation = (date: DateAssertion, sources: SourceDocument[]) => `${sources.find(source => source.id === date.sourceId)?.title || '来源未登记'}${date.page ? ` · PDF 第 ${date.page} 页` : ' · 页码未定位'}`;
const sourceLink = (date: DateAssertion) => props.sourcesOffline ? null : props.repository.sourceUrl(date.sourceId, date.page);
</script>
<template>
  <aside class="ha-evidence" aria-label="事件详情与日期出处">
    <header><span>档案 / {{ event.groupId }}</span><button class="ha-icon-button" aria-label="关闭事件详情" @click="$emit('close')"><ArchiveIcon name="close" /></button></header>
    <div class="ha-evidence-body">
      <span class="ha-eyebrow">{{ event.isGroup ? '原表合并组档案' : '独立事件' }}</span>
      <h2>{{ event.title }}</h2>
      <p v-if="event.isGroup" class="ha-group-notice">此条保存原表合并组；组内事项未被自动拆分或逐项配日期。</p>
      <p class="ha-original-text">{{ event.content }}</p>
      <div class="ha-evidence-actions"><button :disabled="studyReadOnly" :class="{ active: bookmarked }" @click="$emit('bookmark')"><ArchiveIcon name="study" />{{ bookmarked ? '已收藏' : '收藏' }}</button><button :class="{ active: compared }" @click="$emit('compare')"><ArchiveIcon name="compare" />{{ compared ? '移出比较' : '加入比较' }}</button></div>
      <section class="ha-dates"><h3>日期与出处</h3>
        <p v-if="!sourcesOffline" class="ha-document-service-note">原页需要文档服务可用；静态部署未提供 PDF 时无法打开</p>
        <div v-for="kind in (['textbook', 'original'] as const)" :key="kind" class="ha-date-assertion">
          <span class="ha-field-label">{{ kind === 'textbook' ? '教材时间' : '原 PDF 时间' }}</span>
          <template v-if="event.dates[kind]"><strong>{{ event.dates[kind]!.label }}</strong><a v-if="sourceLink(event.dates[kind]!)" :href="sourceLink(event.dates[kind]!)!" target="_blank" rel="noopener">{{ annotation(event.dates[kind]!, sources) }}<ArchiveIcon name="source" /></a><span v-else class="ha-source-unavailable">{{ annotation(event.dates[kind]!, sources) }} · {{ sourcesOffline ? '离线：原页暂不可用' : '原页暂不可用' }}</span></template>
          <span v-else class="ha-source-unavailable">{{ kind === 'textbook' ? '未找到可靠教材定位' : '原表未单列' }}</span>
        </div>
      </section>
      <section v-if="event.note"><h3>审核备注</h3><p class="ha-review-note">{{ event.note }}</p></section>
      <section class="ha-note"><div class="ha-section-heading"><h3>我的笔记</h3><span>{{ saveStatus }}</span></div><textarea :readonly="studyReadOnly" :value="note" aria-label="事件个人笔记" placeholder="记下你的理解、易混点或回忆线索…" rows="5" @input="$emit('note', ($event.target as HTMLTextAreaElement).value)" @blur="$emit('flush')" /><small>仅保存在本机，可在「我的学习」导出备份。</small></section>
      <div class="ha-tags"><span v-for="tag in event.tags" :key="tag">{{ tag }}</span></div>
    </div>
  </aside>
</template>
