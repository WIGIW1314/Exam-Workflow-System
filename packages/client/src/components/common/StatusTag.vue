<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ status: string }>();

const tagType = computed(() => {
  if (props.status === 'approved') return 'success';
  if (props.status === 'rejected') return 'danger';
  return 'warning';
});

const label = computed(() => {
  if (props.status === 'approved') return '已通过';
  if (props.status === 'rejected') return '已驳回';
  return '待审核';
});
</script>

<template>
  <el-tag :type="tagType" effect="dark">{{ label }}</el-tag>
</template>
