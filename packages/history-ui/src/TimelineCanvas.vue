<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { getPrimaryDate, toDecimalYear } from '@history/core';
import type { HistoryEvent, Topic, SourceDocument } from '@history/core';
import { briefDateSource } from './dateCitation';
const props = defineProps<{ events: HistoryEvent[]; overviewEvents?: HistoryEvent[]; topics: Topic[]; sources: SourceDocument[]; window: { start: number; end: number }; fullRange: { start: number; end: number }; selectedId: string | null; compareIds: string[] }>();
const emit = defineEmits<{ select: [event: HistoryEvent]; window: [value: { start: number; end: number }]; cluster: [events: HistoryEvent[]] }>();
const canvas = ref<HTMLElement>();
const span = computed(() => Math.max(.02, props.window.end - props.window.start));
const position = (year: number) => ((year - props.window.start) / span.value) * 100;
const ticks = computed(() => {
  const step = span.value > 100 ? 20 : span.value > 40 ? 10 : span.value > 15 ? 5 : span.value > 4 ? 1 : 1 / 12;
  const result: { year: number; label: string; x: number }[] = [];
  for (let year = Math.ceil(props.window.start / step) * step; year < props.window.end; year += step) {
    const date = new Date(Date.UTC(Math.floor(year), Math.round((year % 1) * 12), 1));
    result.push({ year, label: step < 1 ? `${date.getUTCMonth() + 1}月` : String(Math.round(year)), x: position(year) });
  }
  return result;
});
const tracks = computed(() => props.topics.map(topic => {
  const bins = new Map<number, HistoryEvent[]>();
  for (const event of props.events.filter(item => item.topicId === topic.id)) {
    const date = getPrimaryDate(event);
    if (date?.start == null || date.end == null) continue;
    const start = toDecimalYear(date.start), end = toDecimalYear(date.end);
    if (end < props.window.start || start > props.window.end) continue;
    const x = Math.max(0, Math.min(98, position(start)));
    const bin = Math.floor(x / 13);
    bins.set(bin, [...(bins.get(bin) || []), event]);
  }
  return { ...topic, nodes: [...bins.values()].map((events, index) => {
    const preferred = events.find(event => event.id === props.selectedId) || events[0]!;
    const date = getPrimaryDate(preferred)!;
    const x = Math.max(0, Math.min(96, position(toDecimalYear(date.start!))));
    const end = Math.min(100, position(toDecimalYear(date.end!)));
    return { events, preferred, x, width: Math.max(.3, end - x), lane: index % 2, date };
  }) };
}));
const unknown = computed(() => props.events.filter(event => getPrimaryDate(event)?.start == null));
let drag: { x: number; start: number; end: number; width: number; mode: 'canvas' | 'overview' } | null = null;
const clamp = (start: number, end: number) => {
  const width = Math.min(end - start, props.fullRange.end - props.fullRange.start);
  start = Math.max(props.fullRange.start, Math.min(props.fullRange.end - width, start));
  return { start, end: start + width };
};
function startDrag(event: PointerEvent, mode: 'canvas' | 'overview') {
  if ((event.target as HTMLElement).closest('button') || event.button !== 0) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  let initial = props.window;
  if (mode === 'overview') {
    const year = props.fullRange.start + ((event.clientX - rect.left) / rect.width) * (props.fullRange.end - props.fullRange.start);
    initial = clamp(year - span.value / 2, year + span.value / 2);
    emit('window', initial);
  }
  drag = { x: event.clientX, start: initial.start, end: initial.end, width: rect.width, mode };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function moveDrag(event: PointerEvent) {
  if (!drag) return;
  const width = drag.mode === 'canvas' ? drag.end - drag.start : props.fullRange.end - props.fullRange.start;
  const delta = ((event.clientX - drag.x) / drag.width) * width * (drag.mode === 'canvas' ? -1 : 1);
  emit('window', clamp(drag.start + delta, drag.end + delta));
}
function stopDrag() { drag = null; }
onBeforeUnmount(stopDrag);
const overviewPosition = (year: number) => (year - props.fullRange.start) / (props.fullRange.end - props.fullRange.start) * 100;
const overviewEvents = computed(() => (props.overviewEvents || props.events).flatMap(event => {
  const date = getPrimaryDate(event);
  return date?.start == null ? [] : [{ id: event.id, x: overviewPosition(toDecimalYear(date.start)), topic: props.topics.find(t => t.id === event.topicId) }];
}));
</script>
<template>
  <div class="ha-axis-caption"><span>同步主题轨道</span><span>区间长度保留日期精度 · 点击聚合节点展开</span></div>
  <div ref="canvas" class="ha-timeline" @pointerdown="startDrag($event, 'canvas')" @pointermove="moveDrag" @pointerup="stopDrag" @pointercancel="stopDrag">
    <div class="ha-ruler"><span v-for="tick in ticks" :key="tick.year" :style="{ left: `${tick.x}%` }">{{ tick.label }}</span></div>
    <div v-for="track in tracks" :key="track.id" class="ha-track" :style="{ '--track-color': track.color }">
      <div class="ha-track-name"><i />{{ track.name }}<small>{{ events.filter(e => e.topicId === track.id).length }} 项</small></div>
      <div class="ha-track-plot">
        <svg class="ha-track-svg" viewBox="0 0 1000 146" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2="1000" y1="70" y2="70" class="ha-track-line" />
          <line v-for="tick in ticks" :key="tick.year" :x1="tick.x * 10" :x2="tick.x * 10" y1="0" y2="146" class="ha-grid-line" />
          <g v-for="node in track.nodes" :key="node.preferred.id">
            <line :x1="node.x * 10" :x2="(node.x + node.width) * 10" y1="70" y2="70" class="ha-interval" />
            <line :x1="node.x * 10" :x2="node.x * 10" y1="70" :y2="node.lane ? 94 : 46" class="ha-stem" />
          </g>
        </svg>
        <button v-for="node in track.nodes" :key="node.preferred.id" class="ha-node" :class="{ 'is-selected': node.events.some(e => e.id === selectedId), 'is-compared': node.events.some(e => compareIds.includes(e.id)), 'is-lower': node.lane }" :style="{ left: `${node.x}%`, transform: node.x > 84 ? 'translateX(calc(-100% + 4px))' : 'translateX(-1px)' }" @click="node.events.length > 1 ? emit('cluster', node.events) : emit('select', node.preferred)">
          <span class="ha-node-date">{{ node.date.label }}<b v-if="node.events.length > 1">+{{ node.events.length - 1 }}</b><small class="ha-brief-source">{{ briefDateSource(node.date, sources) }}</small></span><span class="ha-node-title">{{ node.preferred.title }}</span><span v-if="node.preferred.isGroup" class="ha-node-group">原表合并组</span>
        </button>
      </div>
    </div>
    <div v-if="unknown.length" class="ha-unknown"><span>未定位日期的{{ unknown.every(event => event.isGroup) ? '原表组' : '事项' }}</span><button v-for="event in unknown" :key="event.id" @click="emit('select', event)">{{ event.title }}</button></div>
    <div v-if="!events.length" class="ha-empty">当前筛选没有事件。尝试更换主题、年份或搜索词。</div>
  </div>
  <div class="ha-overview-caption"><span>全史总览 <b>{{ Math.floor(fullRange.start) }}—{{ Math.ceil(fullRange.end) - 1 }}</b></span><span>拖动或点击定位 · 上方箭头可逐段移动</span></div>
  <div class="ha-overview" aria-label="全史时间窗口" @pointerdown="startDrag($event, 'overview')" @pointermove="moveDrag" @pointerup="stopDrag" @pointercancel="stopDrag">
    <svg viewBox="0 0 1000 52" preserveAspectRatio="none" aria-hidden="true"><line v-for="event in overviewEvents" :key="event.id" :x1="event.x * 10" :x2="event.x * 10" y1="13" y2="39" :stroke="event.topic?.color || '#8a939a'" stroke-width="2" opacity=".55" /></svg>
    <div class="ha-overview-window" :style="{ left: `${overviewPosition(window.start)}%`, width: `${(window.end-window.start)/(fullRange.end-fullRange.start)*100}%` }"><i /><i /></div>
  </div>
</template>
