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
  if (props.status === 'pending_dean') return '待教学院长审核';
  return '待教研室主任审核';
});
</script>

<template>
  <el-tag :type="tagType" effect="light">{{ label }}</el-tag>
</template>
