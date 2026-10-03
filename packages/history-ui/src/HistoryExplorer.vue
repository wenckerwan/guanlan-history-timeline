<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { filterEvents, getPrimaryDate, makeInitialStudyState, toDecimalYear, zoomWindow } from '@history/core';
import type { DateAssertion, HistoryDataset, HistoryEvent, HistoryRepository, StudyRepository, StudyState, ViewState, Attempt } from '@history/core';
import { LocalHistoryRepository, IndexedDbStudyRepository } from '@history/adapters';
import ArchiveIcon from './ArchiveIcon.vue';
import EvidencePanel from './EvidencePanel.vue';
import TimelineCanvas from './TimelineCanvas.vue';
import PracticePanel from './PracticePanel.vue';
import { briefDateSource } from './dateCitation';
import { createHashRouter, type HistoryRouter } from './router';
import './styles.css';
const props = defineProps<{ repository?: HistoryRepository; studyRepository?: StudyRepository; router?: HistoryRouter; initialQuery?: string }>();
const repository = props.repository || new LocalHistoryRepository();
const studyRepository = props.studyRepository || new IndexedDbStudyRepository();
const router = props.router || createHashRouter();
type Nav = 'explore' | 'compare' | 'practice' | 'study';
const nav = ref<Nav>('explore');
const navigation: { id: Nav; label: string; english: string }[] = [{ id: 'explore', label: '时间探索', english: 'EXPLORE' }, { id: 'compare', label: '事件对照', english: 'COMPARE' }, { id: 'practice', label: '主动回忆', english: 'PRACTICE' }, { id: 'study', label: '我的学习', english: 'MY ARCHIVE' }];
const dataset = ref<HistoryDataset | null>(null);
const study = ref<StudyState>(makeInitialStudyState());
const loading = ref(true), loadError = ref(''), message = ref(''), contentWarning = ref('');
const saveStatus = ref('本机保存');
const studyWritable = ref(false), studyRestoreError = ref(''), restoringStudy = ref(false);
const sourcesOffline = ref(typeof navigator !== 'undefined' && !navigator.onLine);
const windowRange = ref({ start: 1839, end: 2010 });
const selectedId = ref<string | null>(null), compareIds = ref<string[]>([]), topicIds = ref<string[]>([]), query = ref(''), archive = ref(false);
const yearInput = ref(''), cluster = ref<HistoryEvent[]>([]), panelOpen = ref(true), compareTab = ref<'events' | 'dates'>('events');
const backupInput = ref<HTMLInputElement>();
const ready = ref(false);
const selected = computed(() => dataset.value?.events.find(event => event.id === selectedId.value && event.publication !== 'pending') || null);
const compared = computed(() => compareIds.value.flatMap(id => {
  const event = dataset.value?.events.find(event => event.id === id && event.publication !== 'pending');
  return event ? [event] : [];
}));
const visible = computed(() => dataset.value ? filterEvents(dataset.value.events, { query: query.value, topicIds: topicIds.value, start: windowRange.value.start, end: windowRange.value.end, archive: archive.value }) : []);
const overviewEvents = computed(() => dataset.value ? filterEvents(dataset.value.events, { query: query.value, topicIds: topicIds.value, archive: archive.value }) : []);
const displayedTopics = computed(() => dataset.value?.topics.filter(topic => !topicIds.value.length || topicIds.value.includes(topic.id)) || []);
const bookmarks = computed(() => dataset.value?.events.filter(event => study.value.bookmarks.includes(event.id) && event.publication !== 'pending') || []);
const noteEvents = computed(() => dataset.value?.events.filter(event => study.value.notes[event.id]?.trim()) || []);
const periodLabel = computed(() => `${Math.floor(windowRange.value.start)}—${Math.max(Math.floor(windowRange.value.start), Math.ceil(windowRange.value.end) - 1)}`);
const scale = computed(() => windowRange.value.end - windowRange.value.start > 30 ? 'all' : windowRange.value.end - windowRange.value.start > 2 ? 'decade' : 'year');
const attemptSuccess = computed(() => study.value.attempts.filter(attempt => attempt.correct).length);
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let messageTimer: ReturnType<typeof setTimeout> | undefined;
let saveChain: Promise<void> = Promise.resolve();
let saveRevision = 0;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function notify(text: string) { message.value = text; clearTimeout(messageTimer); messageTimer = setTimeout(() => { message.value = ''; }, 5000); }
function currentView(): ViewState { return { ...windowRange.value, selectedId: selectedId.value, topicIds: [...topicIds.value], query: query.value, compareIds: [...compareIds.value], archive: archive.value }; }
function flushSave(): Promise<void> {
  clearTimeout(saveTimer);
  if (!ready.value || !studyWritable.value) return saveChain;
  const snapshot = clone(study.value), revision = ++saveRevision;
  saveStatus.value = '正在保存…';
  saveChain = saveChain.catch(() => {}).then(async () => {
    try { if (!studyWritable.value) return; await studyRepository.save(snapshot); if (revision === saveRevision) saveStatus.value = '已保存在本机'; }
    catch (error) { saveStatus.value = '保存失败'; notify(`学习记录保存失败：${error instanceof Error ? error.message : '请检查浏览器存储空间'}`); throw error; }
  });
  void saveChain.catch(() => {});
  return saveChain;
}
function scheduleSave() { if (!ready.value || !studyWritable.value) return; saveStatus.value = '正在保存…'; clearTimeout(saveTimer); saveTimer = setTimeout(() => { void flushSave(); }, 250); }
async function restoreStudy(): Promise<StudyState | null> {
  studyWritable.value = false; restoringStudy.value = true; clearTimeout(saveTimer);
  try {
    const saved = await studyRepository.load();
    studyRestoreError.value = ''; saveStatus.value = '已恢复本机记录'; studyWritable.value = true;
    return saved;
  } catch (error) {
    studyRestoreError.value = error instanceof Error ? error.message : '存储读取不可用';
    saveStatus.value = '只读 · 学习记录恢复失败';
    return null;
  } finally { restoringStudy.value = false; }
}
async function retryStudyRestore() {
  if (restoringStudy.value) return;
  const saved = await restoreStudy();
  if (!saved) return;
  study.value = saved;
  if (saved.view) applyView(saved.view);
  notify('原有学习记录已恢复，可以继续保存');
}
function canEditStudy(): boolean {
  if (studyWritable.value) return true;
  notify('当前为只读模式，请先重试恢复学习记录');
  return false;
}
function applyView(view: ViewState) {
  setWindow({ start: view.start, end: view.end }); selectedId.value = view.selectedId; query.value = view.query || ''; topicIds.value = view.topicIds || []; compareIds.value = (view.compareIds || []).slice(0, 3); archive.value = !!view.archive;
}
function readHash() {
  const parsed = router.parse();
  if (parsed.nav && navigation.some(item => item.id === parsed.nav)) nav.value = parsed.nav as Nav;
  const view = parsed.view;
  if (view.start !== undefined && view.end !== undefined) setWindow({ start: view.start, end: view.end });
  if (parsed.selectedId !== null && parsed.selectedId !== undefined) selectedId.value = parsed.selectedId;
  if (view.compareIds) compareIds.value = view.compareIds.slice(0, 3);
  if (view.query !== undefined) query.value = view.query;
  if (view.topicIds) topicIds.value = view.topicIds;
  if (view.archive !== undefined) archive.value = !!view.archive;
  panelOpen.value = !!selectedId.value;
}
function writeHash(push = false) {
  if (!ready.value) return;
  router.write({ nav: nav.value, view: currentView() }, push);
}
function navigate(value: Nav) { nav.value = value; writeHash(true); }
function selectEvent(event: HistoryEvent) { selectedId.value = event.id; panelOpen.value = true; cluster.value = []; writeHash(true); }
function setWindow(value: { start: number; end: number }) {
  const range = dataset.value?.range || { start: 1839, end: 2010 };
  const width = Math.min(Math.max(.08, value.end - value.start), range.end - range.start);
  const start = Math.max(range.start, Math.min(range.end - width, value.start));
  windowRange.value = { start, end: start + width };
}
function focusYear() { const date = selected.value && getPrimaryDate(selected.value); return date?.start != null ? toDecimalYear(date.start) : (windowRange.value.start + windowRange.value.end) / 2; }
function setScale(value: string) {
  if (value === 'all') setWindow(dataset.value!.range);
  else { const year = Math.floor(focusYear()); const start = value === 'decade' ? year - 5 : year; setWindow({ start, end: start + (value === 'decade' ? 10 : 1) }); }
}
function zoom(factor: number) { setWindow(zoomWindow(windowRange.value, factor, focusYear())); }
function pan(direction: number) { const delta = (windowRange.value.end - windowRange.value.start) * .4 * direction; setWindow({ start: windowRange.value.start + delta, end: windowRange.value.end + delta }); }
function jump() { const year = Number(yearInput.value); if (!yearInput.value || !Number.isInteger(year) || year < 1839 || year > 2009) { notify('请输入 1839—2009 之间的整数年份'); return; } const width = Math.min(10, windowRange.value.end - windowRange.value.start); setWindow({ start: year - width / 2, end: year + width / 2 }); }
function toggleTopic(id: string) { topicIds.value = topicIds.value.includes(id) ? topicIds.value.filter(item => item !== id) : [...topicIds.value, id]; }
function bookmark(event: HistoryEvent) { if (!canEditStudy()) return; study.value.bookmarks = study.value.bookmarks.includes(event.id) ? study.value.bookmarks.filter(id => id !== event.id) : [...study.value.bookmarks, event.id]; void flushSave(); }
function compare(event: HistoryEvent) { if (compareIds.value.includes(event.id)) compareIds.value = compareIds.value.filter(id => id !== event.id); else if (compareIds.value.length < 3) compareIds.value = [...compareIds.value, event.id]; else notify('最多比较 3 项，请先移出一项'); }
function updateNote(text: string) { if (studyWritable.value && selected.value) study.value.notes[selected.value.id] = text; }
function addAttempt(attempt: Attempt) { if (!canEditStudy()) return; study.value.attempts.push(attempt); void flushSave(); }
function sourceAnnotation(date: DateAssertion) { return `${dataset.value?.sources.find(source => source.id === date.sourceId)?.title || '来源未登记'}${date.page ? ` · PDF 第 ${date.page} 页` : ' · 页码未定位'}`; }
function sourceLink(date: DateAssertion): string | null { return sourcesOffline.value ? null : repository.sourceUrl(date.sourceId, date.page); }
async function exportBackup() {
  if (!canEditStudy()) return;
  try { await flushSave(); const text = await studyRepository.exportBackup(); const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `近现代史学习备份-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('学习备份已导出'); }
  catch (error) { notify(`导出失败：${error instanceof Error ? error.message : '无法读取学习记录'}`); }
}
async function importBackup(event: Event) {
  if (!canEditStudy()) { if (backupInput.value) backupInput.value.value = ''; return; }
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
  try { const text = await file.text(); await flushSave(); const imported = await studyRepository.importBackup(text); study.value = imported; if (imported.view) applyView(imported.view); notify('有效备份已合并到本机学习记录'); }
  catch (error) { notify(`导入失败：${error instanceof Error ? error.message : '备份格式无效'}`); }
  finally { if (backupInput.value) backupInput.value.value = ''; }
}
watch([windowRange, selectedId, topicIds, query, compareIds, archive], () => { if (!ready.value) return; study.value.view = currentView(); scheduleSave(); writeHash(); }, { deep: true });
watch(study, scheduleSave, { deep: true });
async function initialize() {
  loading.value = true; loadError.value = '';
  try {
    const [data, saved] = await Promise.all([repository.loadDataset(), restoreStudy()]);
    dataset.value = data; study.value = saved || makeInitialStudyState();
    if (repository instanceof LocalHistoryRepository) { contentWarning.value = repository.status.warning || ''; sourcesOffline.value = repository.status.source === 'cache' || !navigator.onLine; }
    setWindow(data.range); if (saved?.view) applyView(saved.view); readHash();
    const ids = new Set(data.events.filter(event => event.publication !== 'pending').map(event => event.id));
    if (selectedId.value && !ids.has(selectedId.value)) { selectedId.value = null; notify('链接中的事件不存在于当前数据版本'); }
    compareIds.value = compareIds.value.filter(id => ids.has(id));
    topicIds.value = topicIds.value.filter(id => data.topics.some(topic => topic.id === id));
    await nextTick(); ready.value = true; study.value.view = currentView(); writeHash();
  } catch (error) { loadError.value = error instanceof Error ? error.message : '数据无法加载'; }
  finally { loading.value = false; }
}
function handleKeyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') { panelOpen.value = false; cluster.value = []; }
  if (event.key === '/' && !(event.target as HTMLElement).closest('input,textarea,[contenteditable]') && nav.value === 'explore') { event.preventDefault(); document.querySelector<HTMLInputElement>('.history-archive .ha-search input')?.focus(); }
}
function handlePageHide() { void flushSave(); }
function handleNetwork() { sourcesOffline.value = !navigator.onLine; }
let unlistenRouter: (() => void) | undefined;
onMounted(() => { void initialize(); unlistenRouter = router.listen(readHash); window.addEventListener('keydown', handleKeyboard); window.addEventListener('pagehide', handlePageHide); window.addEventListener('offline', handleNetwork); window.addEventListener('online', handleNetwork); });
onBeforeUnmount(() => { clearTimeout(saveTimer); clearTimeout(messageTimer); void flushSave(); unlistenRouter?.(); window.removeEventListener('keydown', handleKeyboard); window.removeEventListener('pagehide', handlePageHide); window.removeEventListener('offline', handleNetwork); window.removeEventListener('online', handleNetwork); });
</script>
<template>
  <div class="history-archive">
    <a class="ha-skip-link" href="#ha-main">跳到主要内容</a>
    <aside class="ha-sidebar"><a class="ha-brand" href="#/explore" @click.prevent="navigate('explore')"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 10h24M8 20h24M8 30h24M14 6v8M26 16v8M19 26v8" fill="none" stroke="currentColor" stroke-width="2" /></svg><span>史<br>间</span></a><nav aria-label="主要导航"><button v-for="item in navigation" :key="item.id" :class="{ active: nav === item.id }" :aria-current="nav === item.id ? 'page' : undefined" @click="navigate(item.id)"><ArchiveIcon :name="item.id" /><span>{{ item.label }}</span><small>{{ item.english }}</small></button></nav><div class="ha-sidebar-footer"><span>1839<br><i />2009</span><small>中国近现代史<br>时间实验室</small></div></aside>
    <div class="ha-workspace"><header class="ha-topbar"><span>中国近现代史 / 时间实验室</span><div><i class="ha-local-dot" />本地学习 <span class="ha-version">{{ dataset?.version || '加载中' }}</span></div></header>
      <main id="ha-main" class="ha-main" tabindex="-1">
        <div v-if="contentWarning" class="ha-content-warning" role="status">{{ contentWarning }}</div>
        <div v-if="studyRestoreError" class="ha-storage-warning" role="alert"><div><strong>学习记录恢复失败 · 当前只读</strong><p>已暂停收藏、笔记、练习记录保存与备份导入，保护本机已有记录。{{ studyRestoreError }}</p></div><button :disabled="restoringStudy" @click="retryStudyRestore">{{ restoringStudy ? '正在重试恢复…' : '重试恢复学习记录' }}</button></div>
        <div v-if="loading" class="ha-loading" role="status"><span class="ha-loading-line" /><h1>正在打开历史档案</h1><p>读取事件与本机学习记录…</p></div>
        <div v-else-if="loadError" class="ha-empty" role="alert"><h1>档案暂时无法打开</h1><p>{{ loadError }}</p><button class="ha-primary" @click="initialize">重新加载</button></div>
        <template v-else-if="dataset">
          <div v-if="nav === 'explore'" class="ha-explore-layout" :class="{ 'has-panel': selected && panelOpen }">
            <section class="ha-explore-main"><div class="ha-page-intro ha-explore-intro"><div><span class="ha-eyebrow">THE CHRONOLOGY OF MODERN CHINA</span><h1>在时间中，读懂历史</h1><p>循着事件与原始出处，建立自己的历史坐标。</p></div><div class="ha-period"><strong>{{ periodLabel }}</strong><span>当前时间窗口 · {{ visible.length }} 项档案</span></div></div>
              <div class="ha-toolbar"><label class="ha-search"><ArchiveIcon name="search" /><input v-model="query" type="search" placeholder="搜索事件、人物、会议…" aria-label="搜索事件" /><kbd>/</kbd></label><div class="ha-scale" aria-label="时间尺度"><button v-for="item in [{ id: 'all', label: '总览' }, { id: 'decade', label: '十年' }, { id: 'year', label: '年' }]" :key="item.id" :class="{ active: scale === item.id }" @click="setScale(item.id)">{{ item.label }}</button></div><div class="ha-zoom"><button aria-label="缩小时间轴" @click="zoom(2)">−</button><button aria-label="放大时间轴" @click="zoom(.5)">＋</button></div></div>
              <div class="ha-filterbar"><div class="ha-topic-filters"><button :class="{ active: !topicIds.length }" @click="topicIds = []">全部主题</button><button v-for="topic in dataset.topics" :key="topic.id" :class="{ active: topicIds.includes(topic.id) }" :style="{ '--topic-color': topic.color }" @click="toggleTopic(topic.id)"><i />{{ topic.name }}</button></div><label class="ha-archive-toggle"><input v-model="archive" type="checkbox" />原表合并组</label></div>
              <div class="ha-window-controls"><form @submit.prevent="jump"><label for="ha-year">定位年份</label><input id="ha-year" v-model="yearInput" inputmode="numeric" placeholder="如 1919" maxlength="4" /><button type="submit">前往</button></form><div><button aria-label="时间窗口向前移动" @click="pan(-1)">←</button><span>{{ periodLabel }}</span><button aria-label="时间窗口向后移动" @click="pan(1)">→</button></div></div>
              <TimelineCanvas :events="visible" :overview-events="overviewEvents" :topics="displayedTopics" :sources="dataset.sources" :window="windowRange" :full-range="dataset.range" :selected-id="selectedId" :compare-ids="compareIds" @select="selectEvent" @window="setWindow" @cluster="cluster = $event" />
              <div v-if="cluster.length" class="ha-cluster-list"><div class="ha-section-heading"><h3>此时段的 {{ cluster.length }} 项档案</h3><button class="ha-icon-button" aria-label="关闭聚合列表" @click="cluster = []"><ArchiveIcon name="close" /></button></div><button v-for="event in cluster" :key="event.id" @click="selectEvent(event)"><span>{{ getPrimaryDate(event)?.label || '日期未知' }}<small class="ha-brief-source">{{ briefDateSource(getPrimaryDate(event), dataset.sources) }}</small></span><strong>{{ event.title }}</strong><small v-if="event.isGroup">原表合并组</small><ArchiveIcon name="arrow" /></button></div>
              <div class="ha-timeline-footnote"><span>年份、月份和时段以区间呈现；同期不代表因果关系。</span><button v-if="selected && !panelOpen" class="ha-text-button" @click="panelOpen = true">打开所选档案</button></div>
            </section>
            <EvidencePanel v-if="selected && panelOpen" :event="selected" :sources="dataset.sources" :repository="repository" :bookmarked="study.bookmarks.includes(selected.id)" :compared="compareIds.includes(selected.id)" :note="study.notes[selected.id] || ''" :save-status="saveStatus" :study-read-only="!studyWritable" :sources-offline="sourcesOffline" @close="panelOpen = false" @bookmark="bookmark(selected)" @compare="compare(selected)" @note="updateNote" @flush="flushSave" />
          </div>
          <section v-else-if="nav === 'compare'" class="ha-document-page"><div class="ha-page-intro"><span class="ha-eyebrow">READ SIDE BY SIDE</span><h1>并置事件，分辨时间</h1><p>选择 2—3 项比较日期与原文；待审核的日期对照独立陈列。</p></div><div class="ha-practice-tabs"><button :class="{ active: compareTab === 'events' }" @click="compareTab = 'events'">事件比较 <span>{{ compared.length }}/3</span></button><button :class="{ active: compareTab === 'dates' }" @click="compareTab = 'dates'">待审核日期对照 <span>{{ dataset.comparisons.length }}</span></button></div>
            <p v-if="!sourcesOffline" class="ha-document-service-note ha-compare-service-note">原页需要文档服务可用；静态部署未提供 PDF 时无法打开</p><template v-if="compareTab === 'events'"><div v-if="compared.length < 2" class="ha-comparison-hint"><p>在时间轴的档案面板中「加入比较」，即可并排阅读。</p><button class="ha-primary" @click="navigate('explore')">去选择事件 <ArchiveIcon name="arrow" /></button></div><div v-if="compared.length" class="ha-comparison-grid" :style="{ '--compare-count': compared.length }"><article v-for="event in compared" :key="event.id"><header><span>{{ event.isGroup ? '原表合并组' : '独立事件' }}</span><button class="ha-icon-button" :aria-label="`移出${event.title}`" @click="compare(event)"><ArchiveIcon name="close" /></button></header><h2>{{ event.title }}</h2><div class="ha-compare-date">{{ getPrimaryDate(event)?.label || '日期未知' }}<small class="ha-brief-source">{{ briefDateSource(getPrimaryDate(event), dataset.sources) }}</small></div><p>{{ event.content }}</p><section class="ha-dates"><div v-for="kind in (['textbook', 'original'] as const)" :key="kind" class="ha-date-assertion"><span class="ha-field-label">{{ kind === 'textbook' ? '教材时间' : '原 PDF 时间' }}</span><template v-if="event.dates[kind]"><strong>{{ event.dates[kind]!.label }}</strong><a v-if="sourceLink(event.dates[kind]!)" :href="sourceLink(event.dates[kind]!)!" target="_blank" rel="noopener">{{ sourceAnnotation(event.dates[kind]!) }}<ArchiveIcon name="source" /></a><span v-else>{{ sourceAnnotation(event.dates[kind]!) }} · 原页暂不可用</span></template><span v-else>{{ kind === 'textbook' ? '未找到可靠教材定位' : '原表未单列' }}</span></div></section><p v-if="event.note" class="ha-review-note">{{ event.note }}</p><button class="ha-text-button" @click="selectEvent(event); navigate('explore')">打开档案 <ArchiveIcon name="arrow" /></button></article></div></template>
            <div v-else class="ha-pending-comparisons"><div class="ha-pending-notice">以下事项保持待审核状态，不进入正式时间轴或练习答案。</div><article v-for="item in dataset.comparisons" :key="item.id"><h2>{{ item.title }}</h2><div class="ha-pending-date"><strong>{{ item.textbook.label }}</strong><a v-if="sourceLink(item.textbook)" :href="sourceLink(item.textbook)!" target="_blank" rel="noopener">{{ sourceAnnotation(item.textbook) }}<ArchiveIcon name="source" /></a><span v-else>{{ sourceAnnotation(item.textbook) }} · 原页暂不可用</span></div><div class="ha-pending-date"><template v-if="item.original"><strong>{{ item.original.label }}</strong><a v-if="sourceLink(item.original)" :href="sourceLink(item.original)!" target="_blank" rel="noopener">{{ sourceAnnotation(item.original) }}<ArchiveIcon name="source" /></a><span v-else>{{ sourceAnnotation(item.original) }} · 原页暂不可用</span></template><span v-else>原表未单列</span></div></article></div>
          </section>
          <section v-else-if="nav === 'practice'" class="ha-document-page"><PracticePanel :events="dataset.events" :repository="repository" :sources="dataset.sources" :sources-offline="sourcesOffline" :study-read-only="!studyWritable" @attempt="addAttempt" @select="selectEvent($event); navigate('explore')" /></section>
          <section v-else class="ha-document-page"><div class="ha-page-intro"><span class="ha-eyebrow">YOUR PERSONAL ARCHIVE</span><h1>留下你的学习轨迹</h1><p>收藏、笔记与练习记录保存在本机浏览器中。</p></div><div class="ha-study-summary"><div><strong>{{ bookmarks.length }}</strong><span>收藏档案</span></div><div><strong>{{ noteEvents.length }}</strong><span>个人笔记</span></div><div><strong>{{ study.attempts.length }}</strong><span>练习记录</span></div><div><strong>{{ attemptSuccess }}</strong><span>正确 / 已想起</span></div></div><div class="ha-backup-bar"><span><i class="ha-local-dot" />{{ saveStatus }}</span><div><button :disabled="!studyWritable" @click="exportBackup"><ArchiveIcon name="download" />导出备份</button><button :disabled="!studyWritable" @click="backupInput?.click()"><ArchiveIcon name="upload" />导入合并</button><input ref="backupInput" hidden type="file" accept=".json,application/json" aria-label="选择学习备份" @change="importBackup" /></div></div>
            <section class="ha-study-section"><h2>收藏的档案 <small>{{ bookmarks.length }}</small></h2><p v-if="!bookmarks.length" class="ha-empty-inline">在事件详情中收藏，值得反复阅读的档案会留在这里。</p><div v-for="event in bookmarks" :key="event.id" class="ha-study-row"><span>{{ getPrimaryDate(event)?.label || '日期未知' }}<small class="ha-brief-source">{{ briefDateSource(getPrimaryDate(event), dataset.sources) }}</small></span><button class="ha-study-title" @click="selectEvent(event); navigate('explore')">{{ event.title }}</button><button class="ha-text-button" @click="bookmark(event)">取消收藏</button></div></section>
            <section class="ha-study-section"><h2>我的笔记 <small>{{ noteEvents.length }}</small></h2><p v-if="!noteEvents.length" class="ha-empty-inline">打开事件详情，写下自己的理解与回忆线索。</p><article v-for="event in noteEvents" :key="event.id" class="ha-note-entry"><button class="ha-study-title" @click="selectEvent(event); navigate('explore')">{{ event.title }} <ArchiveIcon name="arrow" /></button><p>{{ study.notes[event.id] }}</p></article></section>
            <section class="ha-study-section"><h2>最近练习</h2><p v-if="!study.attempts.length" class="ha-empty-inline">完成一次回忆或排序练习后，这里会记录结果。</p><div v-for="attempt in [...study.attempts].reverse().slice(0, 20)" :key="attempt.id" class="ha-attempt-row"><span>{{ attempt.mode === 'recall' ? '日期回忆' : '先后排序' }}</span><strong>{{ attempt.correct ? '正确 / 已想起' : '需要再练习' }}</strong><time>{{ new Date(attempt.createdAt).toLocaleString('zh-CN') }}</time></div></section>
          </section>
        </template>
      </main>
      <footer class="ha-app-footer"><span>近现代史时间实验室</span><span>教材日期与原表日期分别保留 · 内容版本 {{ dataset?.version || '—' }}</span></footer>
    </div>
    <div v-if="compared.length && nav === 'explore'" class="ha-compare-tray"><ArchiveIcon name="compare" /><span>已选 {{ compared.length }} / 3 项</span><button :disabled="compared.length < 2" @click="navigate('compare')">开始比较 <ArchiveIcon name="arrow" /></button></div>
    <div v-if="message" class="ha-toast" role="status">{{ message }}<button aria-label="关闭提示" @click="message = ''"><ArchiveIcon name="close" /></button></div>
  </div>
</template>
