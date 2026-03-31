<script setup lang="ts">
import * as XLSX from 'xlsx';
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageCard from '@/components/common/PageCard.vue';
import { apiDelete, apiGet, apiPost, apiPut, downloadFile } from '@/api';

const list = ref<any[]>([]);
const lookups = ref<any>({});
const dialogVisible = ref(false);
const editingId = ref('');
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

async function loadData() {
  const [courseData, lookupData] = await Promise.all([
    apiGet<any>('/courses', { page: 1, pageSize: 200 }),
    apiGet<any>('/lookups'),
  ]);
  list.value = courseData.list;
  lookups.value = lookupData;
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
  await downloadFile('/courses/export', 'courses.xlsx');
}

async function importExcel(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 }).slice(1);
  const usersByName = new Map((lookups.value.users ?? []).map((item: any) => [item.realName, item.id]));
  const departmentsByName = new Map((lookups.value.departments ?? []).map((item: any) => [item.name, item.id]));
  const semestersByName = new Map((lookups.value.semesters ?? []).map((item: any) => [item.name, item.id]));
  const payload = rows.map((row: any[]) => ({
    semesterId: semestersByName.get(row[0]) ?? lookups.value.semesters?.[0]?.id,
    courseCode: row[1],
    courseName: row[2],
    teacherId: usersByName.get(row[3]),
    classNames: String(row[4] ?? '').split(/[、,，]/).filter(Boolean),
    departmentId: departmentsByName.get(row[5]),
    creditHours: Number(row[6] ?? 0),
    courseType: row[7] ?? '必修',
  }));
  await apiPost('/courses/import', { rows: payload });
  ElMessage.success(`成功导入 ${payload.length} 条课程`);
  await loadData();
}

onMounted(loadData);
</script>

<template>
  <PageCard title="课程管理" eyebrow="Course">
    <template #actions>
      <el-button @click="exportCourses">导出课程</el-button>
      <el-upload :show-file-list="false" accept=".xlsx,.xls" :auto-upload="false" :on-change="({ raw }: any) => raw && importExcel(raw)">
        <el-button>Excel 导入</el-button>
      </el-upload>
      <el-button type="primary" @click="openDialog()">新增课程</el-button>
    </template>

    <el-table :data="list">
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

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑课程' : '新增课程'" width="700px">
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
        <el-form-item label="课程类型"><el-input v-model="form.courseType" /></el-form-item>
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
