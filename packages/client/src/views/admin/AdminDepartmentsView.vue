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
  name: '',
  code: '',
  description: '',
  directorId: '',
  sortOrder: 0,
  status: true,
});

async function loadData() {
  const [departments, lookupData] = await Promise.all([
    apiGet<any>('/departments', { keyword: keyword.value, page: page.value, pageSize: pageSize.value }),
    apiGet<any>('/lookups'),
  ]);
  list.value = departments.list;
  total.value = departments.total;
  lookups.value = lookupData;
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
  Object.assign(form, row ?? { name: '', code: '', description: '', directorId: '', sortOrder: 0, status: true });
  dialogVisible.value = true;
}

async function submitForm() {
  const payload = {
    ...form,
    directorId: form.directorId || null,
  };
  if (editingId.value) {
    await apiPut(`/departments/${editingId.value}`, payload);
  } else {
    await apiPost('/departments', payload);
  }
  dialogVisible.value = false;
  ElMessage.success('教研室保存成功');
  await loadData();
}

async function removeItem(id: string) {
  await apiDelete(`/departments/${id}`);
  ElMessage.success('教研室已删除');
  await loadData();
}

async function batchDelete() {
  if (!selectedIds.value.length) {
    ElMessage.warning('请先勾选要删除的教研室');
    return;
  }
  await ElMessageBox.confirm(`确定删除已选中的 ${selectedIds.value.length} 个教研室吗？`, '批量删除确认', { type: 'warning' });
  await apiPost('/departments/batch-delete', { ids: selectedIds.value });
  selectedIds.value = [];
  ElMessage.success('批量删除成功');
  await loadData();
}

async function exportDepartments() {
  await downloadFile('/export/departments', 'departments.xlsx');
}

async function downloadTemplate() {
  await downloadFile('/export/departments-template', 'departments-template.xlsx');
}

async function importDepartments(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 }).slice(1).filter((row) => row.some((cell) => cell !== undefined && cell !== ''));
  const usersByUsername = new Map((lookups.value.users ?? []).map((item: any) => [item.username, item.id]));
  const payload = rows.map((row: any[]) => ({
    name: String(row[0] ?? '').trim(),
    code: String(row[1] ?? '').trim(),
    directorId: usersByUsername.get(String(row[2] ?? '').trim()) ?? null,
    sortOrder: Number(row[3] ?? 0),
    status: String(row[4] ?? '启用').trim() || '启用',
    description: String(row[5] ?? '').trim() || null,
  })).filter((row) => row.name && row.code);
  await apiPost('/departments/import', { rows: payload });
  ElMessage.success(`成功导入 ${payload.length} 个教研室`);
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
        placeholder="搜索名称 / 编码 / 说明"
        clearable
      />
      <div class="page-toolbar__actions">
        <el-button @click="downloadTemplate">下载模板</el-button>
        <el-upload :show-file-list="false" accept=".xlsx,.xls" :auto-upload="false" :on-change="({ raw }: any) => raw && importDepartments(raw)">
          <el-button>导入教研室</el-button>
        </el-upload>
        <el-button @click="exportDepartments">导出教研室</el-button>
        <el-button type="danger" plain @click="batchDelete">批量删除</el-button>
        <el-button type="primary" @click="openDialog()">新增教研室</el-button>
      </div>
    </div>

    <div class="page-table">
      <el-table border :data="list" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="48" />
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="code" label="编码" width="120" />
        <el-table-column prop="directorName" label="主任" width="140" />
        <el-table-column prop="memberCount" label="成员数" width="100" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">{{ row.status ? '启用' : '停用' }}</template>
        </el-table-column>
        <el-table-column prop="description" label="说明" />
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button link @click="openDialog(row)">编辑</el-button>
            <el-button link type="danger" @click="removeItem(row.id)">删除</el-button>
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

    <el-dialog v-model="dialogVisible" append-to-body :title="editingId ? '编辑教研室' : '新增教研室'" width="620px">
      <el-form label-position="top" class="form-grid">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="编码"><el-input v-model="form.code" /></el-form-item>
        <el-form-item label="主任">
          <el-select v-model="form.directorId" clearable>
            <el-option v-for="item in lookups.users ?? []" :key="item.id" :label="item.realName" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sortOrder" :min="0" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.status" /></el-form-item>
        <el-form-item label="说明" style="grid-column: 1 / -1">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </PageCard>
</template>
