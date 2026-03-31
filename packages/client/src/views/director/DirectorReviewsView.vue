<script setup lang="ts">
import { computed, reactive, ref, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import PageCard from '@/components/common/PageCard.vue';
import StatusTag from '@/components/common/StatusTag.vue';
import { apiGet, apiPost } from '@/api';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const list = ref<any[]>([]);
const page = ref(1);
const pageSize = ref(10);
const previewVisible = ref(false);
const previewHtml = ref('');
const rejectDialogVisible = ref(false);
const currentId = ref('');
const rejectForm = reactive({
  rejectReason: '',
});

async function loadData() {
  list.value = await apiGet('/papers/pending');
}

async function showPreview(id: string) {
  const data = await apiGet<{ previewHtml: string }>(`/papers/${id}/preview`);
  previewHtml.value = data.previewHtml;
  previewVisible.value = true;
}

async function approvePaper(id: string) {
  await apiPost(`/papers/${id}/approve`, {});
  ElMessage.success('试卷已审核通过');
  await loadData();
}

function openReject(id: string) {
  currentId.value = id;
  rejectForm.rejectReason = '';
  rejectDialogVisible.value = true;
}

async function rejectPaper() {
  await apiPost(`/papers/${currentId.value}/reject`, rejectForm);
  rejectDialogVisible.value = false;
  ElMessage.success('试卷已驳回');
  await loadData();
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
        <el-table-column prop="version" label="版本" width="80" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><StatusTag :status="row.status" /></template>
        </el-table-column>
        <el-table-column label="班级">
          <template #default="{ row }">{{ row.classGroups.map((item: any) => item.className).join('、') }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button link @click="showPreview(row.id)">预览</el-button>
            <el-button link type="primary" @click="approvePaper(row.id)">通过</el-button>
            <el-button link type="danger" @click="openReject(row.id)">驳回</el-button>
          </template>
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

  <el-drawer v-model="previewVisible" append-to-body title="试卷预览" size="55%">
    <div class="preview-pane" v-html="previewHtml" />
  </el-drawer>

  <el-dialog v-model="rejectDialogVisible" append-to-body title="填写驳回理由" width="520px">
    <el-form label-position="top">
      <el-form-item label="驳回理由">
        <el-input v-model="rejectForm.rejectReason" type="textarea" :rows="4" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="rejectDialogVisible = false">取消</el-button>
      <el-button type="danger" @click="rejectPaper">确认驳回</el-button>
    </template>
  </el-dialog>
</template>
