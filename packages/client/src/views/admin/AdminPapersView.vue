<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import PageCard from '@/components/common/PageCard.vue';
import StatusTag from '@/components/common/StatusTag.vue';
import WorkflowProgress from '@/components/common/WorkflowProgress.vue';
import { apiGet } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/datetime';

const authStore = useAuthStore();
const list = ref<any[]>([]);
const page = ref(1);
const pageSize = ref(10);

async function loadData() {
  list.value = await apiGet('/papers/all');
}

const pagedList = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return list.value.slice(start, start + pageSize.value);
});

function handlePageChange(nextPage: number) {
  page.value = nextPage;
}

onMounted(loadData);

watch(
  () => [authStore.paperSubmissionVersion, authStore.paperStatusVersion],
  () => {
    void loadData();
  },
);
</script>

<template>
  <PageCard fill>
    <div class="page-table">
      <el-table border :data="pagedList">
        <el-table-column prop="courseName" label="课程" />
        <el-table-column prop="teacherName" label="教师" width="120" />
        <el-table-column prop="departmentName" label="教研室" width="140" />
        <el-table-column prop="paperNumber" label="试卷编号" width="180" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <StatusTag :status="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="当前进度" min-width="320">
          <template #default="{ row }">
            <WorkflowProgress :status="row.status" :rejection-stage="row.rejectionStage" />
          </template>
        </el-table-column>
        <el-table-column label="主模板" width="160">
          <template #default="{ row }">
            {{ row.mainReviewTemplateId === 'rationality-review' ? '合理性审核表' : row.mainReviewTemplateId === 'paper-review' ? '试卷命题审查表' : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="主模板状态" width="120">
          <template #default="{ row }"><StatusTag :status="row.mainReviewStatus || row.status" /></template>
        </el-table-column>
        <el-table-column label="分析申请" width="120">
          <template #default="{ row }">{{ row.analysisReviewCount ?? 0 }} 条</template>
        </el-table-column>
        <el-table-column label="提交时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.submittedAt) }}</template>
        </el-table-column>
        <el-table-column prop="reviewerName" label="审核人" width="120" />
        <el-table-column prop="rejectReason" label="驳回原因" />
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
