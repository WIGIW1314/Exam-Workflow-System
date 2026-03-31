<script setup lang="ts">
import { UploadFilled } from '@element-plus/icons-vue';
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageCard from '@/components/common/PageCard.vue';
import StatusTag from '@/components/common/StatusTag.vue';
import { apiGet } from '@/api';
import { http } from '@/api/http';

const courses = ref<any[]>([]);
const papers = ref<any[]>([]);
const currentCourseId = ref('');
const selectedClassIds = ref<string[]>([]);
const uploadRef = ref();
const previewHtml = ref('');
const previewVisible = ref(false);

async function loadData() {
  const [courseData, paperData] = await Promise.all([apiGet<any[]>('/courses/my'), apiGet<any[]>('/papers/my')]);
  courses.value = courseData;
  papers.value = paperData;
  if (!currentCourseId.value && courses.value.length) {
    currentCourseId.value = courses.value[0].id;
  }
}

function handleCourseChange() {
  selectedClassIds.value = currentCourse.value?.classes.map((item: any) => item.id) ?? [];
}

const currentCourse = computed(() => courses.value.find((item) => item.id === currentCourseId.value));

async function submitUpload(file: File) {
  if (!currentCourseId.value) {
    ElMessage.warning('请先选择课程');
    return false;
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('courseId', currentCourseId.value);
  formData.append('courseClassIds', JSON.stringify(selectedClassIds.value));
  await http.post('/papers/submit', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  ElMessage.success('试卷提交成功');
  uploadRef.value?.clearFiles();
  await loadData();
  return false;
}

async function showPreview(id: string) {
  const data = await apiGet<{ previewHtml: string }>(`/papers/${id}/preview`);
  previewHtml.value = data.previewHtml;
  previewVisible.value = true;
}

function downloadPaper(id: string) {
  window.open(`/api/v1/papers/${id}/download`, '_blank');
}

onMounted(loadData);
</script>

<template>
  <div class="split-grid">
    <PageCard title="试卷提交" eyebrow="Upload">
      <el-form label-position="top">
        <el-form-item label="课程">
          <el-select v-model="currentCourseId" style="width: 100%" @change="handleCourseChange">
            <el-option v-for="item in courses" :key="item.id" :label="`${item.courseCode} / ${item.courseName}`" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="班级分组">
          <el-select v-model="selectedClassIds" style="width: 100%" multiple>
            <el-option
              v-for="item in currentCourse?.classes ?? []"
              :key="item.id"
              :label="item.className"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-upload ref="uploadRef" drag accept=".docx" :auto-upload="false" :show-file-list="true" :on-change="({ raw }: any) => raw && submitUpload(raw)">
          <el-icon><UploadFilled /></el-icon>
          <div>拖拽或点击上传 DOCX 试卷</div>
        </el-upload>
      </el-form>
    </PageCard>

    <PageCard title="已提交试卷" eyebrow="History">
      <el-table :data="papers">
        <el-table-column prop="courseName" label="课程" />
        <el-table-column prop="version" label="版本" width="80" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><StatusTag :status="row.status" /></template>
        </el-table-column>
        <el-table-column prop="paperNumber" label="试卷编号" width="180" />
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button link @click="showPreview(row.id)">预览</el-button>
            <el-button link :disabled="row.status !== 'approved'" @click="downloadPaper(row.id)">下载</el-button>
          </template>
        </el-table-column>
      </el-table>
    </PageCard>
  </div>

  <el-drawer v-model="previewVisible" title="试卷预览" size="55%">
    <div class="preview-pane" v-html="previewHtml" />
  </el-drawer>
</template>
