<script setup lang="ts">
import { onMounted, ref } from 'vue';
import PageCard from '@/components/common/PageCard.vue';
import StatusTag from '@/components/common/StatusTag.vue';
import { apiGet } from '@/api';

const list = ref<any[]>([]);

async function loadData() {
  list.value = await apiGet('/papers/all');
}

onMounted(loadData);
</script>

<template>
  <PageCard title="试卷总览" eyebrow="Workflow">
    <el-table :data="list">
      <el-table-column prop="courseName" label="课程" />
      <el-table-column prop="teacherName" label="教师" width="120" />
      <el-table-column prop="departmentName" label="教研室" width="140" />
      <el-table-column prop="paperNumber" label="试卷编号" width="180" />
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <StatusTag :status="row.status" />
        </template>
      </el-table-column>
      <el-table-column prop="submittedAt" label="提交时间" width="180" />
      <el-table-column prop="reviewerName" label="审核人" width="120" />
      <el-table-column prop="rejectReason" label="驳回原因" />
    </el-table>
  </PageCard>
</template>
