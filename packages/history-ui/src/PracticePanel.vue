<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getPrimaryDate, getTrainingEvents, gradeOrder } from '@history/core';
import type { Attempt, DateAssertion, HistoryEvent, HistoryRepository, SourceDocument } from '@history/core';
import ArchiveIcon from './ArchiveIcon.vue';
const props = defineProps<{ events: HistoryEvent[]; repository: HistoryRepository; sources: SourceDocument[]; sourcesOffline?: boolean; studyReadOnly?: boolean }>();
const emit = defineEmits<{ attempt: [value: Attempt]; select: [event: HistoryEvent] }>();
const eligible = computed(() => getTrainingEvents(props.events));
const mode = ref<'recall' | 'order'>('recall');
const cursor = ref(0);
const revealed = ref(false);
const recorded = ref(false);
const order = ref<string[]>([]);
const feedback = ref<{ correct: boolean; violations: string[] } | null>(null);
const current = computed(() => eligible.value[cursor.value % Math.max(eligible.value.length, 1)]);
const orderedEvents = computed(() => order.value.map(id => eligible.value.find(event => event.id === id)!).filter(Boolean));
function newOrder() {
  const offset = cursor.value % Math.max(1, eligible.value.length);
  const pool = [...eligible.value.slice(offset), ...eligible.value.slice(0, offset)].slice(0, 4);
  order.value = pool.sort(() => Math.random() - .5).map(event => event.id);
  feedback.value = null;
}
watch(eligible, newOrder, { immediate: true });
function record(correct: boolean, answer: string, eventIds: string[]) {
  if (props.studyReadOnly) return;
  emit('attempt', { id: globalThis.crypto?.randomUUID?.() || `attempt-${Date.now()}-${Math.random()}`, mode: mode.value, eventIds, correct, answer, createdAt: new Date().toISOString() });
}
function selfGrade(correct: boolean) {
  if (!current.value || recorded.value || props.studyReadOnly) return;
  record(correct, correct ? '已想起日期' : '尚未想起日期', [current.value.id]);
  recorded.value = true;
}
const sourceLink = (date: DateAssertion) => props.sourcesOffline ? null : props.repository.sourceUrl(date.sourceId, date.page);
function next() { cursor.value += 1; revealed.value = false; recorded.value = false; newOrder(); }
function move(index: number, delta: number) {
  const destination = index + delta;
  if (destination < 0 || destination >= order.value.length) return;
  const nextOrder = [...order.value];
  [nextOrder[index], nextOrder[destination]] = [nextOrder[destination]!, nextOrder[index]!];
  order.value = nextOrder; feedback.value = null;
}
function grade() {
  const result = gradeOrder(order.value, orderedEvents.value);
  feedback.value = { ...result, violations: result.violations.map(violation => {
    const pair = violation.split(':');
    const first = eligible.value.find(event => event.id === pair[0]);
    const second = eligible.value.find(event => event.id === pair[1]);
    return first && second ? `「${second.title}」应在「${first.title}」之前。` : violation;
  }) };
  record(feedback.value.correct, order.value.join(','), [...order.value]);
}
</script>
<template>
  <div class="ha-page-intro"><span class="ha-eyebrow">RECALL & RETRIEVE</span><h1>让时间成为记忆的线索</h1><p>先尝试回忆，再查看日期。练习只使用日期已核验的独立事件。</p></div>
  <div class="ha-practice-tabs"><button :class="{ active: mode === 'recall' }" @click="mode = 'recall'">隐藏日期回忆</button><button :class="{ active: mode === 'order' }" @click="mode = 'order'">先后顺序练习</button><span>{{ eligible.length }} 项可练习事件</span></div>
  <div v-if="!eligible.length" class="ha-empty">暂无符合训练条件的事件。待审核日期与原表合并组不会参与判分。</div>
  <section v-else-if="mode === 'recall' && current" class="ha-recall-sheet">
    <div class="ha-question-index">日期回忆 <span>{{ cursor + 1 }}</span></div><h2>{{ current.title }}</h2><p>{{ current.content }}</p>
    <div v-if="!revealed" class="ha-hidden-date"><span>?</span><p>发生在什么时候？在心里给出答案。</p><button class="ha-primary" @click="revealed = true">显示日期 <ArchiveIcon name="arrow" /></button></div>
    <div v-else class="ha-recall-answer"><strong>{{ getPrimaryDate(current)?.label }}</strong><a v-if="current.dates.textbook && sourceLink(current.dates.textbook)" :href="sourceLink(current.dates.textbook)!" target="_blank" rel="noopener">{{ sources.find(source => source.id === current.dates.textbook!.sourceId)?.title }} · PDF 第 {{ current.dates.textbook.page }} 页 <ArchiveIcon name="source" /></a><span v-else-if="current.dates.textbook" class="ha-source-unavailable">{{ sources.find(source => source.id === current.dates.textbook!.sourceId)?.title }} · {{ current.dates.textbook.page ? `PDF 第 ${current.dates.textbook.page} 页` : '页码未定位' }} · {{ sourcesOffline ? '离线：原页暂不可用' : '原页暂不可用' }}</span><p v-if="!sourcesOffline" class="ha-document-service-note">原页需要文档服务可用；静态部署未提供 PDF 时无法打开</p><div class="ha-answer-buttons"><button :disabled="recorded || studyReadOnly" @click="selfGrade(false)">还没记住</button><button class="ha-primary" :disabled="recorded || studyReadOnly" @click="selfGrade(true)">我想起来了</button></div><span v-if="recorded" class="ha-inline-success">已记录本次回忆</span></div>
    <footer><button class="ha-text-button" :disabled="!revealed" @click="emit('select', current)">查看完整出处</button><button class="ha-text-button" @click="next">下一项 <ArchiveIcon name="arrow" /></button></footer>
  </section>
  <section v-else class="ha-order-sheet"><div class="ha-section-heading"><h2>从早到晚排列</h2><button class="ha-text-button" @click="next">换一组</button></div><p>用上下按钮调整顺序。同年、同月或区间重叠而无法确定先后的事项允许并列。</p>
    <ol class="ha-order-list"><li v-for="(event, index) in orderedEvents" :key="event.id"><span class="ha-order-number">{{ String(index + 1).padStart(2, '0') }}</span><div><strong>{{ event.title }}</strong><small v-if="feedback">{{ getPrimaryDate(event)?.label }}</small></div><button :disabled="index === 0" :aria-label="`将${event.title}上移`" @click="move(index, -1)">↑</button><button :disabled="index === order.length - 1" :aria-label="`将${event.title}下移`" @click="move(index, 1)">↓</button></li></ol>
    <button class="ha-primary" :disabled="!!feedback || order.length < 2" @click="grade">检查顺序 <ArchiveIcon name="check" /></button><div v-if="feedback" class="ha-order-feedback" :class="{ correct: feedback.correct }" role="status"><strong>{{ feedback.correct ? '顺序成立' : '还有先后关系需要调整' }}</strong><p v-for="violation in feedback.violations" :key="violation">{{ violation }}</p><p v-if="feedback.correct">日期范围重叠的事件没有被强行区分先后。</p></div>
  </section>
</template>
