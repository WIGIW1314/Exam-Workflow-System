<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { DocxTemplateDefinition } from '@exam-workflow/shared';
import PageCard from '@/components/common/PageCard.vue';
import StatusTag from '@/components/common/StatusTag.vue';
import WorkflowProgress from '@/components/common/WorkflowProgress.vue';
import WorkflowTemplateForm from '@/components/template/WorkflowTemplateForm.vue';
import { apiGet, apiPost, fetchFileBuffer } from '@/api';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const activeTab = ref<'main' | 'analysis'>('main');
const mainList = ref<any[]>([]);
const analysisList = ref<any[]>([]);
const templateCatalog = ref<DocxTemplateDefinition[]>([]);
const signatures = ref<string[]>([]);
const reviewDialogVisible = ref(false);
const rejectDialogVisible = ref(false);
const reviewLoading = ref(false);
const saving = ref(false);
const currentMode = ref<'main' | 'analysis'>('main');
const currentPaper = ref<any | null>(null);
const currentReview = ref<any | null>(null);
const reviewFormState = reactive<Record<string, unknown>>({});
const previewVisible = ref(false);
const previewContainerRef = ref<HTMLDivElement | null>(null);
const previewViewportRef = ref<HTMLDivElement | null>(null);
const previewLoading = ref(false);
const previewError = ref('');
const previewScale = ref(100);
const rejectForm = reactive({ rejectReason: '' });

const quickZoomOptions = [50, 75, 100, 125, 150, 200];
const minZoom = 30;
const maxZoom = 250;
const zoomStep = 10;
const isAcademicDean = computed(() => authStore.currentRole === 'academic_dean');
const roleCode = computed(() => (isAcademicDean.value ? 'academic_dean' : 'director'));
const currentTemplate = computed(() => {
  if (!currentReview.value) return null;
  return templateCatalog.value.find((item) => item.id === currentReview.value.templateId) ?? null;
});
const previewScaleFactor = computed(() => previewScale.value / 100);
const previewScaleStyle = computed(() => {
  const factor = previewScaleFactor.value;
  return {
    transform: `scale(${factor})`,
    transformOrigin: 'top left',
    width: `${100 / factor}%`,
  };
});

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function applyActorDefaults(state: Record<string, unknown>) {
  const realName = authStore.user?.realName ?? '';
  if (roleCode.value === 'director') {
    if ('directorSigner' in state && !String(state.directorSigner ?? '').trim()) {
      state.directorSigner = realName;
    }
    if ('directorDate' in state && !String(state.directorDate ?? '').trim()) {
      state.directorDate = todayValue();
    }
  }
  if (roleCode.value === 'academic_dean') {
    if ('deanSigner' in state && !String(state.deanSigner ?? '').trim()) {
      state.deanSigner = realName;
    }
    if ('deanDate' in state && !String(state.deanDate ?? '').trim()) {
      state.deanDate = todayValue();
    }
    if ('collegeSigner' in state && !String(state.collegeSigner ?? '').trim()) {
      state.collegeSigner = realName;
    }
    if ('collegeDate' in state && !String(state.collegeDate ?? '').trim()) {
      state.collegeDate = todayValue();
    }
  }
}

function replaceState(target: Record<string, unknown>, nextState: Record<string, unknown>) {
  Object.keys(target).forEach((key) => delete target[key]);
  Object.assign(target, nextState);
}

async function loadData() {
  const [mainData, analysisData, templateData] = await Promise.all([
    apiGet<any[]>('/papers/pending'),
    apiGet<any[]>('/papers/analysis-reviews/pending'),
    apiGet<any>('/docx-templates'),
  ]);
  mainList.value = mainData;
  analysisList.value = analysisData;
  templateCatalog.value = templateData.templates;
  signatures.value = templateData.signatures;
}

async function renderDocx(url: string) {
  previewVisible.value = true;
  previewLoading.value = true;
  previewError.value = '';
  previewScale.value = 100;
  await nextTick();
  const container = previewContainerRef.value;
  if (!container) {
    previewError.value = '预览容器初始化失败';
    previewLoading.value = false;
    return;
  }
  container.innerHTML = '';
  try {
    const fileBuffer = await fetchFileBuffer(url);
    const { renderAsync } = await import('docx-preview');
    await renderAsync(fileBuffer, container, undefined, {
      inWrapper: false,
      breakPages: true,
      ignoreWidth: false,
      ignoreHeight: false,
    });
    await fitToWidth();
  } catch {
    previewError.value = '文档渲染失败，请下载后查看';
  } finally {
    previewLoading.value = false;
  }
}

async function openMainReview(row: any) {
  reviewLoading.value = true;
  reviewDialogVisible.value = true;
  currentMode.value = 'main';
  try {
    const detail = await apiGet<any>(`/papers/${row.id}/main-review`);
    currentPaper.value = detail.paper;
    currentReview.value = detail.review;
    replaceState(reviewFormState, detail.review.formData ?? {});
    applyActorDefaults(reviewFormState);
  } finally {
    reviewLoading.value = false;
  }
}

async function openAnalysisReview(row: any) {
  reviewLoading.value = true;
  reviewDialogVisible.value = true;
  currentMode.value = 'analysis';
  try {
    const detail = await apiGet<any>(`/papers/${row.paper.id}/analysis-reviews/${row.id}`);
    currentPaper.value = detail.paper;
    currentReview.value = detail.review;
    replaceState(reviewFormState, detail.review.formData ?? {});
    applyActorDefaults(reviewFormState);
  } finally {
    reviewLoading.value = false;
  }
}

function canApproveCurrent() {
  if (!currentPaper.value || !currentReview.value) {
    return false;
  }
  if (!isAcademicDean.value) {
    return currentReview.value.status === 'pending';
  }
  return currentReview.value.status === 'pending_dean';
}

async function approveCurrent() {
  if (!currentPaper.value || !currentReview.value) return;
  saving.value = true;
  try {
    if (currentMode.value === 'main') {
      await apiPost(`/papers/${currentPaper.value.id}/approve`, {
        formData: JSON.parse(JSON.stringify(reviewFormState)),
      });
      ElMessage.success(isAcademicDean.value ? '主流程已审核通过' : '已提交教学院长审核');
    } else {
      await apiPost(`/papers/${currentPaper.value.id}/analysis-reviews/${currentReview.value.id}/approve`, {
        formData: JSON.parse(JSON.stringify(reviewFormState)),
      });
      ElMessage.success(isAcademicDean.value ? '试卷分析已审核通过' : '试卷分析已提交教学院长审核');
    }
    reviewDialogVisible.value = false;
    await loadData();
  } finally {
    saving.value = false;
  }
}

function openRejectDialog() {
  rejectForm.rejectReason = '';
  rejectDialogVisible.value = true;
}

async function rejectCurrent() {
  if (!currentPaper.value || !currentReview.value) return;
  saving.value = true;
  try {
    const payload = {
      rejectReason: rejectForm.rejectReason,
      formData: JSON.parse(JSON.stringify(reviewFormState)),
    };
    if (currentMode.value === 'main') {
      await apiPost(`/papers/${currentPaper.value.id}/reject`, payload);
      ElMessage.success(isAcademicDean.value ? '主流程已由教学院长驳回' : '主流程已由教研室主任驳回');
    } else {
      await apiPost(`/papers/${currentPaper.value.id}/analysis-reviews/${currentReview.value.id}/reject`, payload);
      ElMessage.success(isAcademicDean.value ? '试卷分析已由教学院长驳回' : '试卷分析已由教研室主任驳回');
    }
    rejectDialogVisible.value = false;
    reviewDialogVisible.value = false;
    await loadData();
  } finally {
    saving.value = false;
  }
}

function clampZoom(value: number) {
  return Math.min(maxZoom, Math.max(minZoom, Math.round(value)));
}

function setZoom(value: number) {
  previewScale.value = clampZoom(value);
}

function zoomIn() {
  setZoom(previewScale.value + zoomStep);
}

function zoomOut() {
  setZoom(previewScale.value - zoomStep);
}

function resetZoom() {
  setZoom(100);
}

async function fitToWidth() {
  await nextTick();
  const viewport = previewViewportRef.value;
  const container = previewContainerRef.value;
  if (!viewport || !container) return;
  const firstPage = container.querySelector('.docx') as HTMLElement | null;
  if (!firstPage) return;
  const naturalWidth = firstPage.offsetWidth || firstPage.getBoundingClientRect().width / previewScaleFactor.value;
  const availableWidth = viewport.clientWidth - 8;
  if (naturalWidth > 0 && availableWidth > 0) {
    setZoom((availableWidth / naturalWidth) * 100);
  }
}

watch(
  () => [authStore.paperSubmissionVersion, authStore.paperStatusVersion],
  () => {
    void loadData();
  },
);

watch(previewVisible, (visible) => {
  if (visible) return;
  previewError.value = '';
  previewLoading.value = false;
  previewScale.value = 100;
  if (previewContainerRef.value) {
    previewContainerRef.value.innerHTML = '';
  }
});

onMounted(() => {
  void loadData();
});
</script>

<template>
  <PageCard fill>
    <div class="page-toolbar">
      <div class="page-toolbar__actions">
        <el-tag effect="light" type="info">
          {{ isAcademicDean ? '当前可处理待教学院长审核记录，并可跨级驳回仍处于教研室主任审核阶段的记录' : '当前仅显示待教研室主任审核记录' }}
        </el-tag>
      </div>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="试卷编号审核" name="main">
        <div class="page-table">
          <el-table border :data="mainList">
            <el-table-column prop="courseName" label="课程" />
            <el-table-column prop="teacherName" label="教师" width="120" />
            <el-table-column prop="courseType" label="课程类型" width="100" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><StatusTag :status="row.status" /></template>
            </el-table-column>
            <el-table-column label="进度" min-width="300">
              <template #default="{ row }"><WorkflowProgress :status="row.status" :rejection-stage="row.rejectionStage" /></template>
            </el-table-column>
            <el-table-column label="主模板" width="160">
              <template #default="{ row }">{{ row.mainReviewTemplateId === 'rationality-review' ? '合理性审核表' : '试卷命题审查表' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="180">
              <template #default="{ row }">
                <el-button link @click="renderDocx(`/papers/${row.id}/preview-file`)">预览试卷</el-button>
                <el-button link type="primary" @click="openMainReview(row)">审核</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="试卷分析审核" name="analysis">
        <div class="page-table">
          <el-table border :data="analysisList">
            <el-table-column label="课程" min-width="160">
              <template #default="{ row }">{{ row.paper.courseName }}</template>
            </el-table-column>
            <el-table-column label="教师" width="120">
              <template #default="{ row }">{{ row.paper.teacherName }}</template>
            </el-table-column>
            <el-table-column label="班级范围" min-width="180">
              <template #default="{ row }">{{ row.scopes.map((item: any) => item.className).join('、') }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><StatusTag :status="row.status" /></template>
            </el-table-column>
            <el-table-column label="流程进度" min-width="300">
              <template #default="{ row }"><WorkflowProgress :status="row.status" :rejection-stage="row.rejectionStage" /></template>
            </el-table-column>
            <el-table-column label="操作" width="180">
              <template #default="{ row }">
                <el-button link @click="renderDocx(`/papers/${row.paper.id}/preview-file`)">预览试卷</el-button>
                <el-button link type="primary" @click="openAnalysisReview(row)">审核</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>
  </PageCard>

  <el-dialog v-model="reviewDialogVisible" append-to-body :title="currentMode === 'main' ? '试卷编号审核' : '试卷分析审核'" width="1120px">
    <div v-loading="reviewLoading" class="workflow-review-dialog">
      <div class="workflow-review-dialog__meta" v-if="currentPaper && currentReview">
        <el-tag effect="light" type="info">{{ currentPaper.courseName }}</el-tag>
        <el-tag effect="light" type="success">{{ currentTemplate?.name || currentReview.templateId }}</el-tag>
        <el-tag effect="light" :type="currentMode === 'main' ? 'warning' : 'primary'">{{ currentMode === 'main' ? '主流程' : '试卷分析' }}</el-tag>
      </div>

      <div class="workflow-review-dialog__actions" v-if="currentPaper && currentReview">
        <el-button @click="renderDocx(`/papers/${currentPaper.id}/preview-file`)">预览试卷</el-button>
        <el-button @click="renderDocx(currentMode === 'main' ? `/papers/${currentPaper.id}/main-review/preview-file` : `/papers/${currentPaper.id}/analysis-reviews/${currentReview.id}/preview-file`)">
          预览模板
        </el-button>
      </div>

      <WorkflowTemplateForm
        v-if="currentTemplate && currentReview"
        :template="currentTemplate"
        :model-value="reviewFormState"
        :role="roleCode"
        :signatures="signatures"
        compact
      />
    </div>
    <template #footer>
      <el-button @click="reviewDialogVisible = false">关闭</el-button>
      <el-button type="danger" @click="openRejectDialog">驳回</el-button>
      <el-button type="primary" :disabled="!canApproveCurrent()" :loading="saving" @click="approveCurrent">
        {{ isAcademicDean ? '审核通过' : '提交教学院长' }}
      </el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="rejectDialogVisible" append-to-body title="填写驳回理由" width="520px">
    <el-form label-position="top">
      <el-form-item label="驳回理由">
        <el-input v-model="rejectForm.rejectReason" type="textarea" :rows="4" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="rejectDialogVisible = false">取消</el-button>
      <el-button type="danger" :loading="saving" @click="rejectCurrent">确认驳回</el-button>
    </template>
  </el-dialog>

  <el-drawer v-model="previewVisible" append-to-body title="文档预览" size="60%" class="paper-preview-drawer">
    <div class="preview-pane preview-pane--docx">
      <div class="preview-docx-toolbar">
        <div class="preview-docx-toolbar__main">
          <el-button-group>
            <el-button @click="zoomOut">-</el-button>
            <el-button @click="zoomIn">+</el-button>
          </el-button-group>
          <el-button @click="resetZoom">100%</el-button>
          <el-button @click="fitToWidth">适应宽度</el-button>
          <span class="preview-docx-toolbar__scale">{{ previewScale }}%</span>
        </div>
        <div class="preview-docx-toolbar__quick">
          <el-button
            v-for="option in quickZoomOptions"
            :key="option"
            size="small"
            :type="previewScale === option ? 'primary' : 'default'"
            @click="setZoom(option)"
          >
            {{ option }}%
          </el-button>
        </div>
      </div>
      <el-alert v-if="previewError" type="warning" :closable="false" show-icon :title="previewError" />
      <div ref="previewViewportRef" class="preview-docx-scroll">
        <div v-if="previewLoading" class="preview-docx-loading">正在渲染文档，请稍候...</div>
        <div class="preview-docx-scale" :style="previewScaleStyle">
          <div ref="previewContainerRef" class="preview-docx-render" />
        </div>
      </div>
    </div>
  </el-drawer>
</template>
