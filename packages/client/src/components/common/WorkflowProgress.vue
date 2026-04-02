<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  status: string;
  rejectionStage?: string | null;
}>();

interface WorkflowNode {
  key: string;
  label: string;
  state: 'done' | 'current' | 'pending' | 'rejected';
}

const nodes = computed<WorkflowNode[]>(() => {
  if (props.status === 'rejected') {
    if (props.rejectionStage === 'academic_dean' || props.rejectionStage === 'academic_dean_review') {
      return [
        { key: 'submit', label: '教师提交', state: 'done' },
        { key: 'director', label: '教研室主任审核', state: 'pending' },
        { key: 'dean', label: '教学院长审核', state: 'rejected' },
        { key: 'done', label: '审核通过', state: 'pending' },
      ];
    }

    return [
      { key: 'submit', label: '教师提交', state: 'done' },
      { key: 'director', label: '教研室主任审核', state: 'rejected' },
      { key: 'dean', label: '教学院长审核', state: 'pending' },
      { key: 'done', label: '审核通过', state: 'pending' },
    ];
  }

  if (props.status === 'approved') {
    return [
      { key: 'submit', label: '教师提交', state: 'done' },
      { key: 'director', label: '教研室主任审核', state: 'done' },
      { key: 'dean', label: '教学院长审核', state: 'done' },
      { key: 'done', label: '审核通过', state: 'current' },
    ];
  }

  if (props.status === 'pending_dean') {
    return [
      { key: 'submit', label: '教师提交', state: 'done' },
      { key: 'director', label: '教研室主任审核', state: 'done' },
      { key: 'dean', label: '教学院长审核', state: 'current' },
      { key: 'done', label: '审核通过', state: 'pending' },
    ];
  }

  return [
    { key: 'submit', label: '教师提交', state: 'done' },
    { key: 'director', label: '教研室主任审核', state: 'current' },
    { key: 'dean', label: '教学院长审核', state: 'pending' },
    { key: 'done', label: '审核通过', state: 'pending' },
  ];
});
</script>

<template>
  <div class="workflow-progress" :class="`is-${status}`">
    <div
      v-for="(node, index) in nodes"
      :key="node.key"
      class="workflow-progress__item"
      :class="`is-${node.state}`"
    >
      <span class="workflow-progress__dot" />
      <span class="workflow-progress__label">{{ node.label }}</span>
      <span v-if="index < nodes.length - 1" class="workflow-progress__line" />
    </div>
  </div>
</template>

<style scoped>
.workflow-progress {
  display: flex;
  align-items: flex-start;
  min-width: 220px;
  gap: 0;
}

.workflow-progress__item {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  padding-right: 14px;
}

.workflow-progress__dot {
  display: block;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  margin-bottom: 8px;
  background: #cbd5e1;
  border: 2px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 0 0 1px rgba(203, 213, 225, 0.9);
}

.workflow-progress__label {
  display: block;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
}

.workflow-progress__line {
  position: absolute;
  top: 4px;
  left: 16px;
  right: 8px;
  height: 2px;
  background: rgba(203, 213, 225, 0.9);
}

.workflow-progress__item.is-done .workflow-progress__dot {
  background: #67c23a;
  box-shadow: 0 0 0 1px rgba(103, 194, 58, 0.22);
}

.workflow-progress__item.is-done .workflow-progress__line {
  background: linear-gradient(90deg, #67c23a, rgba(103, 194, 58, 0.4));
}

.workflow-progress__item.is-done .workflow-progress__label {
  color: #4b5563;
}

.workflow-progress__item.is-current .workflow-progress__dot {
  background: #409eff;
  box-shadow: 0 0 0 4px rgba(64, 158, 255, 0.14);
}

.workflow-progress.is-approved .workflow-progress__item.is-current .workflow-progress__dot {
  background: #67c23a;
  box-shadow: 0 0 0 4px rgba(103, 194, 58, 0.14);
}

.workflow-progress__item.is-current .workflow-progress__label {
  color: #1d4ed8;
  font-weight: 600;
}

.workflow-progress.is-approved .workflow-progress__item.is-current .workflow-progress__label {
  color: #15803d;
}

.workflow-progress__item.is-rejected .workflow-progress__dot {
  background: #f56c6c;
  box-shadow: 0 0 0 4px rgba(245, 108, 108, 0.14);
}

.workflow-progress__item.is-rejected .workflow-progress__label {
  color: #dc2626;
  font-weight: 600;
}
</style>
