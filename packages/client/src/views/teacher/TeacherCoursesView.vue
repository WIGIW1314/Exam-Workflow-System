<script setup lang="ts">
import { onMounted, ref } from 'vue';
import PageCard from '@/components/common/PageCard.vue';
import { apiGet } from '@/api';

const list = ref<any[]>([]);

async function loadData() {
  list.value = await apiGet('/courses/my');
}

onMounted(loadData);
</script>

<template>
  <PageCard title="我的课程" eyebrow="Teacher">
    <el-table :data="list">
      <el-table-column prop="semesterName" label="学期" />
      <el-table-column prop="courseCode" label="课程编号" width="120" />
      <el-table-column prop="courseName" label="课程名称" />
      <el-table-column prop="departmentName" label="教研室" width="140" />
      <el-table-column label="班级">
        <template #default="{ row }">{{ row.classes.map((item: any) => item.className).join('、') }}</template>
      </el-table-column>
    </el-table>
  </PageCard>
</template>
