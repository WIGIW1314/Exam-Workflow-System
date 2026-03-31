<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import PageCard from '@/components/common/PageCard.vue';
import { apiGet } from '@/api';

const list = ref<any[]>([]);
const page = ref(1);
const pageSize = ref(10);

async function loadData() {
  list.value = await apiGet('/courses/my');
}

const pagedList = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return list.value.slice(start, start + pageSize.value);
});

function handlePageChange(nextPage: number) {
  page.value = nextPage;
}

onMounted(loadData);
</script>

<template>
  <PageCard fill>
    <div class="page-table">
      <el-table border :data="pagedList">
        <el-table-column prop="semesterName" label="学期" />
        <el-table-column prop="courseCode" label="课程编号" width="120" />
        <el-table-column prop="courseName" label="课程名称" />
        <el-table-column prop="departmentName" label="教研室" width="140" />
        <el-table-column label="班级">
          <template #default="{ row }">{{ row.classes.map((item: any) => item.className).join('、') }}</template>
        </el-table-column>
      </el-table>
    </div>

    <div class="page-pagination">
      <el-pagination
        background
        layout="total, prev, pager, next"
        :current-page="page"
        :page-size="pageSize"
        :total="list.length"
        @current-change="handlePageChange"
      />
    </div>
  </PageCard>
</template>
