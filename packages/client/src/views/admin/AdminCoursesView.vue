<script setup lang="ts">
import * as XLSX from 'xlsx';
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageCard from '@/components/common/PageCard.vue';
import { apiDelete, apiGet, apiPost, apiPut, downloadFile } from '@/api';

const list = ref<any[]>([]);
const lookups = ref<any>({});
const keyword = ref('');
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const selectedIds = ref<string[]>([]);
const dialogVisible = ref(false);
const editingId = ref('');
let keywordTimer: ReturnType<typeof setTimeout> | null = null;
const form = reactive({
  semesterId: '',
  courseCode: '',
  courseName: '',
  teacherId: '',
  departmentId: '',
  creditHours: 0,
  courseType: '必修',
  classNamesText: '',
});
const courseTypeOptions = ['必修', '限选', '选修', '实践', '通识'];

async function loadData() {
  const [courseData, lookupData] = await Promise.all([
    apiGet<any>('/courses', { keyword: keyword.value, page: page.value, pageSize: pageSize.value }),
    apiGet<any>('/lookups'),
  ]);
  list.value = courseData.list;
  total.value = courseData.total;
  lookups.value = lookupData;
}

function handlePageChange(nextPage: number) {
  page.value = nextPage;
  loadData();
}

function openDialog(row?: any) {
  editingId.value = row?.id ?? '';
  Object.assign(form, row
    ? {
        semesterId: row.semesterId,
        courseCode: row.courseCode,
        courseName: row.courseName,
        teacherId: row.teacherId,
        departmentId: row.departmentId,
        creditHours: row.creditHours,
        courseType: row.courseType,
        classNamesText: row.classes.map((item: any) => item.className).join('、'),
      }
    : {
        semesterId: '',
        courseCode: '',
        courseName: '',
        teacherId: '',
        departmentId: '',
        creditHours: 0,
        courseType: '必修',
        classNamesText: '',
      });
  dialogVisible.value = true;
}

async function submitForm() {
  const payload = {
    semesterId: form.semesterId,
    courseCode: form.courseCode,
    courseName: form.courseName,
    teacherId: form.teacherId,
    departmentId: form.departmentId,
    creditHours: Number(form.creditHours),
    courseType: form.courseType,
    classNames: form.classNamesText.split(/[、,，]/).map((item) => item.trim()).filter(Boolean),
  };
  if (editingId.value) {
    await apiPut(`/courses/${editingId.value}`, payload);
  } else {
    await apiPost('/courses', payload);
  }
  dialogVisible.value = false;
  ElMessage.success('课程保存成功');
  await loadData();
}

async function removeCourse(id: string) {
  await apiDelete(`/courses/${id}`);
  ElMessage.success('课程已删除');
  await loadData();
}

async function exportCourses() {
  await downloadFile('/export/courses', 'courses.xlsx');
}

async function downloadTemplate() {
  await downloadFile('/export/courses-template', 'courses-template.xlsx');
}

async function importExcel(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 }).slice(1).filter((row) => row.some((cell) => cell !== undefined && cell !== ''));
  const usersByUsername = new Map((lookups.value.users ?? []).map((item: any) => [item.username, item.id]));
  const departmentsByCode = new Map((lookups.value.departments ?? []).map((item: any) => [item.code, item.id]));
  const semestersByCode = new Map((lookups.value.semesters ?? []).map((item: any) => [item.code, item.id]));
  const payload = rows.map((row: any[]) => ({
    semesterId: semestersByCode.get(String(row[0] ?? '').trim()) ?? lookups.value.semesters?.[0]?.id,
    courseCode: String(row[1] ?? '').trim(),
    courseName: String(row[2] ?? '').trim(),
    teacherId: usersByUsername.get(String(row[3] ?? '').trim()),
    departmentId: departmentsByCode.get(String(row[4] ?? '').trim()),
    classNames: String(row[5] ?? '').split(/[、,，]/).map((item) => item.trim()).filter(Boolean),
    creditHours: Number(row[6] ?? 0),
    courseType: String(row[7] ?? '必修').trim() || '必修',
  })).filter((row) => row.semesterId && row.courseCode && row.courseName && row.teacherId && row.departmentId);
  await apiPost('/courses/import', { rows: payload });
  ElMessage.success(`成功导入 ${payload.length} 条课程`);
  await loadData();
}

async function batchDelete() {
  if (!selectedIds.value.length) {
    ElMessage.warning('请先勾选要删除的课程');
    return;
  }
  await ElMessageBox.confirm(`确定删除已选中的 ${selectedIds.value.length} 条课程吗？`, '批量删除确认', { type: 'warning' });
  await apiPost('/courses/batch-delete', { ids: selectedIds.value });
  selectedIds.value = [];
  ElMessage.success('批量删除成功');
  await loadData();
}

function handleSelectionChange(selection: any[]) {
  selectedIds.value = selection.map((item) => item.id);
}

watch(keyword, () => {
  page.value = 1;
  if (keywordTimer) {
    clearTimeout(keywordTimer);
  }
  keywordTimer = setTimeout(() => {
    loadData();
  }, 260);
});

onBeforeUnmount(() => {
  if (keywordTimer) {
    clearTimeout(keywordTimer);
  }
});

onMounted(loadData);
</script>

<template>
  <PageCard fill>
    <div class="page-toolbar">
      <el-input
        v-model="keyword"
        class="page-toolbar__search"
        placeholder="搜索课程名称 / 课程编号 / 教师"
        clearable
      />
      <div class="page-toolbar__actions">
        <el-button @click="downloadTemplate">下载模板</el-button>
        <el-button @click="exportCourses">导出课程</el-button>
        <el-upload :show-file-list="false" accept=".xlsx,.xls" :auto-upload="false" :on-change="({ raw }: any) => raw && importExcel(raw)">
          <el-button>Excel 导入</el-button>
        </el-upload>
        <el-button type="danger" plain @click="batchDelete">批量删除</el-button>
        <el-button type="primary" @click="openDialog()">新增课程</el-button>
      </div>
    </div>

    <div class="page-table">
      <el-table border :data="list" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="48" />
        <el-table-column prop="semesterName" label="学期" />
        <el-table-column prop="courseCode" label="课程编号" width="120" />
        <el-table-column prop="courseName" label="课程名称" />
        <el-table-column prop="teacherName" label="教师" width="120" />
        <el-table-column prop="departmentName" label="教研室" width="140" />
        <el-table-column label="班级">
          <template #default="{ row }">{{ row.classes.map((item: any) => item.className).join('、') }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button link @click="openDialog(row)">编辑</el-button>
            <el-button link type="danger" @click="removeCourse(row.id)">删除</el-button>
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
        :total="total"
        @current-change="handlePageChange"
      />
    </div>

    <el-dialog v-model="dialogVisible" append-to-body :title="editingId ? '编辑课程' : '新增课程'" width="700px">
      <el-form label-position="top" class="form-grid">
        <el-form-item label="学期">
          <el-select v-model="form.semesterId"><el-option v-for="item in lookups.semesters ?? []" :key="item.id" :label="item.name" :value="item.id" /></el-select>
        </el-form-item>
        <el-form-item label="课程编号"><el-input v-model="form.courseCode" /></el-form-item>
        <el-form-item label="课程名称"><el-input v-model="form.courseName" /></el-form-item>
        <el-form-item label="任课教师">
          <el-select v-model="form.teacherId"><el-option v-for="item in lookups.users ?? []" :key="item.id" :label="item.realName" :value="item.id" /></el-select>
        </el-form-item>
        <el-form-item label="教研室">
          <el-select v-model="form.departmentId"><el-option v-for="item in lookups.departments ?? []" :key="item.id" :label="item.name" :value="item.id" /></el-select>
        </el-form-item>
        <el-form-item label="学分"><el-input-number v-model="form.creditHours" :min="0" /></el-form-item>
        <el-form-item label="课程类型">
          <el-select v-model="form.courseType">
            <el-option v-for="item in courseTypeOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="班级（用 、 或 , 分隔）" style="grid-column: 1 / -1">
          <el-input v-model="form.classNamesText" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </PageCard>
</template>
