<script setup lang="ts">
defineProps<{ name: string }>();
const paths: Record<string, string> = {
  explore: 'M3 5h18M3 12h18M3 19h18M7 3v4M16 10v4M10 17v4',
  compare: 'M4 4h6v16H4zM14 4h6v16h-6zM10 12h4',
  practice: 'M9 3h6v3H9zM7 5H5v16h14V5h-2M8 12l2 2 5-5M8 18h8',
  study: 'M5 3h14v18l-7-4-7 4z',
  search: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14M15 15l6 6',
  arrow: 'M4 12h16M14 6l6 6-6 6',
  source: 'M14 3h7v7M21 3l-10 10M11 5H4v16h16v-7',
  close: 'M5 5l14 14M19 5L5 19',
  check: 'M4 12l5 5L20 6',
  download: 'M12 3v12M7 10l5 5 5-5M4 17v4h16v-4',
  upload: 'M12 16V4M7 9l5-5 5 5M4 17v4h16v-4',
};
</script>
<template><svg class="ha-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.explore" /></svg></template>
