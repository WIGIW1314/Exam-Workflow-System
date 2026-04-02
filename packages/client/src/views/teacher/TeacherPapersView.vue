<script setup lang="ts">
import { UploadFilled } from '@element-plus/icons-vue';
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { DocxTemplateDefinition } from '@exam-workflow/shared';
import PageCard from '@/components/common/PageCard.vue';
import StatusTag from '@/components/common/StatusTag.vue';
import WorkflowProgress from '@/components/common/WorkflowProgress.vue';
import WorkflowTemplateForm from '@/components/template/WorkflowTemplateForm.vue';
import { apiGet, downloadFile, fetchFileBuffer } from '@/api';
import { http } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { buildTemplateState, buildWorkflowSystemPayload } from '@/utils/template-workflow';

interface CourseSummary {
  id: string;
  courseCode: string;
  courseName: string;
  teacherName: string;
  departmentName: string;
  semesterName: string;
  creditHours?: number | null;
  courseType?: string | null;
  classes: Array<{ id: string; className: string }>;
}

interface TemplateCatalogResponse {
  templates: DocxTemplateDefinition[];
  signatures: string[];
}

const authStore = useAuthStore();
const courses = ref<CourseSummary[]>([]);
const papers = ref<any[]>([]);
const templateCatalog = ref<DocxTemplateDefinition[]>([]);
const signatures = ref<string[]>([]);
const currentCourseId = ref('');
const selectedClassIds = ref<string[]>([]);
const uploadRef = ref();
const pendingUploadFile = ref<File | null>(null);
const submitting = ref(false);
const previewVisible = ref(false);
const previewContainerRef = ref<HTMLDivElement | null>(null);
const previewViewportRef = ref<HTMLDivElement | null>(null);
const previewLoading = ref(false);
const previewError = ref('');
const previewScale = ref(100);
const analysisDialogVisible = ref(false);
const analysisSaving = ref(false);
const analysisPaperId = ref('');
const analysisReviewId = ref('');
const analysisScopeClassIds = ref<string[]>([]);
const mainTemplateState = reactive<Record<string, unknown>>({});
const analysisTemplateState = reactive<Record<string, unknown>>({});

const quickZoomOptions = [50, 75, 100, 125, 150, 200];
const minZoom = 30;
const maxZoom = 250;
const zoomStep = 10;

const currentCourse = computed(() => courses.value.find((item) => item.id === currentCourseId.value) ?? null);
const currentTemplateId = computed(() =>
  currentCourse.value?.courseType === '必修' || currentCourse.value?.courseType === '限选' ? 'rationality-review' : 'paper-review',
);
const currentTemplate = computed(() => templateCatalog.value.find((item) => item.id === currentTemplateId.value) ?? null);
const analysisTemplate = computed(() => templateCatalog.value.find((item) => item.id === 'exam-analysis') ?? null);
const currentPaperForAnalysis = computed(() => papers.value.find((item) => item.id === analysisPaperId.value) ?? null);
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

function applyTeacherDefaults(state: Record<string, unknown>) {
  const realName = authStore.user?.realName ?? '';
  if ('teacherSigner' in state && !String(state.teacherSigner ?? '').trim()) {
    state.teacherSigner = realName;
  }
  if ('teacherDate' in state && !String(state.teacherDate ?? '').trim()) {
    state.teacherDate = todayValue();
  }
}

function replaceState(target: Record<string, unknown>, nextState: Record<string, unknown>) {
  Object.keys(target).forEach((key) => delete target[key]);
  Object.assign(target, nextState);
}

function buildCourseContext(course: CourseSummary, classIds: string[]) {
  const classNames = course.classes.filter((item) => classIds.includes(item.id)).map((item) => item.className);
  return buildWorkflowSystemPayload(currentTemplateId.value, {
    departmentName: course.departmentName,
    courseName: course.courseName,
    semesterName: course.semesterName,
    creditHours: course.creditHours == null ? '' : String(course.creditHours),
    teacherName: course.teacherName,
    classNames,
    courseCode: course.courseCode,
  });
}

function hydrateMainTemplateState() {
  if (!currentTemplate.value || !currentCourse.value) {
    replaceState(mainTemplateState, {});
    return;
  }
  const nextState = buildTemplateState(currentTemplate.value);
  Object.assign(nextState, buildCourseContext(currentCourse.value, selectedClassIds.value));
  applyTeacherDefaults(nextState);
  replaceState(mainTemplateState, nextState);
}

function hydrateAnalysisTemplateState(paper: any, classIds: string[], payload?: Record<string, unknown>) {
  if (!analysisTemplate.value) {
    replaceState(analysisTemplateState, {});
    return;
  }
  const nextState = buildTemplateState(analysisTemplate.value, payload);
  const classNames = paper.classGroups.filter((item: any) => classIds.includes(item.id)).map((item: any) => item.className);
  Object.assign(
    nextState,
    buildWorkflowSystemPayload('exam-analysis', {
      departmentName: paper.departmentName,
      courseName: paper.courseName,
      semesterName: paper.semesterName,
      creditHours: '',
      teacherName: paper.teacherName,
      classNames,
      courseCode: paper.courseCode,
    }),
  );
  applyTeacherDefaults(nextState);
  replaceState(analysisTemplateState, nextState);
}

async function loadData() {
  const [courseData, paperData, templateData] = await Promise.all([
    apiGet<CourseSummary[]>('/courses/my'),
    apiGet<any[]>('/papers/my'),
    apiGet<TemplateCatalogResponse>('/docx-templates'),
  ]);
  courses.value = courseData;
  papers.value = paperData;
  templateCatalog.value = templateData.templates;
  signatures.value = templateData.signatures;
  if (!currentCourseId.value && courses.value.length) {
    currentCourseId.value = courses.value[0].id;
  }
  if (currentCourse.value && selectedClassIds.value.length === 0) {
    selectedClassIds.value = currentCourse.value.classes.map((item) => item.id);
  }
  hydrateMainTemplateState();
}

function handleCourseChange() {
  selectedClassIds.value = currentCourse.value?.classes.map((item) => item.id) ?? [];
  pendingUploadFile.value = null;
  uploadRef.value?.clearFiles();
  hydrateMainTemplateState();
}

function handleFileChange(uploadFile: any) {
  pendingUploadFile.value = uploadFile.raw ?? null;
}

async function submitPaper() {
  if (!currentCourse.value) {
    ElMessage.warning('请先选择课程');
    return;
  }
  if (!pendingUploadFile.value) {
    ElMessage.warning('请上传试卷 DOCX');
    return;
  }
  submitting.value = true;
  try {
    const formData = new FormData();
    formData.append('file', pendingUploadFile.value);
    formData.append('courseId', currentCourse.value.id);
    formData.append('courseClassIds', JSON.stringify(selectedClassIds.value));
    formData.append('mainReviewData', JSON.stringify(mainTemplateState));
    await http.post('/papers/submit', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    ElMessage.success('试卷与主模板已提交审核');
    pendingUploadFile.value = null;
    uploadRef.value?.clearFiles();
    await loadData();
  } finally {
    submitting.value = false;
  }
}

async function renderDocxByUrl(url: string) {
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
    previewError.value = '预览渲染失败，请下载 DOCX 查看';
  } finally {
    previewLoading.value = false;
  }
}

async function showPaperPreview(id: string) {
  await renderDocxByUrl(`/papers/${id}/preview-file`);
}

async function showMainReviewPreview(id: string) {
  await renderDocxByUrl(`/papers/${id}/main-review/preview-file`);
}

async function showAnalysisPreview(paperId: string, reviewId: string) {
  await renderDocxByUrl(`/papers/${paperId}/analysis-reviews/${reviewId}/preview-file`);
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

async function downloadPaperDoc(paper: any) {
  const suffix = paper.paperNumber ? paper.paperNumber : `v${paper.version ?? 1}`;
  await downloadFile(`/papers/${paper.id}/download`, `试卷-${suffix}.docx`);
}

async function downloadMainReviewDoc(paper: any) {
  await downloadFile(`/papers/${paper.id}/main-review/download`, `${paper.courseName}-${paper.mainReviewTemplateId ?? '主模板'}.docx`);
}

async function downloadAnalysisDoc(paper: any, review: any) {
  await downloadFile(`/papers/${paper.id}/analysis-reviews/${review.id}/download`, `${paper.courseName}-试卷分析-${review.scopes.map((item: any) => item.className).join('、')}.docx`);
}

function openAnalysisDialog(paper: any) {
  analysisDialogVisible.value = true;
  analysisPaperId.value = paper.id;
  analysisReviewId.value = '';
  analysisScopeClassIds.value = paper.classGroups.map((item: any) => item.id);
  hydrateAnalysisTemplateState(paper, analysisScopeClassIds.value);
}

async function continueAnalysisReview(paper: any, reviewId: string) {
  const detail = await apiGet<any>(`/papers/${paper.id}/analysis-reviews/${reviewId}`);
  analysisDialogVisible.value = true;
  analysisPaperId.value = paper.id;
  analysisReviewId.value = reviewId;
  analysisScopeClassIds.value = detail.review.scopes.map((item: any) => item.id);
  hydrateAnalysisTemplateState(paper, analysisScopeClassIds.value, detail.review.formData);
}

async function saveAnalysisReview() {
  if (!currentPaperForAnalysis.value) {
    return;
  }
  if (!analysisScopeClassIds.value.length) {
    ElMessage.warning('请至少选择一个班级');
    return;
  }
  analysisSaving.value = true;
  try {
    const body = {
      courseClassIds: analysisScopeClassIds.value,
      formData: JSON.parse(JSON.stringify(analysisTemplateState)),
    };
    if (analysisReviewId.value) {
      await http.post(`/papers/${analysisPaperId.value}/analysis-reviews/${analysisReviewId.value}/resubmit`, body);
      ElMessage.success('试卷分析审核已重新提交');
    } else {
      await http.post(`/papers/${analysisPaperId.value}/analysis-reviews`, body);
      ElMessage.success('试卷分析审核已发起');
    }
    analysisDialogVisible.value = false;
    await loadData();
  } finally {
    analysisSaving.value = false;
  }
}

watch(currentCourseId, () => {
  if (!currentCourse.value) return;
  if (!selectedClassIds.value.length) {
    selectedClassIds.value = currentCourse.value.classes.map((item) => item.id);
  }
  hydrateMainTemplateState();
});

watch(selectedClassIds, () => {
  hydrateMainTemplateState();
});

watch(analysisScopeClassIds, () => {
  if (currentPaperForAnalysis.value) {
    hydrateAnalysisTemplateState(currentPaperForAnalysis.value, analysisScopeClassIds.value, analysisTemplateState);
  }
});

watch(previewVisible, (visible) => {
  if (visible) return;
  previewError.value = '';
  previewLoading.value = false;
  previewScale.value = 100;
  if (previewContainerRef.value) {
    previewContainerRef.value.innerHTML = '';
  }
});

watch(
  () => [authStore.paperSubmissionVersion, authStore.paperStatusVersion],
  () => {
    void loadData();
  },
);

onMounted(() => {
  void loadData();
});
</script>

<template>
  <div class="split-grid">
    <PageCard fill show-title title="试卷编号申请" eyebrow="教师提交">
      <div class="workflow-submit-shell">
        <div class="workflow-submit-grid">
          <el-form-item label="课程">
            <el-select v-model="currentCourseId" style="width: 100%" @change="handleCourseChange">
              <el-option v-for="item in courses" :key="item.id" :label="`${item.courseCode} / ${item.courseName}`" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="班级范围">
            <el-select v-model="selectedClassIds" style="width: 100%" multiple>
              <el-option v-for="item in currentCourse?.classes ?? []" :key="item.id" :label="item.className" :value="item.id" />
            </el-select>
          </el-form-item>
        </div>

        <div class="workflow-submit-meta">
          <el-tag type="info" effect="light">课程类型：{{ currentCourse?.courseType || '未设置' }}</el-tag>
          <el-tag type="success" effect="light">主模板：{{ currentTemplate?.name || '未匹配' }}</el-tag>
        </div>

        <el-upload ref="uploadRef" drag accept=".docx" :auto-upload="false" :show-file-list="true" :on-change="handleFileChange">
          <el-icon><UploadFilled /></el-icon>
          <div>拖拽或点击上传 DOCX 试卷</div>
        </el-upload>

        <WorkflowTemplateForm
          v-if="currentTemplate"
          :template="currentTemplate"
          :model-value="mainTemplateState"
          role="teacher"
          :signatures="signatures"
          compact
        />

        <div class="workflow-submit-actions">
          <el-button type="primary" :loading="submitting" @click="submitPaper">提交试卷与主模板</el-button>
        </div>
      </div>
    </PageCard>

    <PageCard fill show-title title="已提交试卷" eyebrow="流程记录">
      <div class="page-table">
        <el-table border :data="papers">
          <el-table-column prop="courseName" label="课程" min-width="180" />
          <el-table-column prop="courseType" label="课程类型" width="100" />
          <el-table-column label="主流程状态" width="110">
            <template #default="{ row }"><StatusTag :status="row.status" /></template>
          </el-table-column>
          <el-table-column label="主流程进度" min-width="280">
            <template #default="{ row }"><WorkflowProgress :status="row.status" :rejection-stage="row.rejectionStage" /></template>
          </el-table-column>
          <el-table-column label="主模板" width="160">
            <template #default="{ row }">{{ row.mainReviewTemplateId === 'rationality-review' ? '合理性审核表' : '试卷命题审查表' }}</template>
          </el-table-column>
          <el-table-column label="主模板操作" min-width="180">
            <template #default="{ row }">
              <el-button link @click="showMainReviewPreview(row.id)">预览模板</el-button>
              <el-button link :disabled="!row.mainReviewDocumentAvailable" @click="downloadMainReviewDoc(row)">下载模板</el-button>
            </template>
          </el-table-column>
          <el-table-column label="试卷操作" min-width="160">
            <template #default="{ row }">
              <el-button link @click="showPaperPreview(row.id)">预览试卷</el-button>
              <el-button link @click="downloadPaperDoc(row)">下载试卷</el-button>
            </template>
          </el-table-column>
          <el-table-column label="试卷分析" min-width="360">
            <template #default="{ row }">
              <div class="analysis-summary-cell">
                <div class="analysis-summary-cell__actions">
                  <el-button link type="primary" :disabled="!row.canStartAnalysisReview" @click="openAnalysisDialog(row)">
                    发起试卷分析审核
                  </el-button>
                </div>
                <div v-if="row.analysisReviews?.length" class="analysis-summary-list">
                  <div v-for="review in row.analysisReviews" :key="review.id" class="analysis-summary-item">
                    <div class="analysis-summary-item__main">
                      <strong>{{ review.scopes.map((item: any) => item.className).join('、') }}</strong>
                      <StatusTag :status="review.status" />
                    </div>
                    <div class="analysis-summary-item__ops">
                      <el-button link @click="showAnalysisPreview(row.id, review.id)">预览</el-button>
                      <el-button link :disabled="!review.approvedFilePath" @click="downloadAnalysisDoc(row, review)">下载</el-button>
                      <el-button v-if="review.status === 'rejected'" link type="primary" @click="continueAnalysisReview(row, review.id)">继续编辑</el-button>
                    </div>
                  </div>
                </div>
                <span v-else class="table-muted">暂无试卷分析记录</span>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </PageCard>
  </div>

  <el-dialog v-model="analysisDialogVisible" append-to-body title="试卷分析审核申请" width="1080px">
    <div v-if="currentPaperForAnalysis" class="workflow-analysis-dialog">
      <el-form-item label="分析班级范围">
        <el-select v-model="analysisScopeClassIds" multiple style="width: 100%">
          <el-option v-for="item in currentPaperForAnalysis.classGroups" :key="item.id" :label="item.className" :value="item.id" />
        </el-select>
      </el-form-item>
      <WorkflowTemplateForm
        v-if="analysisTemplate"
        :template="analysisTemplate"
        :model-value="analysisTemplateState"
        role="teacher"
        :signatures="signatures"
        compact
      />
    </div>
    <template #footer>
      <el-button @click="analysisDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="analysisSaving" @click="saveAnalysisReview">提交</el-button>
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
