<script setup lang="ts">
import * as XLSX from 'xlsx';
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageCard from '@/components/common/PageCard.vue';
import { apiDelete, apiGet, apiPost, apiPut, downloadFile } from '@/api';

const list = ref<any[]>([]);
const keyword = ref('');
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const selectedIds = ref<string[]>([]);
const dialogVisible = ref(false);
const editingId = ref('');
let keywordTimer: ReturnType<typeof setTimeout> | null = null;
const form = reactive({
  name: '',
  code: '',
  isCurrent: false,
  status: true,
});

async function loadData() {
  const data = await apiGet<any>('/semesters', { keyword: keyword.value, page: page.value, pageSize: pageSize.value });
  list.value = data.list;
  total.value = data.total;
}

function handlePageChange(nextPage: number) {
  page.value = nextPage;
  loadData();
}

function handleSelectionChange(selection: any[]) {
  selectedIds.value = selection.map((item) => item.id);
}

function openDialog(row?: any) {
  editingId.value = row?.id ?? '';
  Object.assign(form, row ?? { name: '', code: '', isCurrent: false, status: true });
  dialogVisible.value = true;
}

async function submitForm() {
  const payload = { ...form };
  if (editingId.value) {
    await apiPut(`/semesters/${editingId.value}`, payload);
  } else {
    await apiPost('/semesters', payload);
  }
  dialogVisible.value = false;
  ElMessage.success('学期保存成功');
  await loadData();
}

async function setCurrent(id: string) {
  await apiPut(`/semesters/${id}/set-current`);
  ElMessage.success('已切换当前学期');
  await loadData();
}

async function removeSemester(id: string) {
  await apiDelete(`/semesters/${id}`);
  ElMessage.success('学期已删除');
  await loadData();
}

async function batchDelete() {
  if (!selectedIds.value.length) {
    ElMessage.warning('请先勾选要删除的学期');
    return;
  }
  await ElMessageBox.confirm(`确定删除已选中的 ${selectedIds.value.length} 个学期吗？`, '批量删除确认', { type: 'warning' });
  await apiPost('/semesters/batch-delete', { ids: selectedIds.value });
  selectedIds.value = [];
  ElMessage.success('批量删除成功');
  await loadData();
}

async function exportSemesters() {
  await downloadFile('/export/semesters', 'semesters.xlsx');
}

async function downloadTemplate() {
  await downloadFile('/export/semesters-template', 'semesters-template.xlsx');
}

async function importSemesters(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 }).slice(1).filter((row) => row.some((cell) => cell !== undefined && cell !== ''));
  const payload = rows.map((row: any[]) => ({
    name: String(row[0] ?? '').trim(),
    code: String(row[1] ?? '').trim(),
    isCurrent: String(row[2] ?? '否').trim() || '否',
    status: String(row[3] ?? '启用').trim() || '启用',
  })).filter((row) => row.name && row.code);
  await apiPost('/semesters/import', { rows: payload });
  ElMessage.success(`成功导入 ${payload.length} 个学期`);
  await loadData();
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
        placeholder="搜索学期名称 / 编码"
        clearable
      />
      <div class="page-toolbar__actions">
        <el-button @click="downloadTemplate">下载模板</el-button>
        <el-upload :show-file-list="false" accept=".xlsx,.xls" :auto-upload="false" :on-change="({ raw }: any) => raw && importSemesters(raw)">
          <el-button>导入学期</el-button>
        </el-upload>
        <el-button @click="exportSemesters">导出学期</el-button>
        <el-button type="danger" plain @click="batchDelete">批量删除</el-button>
        <el-button type="primary" @click="openDialog()">新增学期</el-button>
      </div>
    </div>

    <div class="page-table">
      <el-table border :data="list" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="48" />
        <el-table-column prop="name" label="学期名称" />
        <el-table-column prop="code" label="编码" width="180" />
        <el-table-column label="当前学期" width="100">
          <template #default="{ row }">{{ row.isCurrent ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">{{ row.status ? '启用' : '停用' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button link @click="openDialog(row)">编辑</el-button>
            <el-button link type="primary" @click="setCurrent(row.id)">设为当前</el-button>
            <el-button link type="danger" @click="removeSemester(row.id)">删除</el-button>
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

    <el-dialog v-model="dialogVisible" append-to-body :title="editingId ? '编辑学期' : '新增学期'" width="620px">
      <el-form label-position="top" class="form-grid">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="编码"><el-input v-model="form.code" /></el-form-item>
        <el-form-item label="当前学期"><el-switch v-model="form.isCurrent" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.status" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </PageCard>
</template>
