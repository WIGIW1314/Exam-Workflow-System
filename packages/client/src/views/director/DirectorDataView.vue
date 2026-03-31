<script setup lang="ts">
import { onMounted, ref } from 'vue';
import PageCard from '@/components/common/PageCard.vue';
import StatusTag from '@/components/common/StatusTag.vue';
import { apiGet, downloadFile } from '@/api';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const list = ref<any[]>([]);

async function loadData() {
  if (!authStore.user?.departmentId) return;
  list.value = await apiGet(`/papers/department/${authStore.user.departmentId}`);
}

async function exportData() {
  await downloadFile('/export/papers', 'department-papers.xlsx');
}

onMounted(loadData);
</script>

<template>
  <PageCard title="本组数据总览" eyebrow="Department">
    <template #actions>
      <el-button @click="exportData">导出数据</el-button>
    </template>
    <el-table :data="list">
      <el-table-column prop="courseName" label="课程" />
      <el-table-column prop="teacherName" label="教师" width="120" />
      <el-table-column prop="paperNumber" label="试卷编号" width="180" />
      <el-table-column label="状态" width="120">
        <template #default="{ row }"><StatusTag :status="row.status" /></template>
      </el-table-column>
      <el-table-column prop="reviewerName" label="审核人" width="120" />
      <el-table-column prop="submittedAt" label="提交时间" width="180" />
    </el-table>
  </PageCard>
</template>
