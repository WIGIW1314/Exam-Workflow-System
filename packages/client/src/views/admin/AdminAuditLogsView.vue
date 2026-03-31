<script setup lang="ts">
import { onMounted, ref } from 'vue';
import PageCard from '@/components/common/PageCard.vue';
import { apiGet, downloadFile } from '@/api';

const list = ref<any[]>([]);

async function loadData() {
  const data = await apiGet<any>('/audit-logs', { page: 1, pageSize: 200 });
  list.value = data.list;
}

async function exportLogs() {
  await downloadFile('/export/audit-logs', 'audit-logs.xlsx');
}

onMounted(loadData);
</script>

<template>
  <PageCard title="审计日志" eyebrow="Audit">
    <template #actions>
      <el-button @click="exportLogs">导出日志</el-button>
    </template>

    <el-table :data="list">
      <el-table-column prop="userName" label="用户" width="120" />
      <el-table-column prop="action" label="动作" width="160" />
      <el-table-column prop="module" label="模块" width="120" />
      <el-table-column prop="detail" label="详情" />
      <el-table-column prop="ipAddress" label="IP" width="140" />
      <el-table-column prop="createdAt" label="时间" width="180" />
    </el-table>
  </PageCard>
</template>
