<script setup lang="ts">
import * as XLSX from 'xlsx';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageCard from '@/components/common/PageCard.vue';
import { apiGet, apiPost, downloadFile } from '@/api';
import { formatDateTime } from '@/utils/datetime';

const list = ref<any[]>([]);
const keyword = ref('');
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const selectedIds = ref<string[]>([]);
let keywordTimer: ReturnType<typeof setTimeout> | null = null;

async function loadData() {
  const data = await apiGet<any>('/audit-logs', { keyword: keyword.value, page: page.value, pageSize: pageSize.value });
  list.value = data.list;
  total.value = data.total;
}

async function exportLogs() {
  await downloadFile('/export/audit-logs', 'audit-logs.xlsx');
}

async function downloadTemplate() {
  await downloadFile('/export/audit-logs-template', 'audit-logs-template.xlsx');
}

async function importLogs(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 }).slice(1).filter((row) => row.some((cell) => cell !== undefined && cell !== ''));
  const payload = rows.map((row: any[]) => ({
    userName: String(row[0] ?? '').trim(),
    action: String(row[1] ?? '').trim(),
    module: String(row[2] ?? '').trim(),
    detail: String(row[3] ?? '').trim(),
    ipAddress: String(row[4] ?? '').trim() || null,
    statusCode: Number(row[5] ?? 200),
    createdAt: String(row[6] ?? '').trim() || null,
  })).filter((row) => row.userName && row.action && row.module && row.detail);
  await apiPost('/audit-logs/import', { rows: payload });
  ElMessage.success(`成功导入 ${payload.length} 条审计日志`);
  await loadData();
}

async function batchDelete() {
  if (!selectedIds.value.length) {
    ElMessage.warning('请先勾选要删除的日志');
    return;
  }
  await ElMessageBox.confirm(`确定删除已选中的 ${selectedIds.value.length} 条审计日志吗？`, '批量删除确认', { type: 'warning' });
  await apiPost('/audit-logs/batch-delete', { ids: selectedIds.value });
  selectedIds.value = [];
  ElMessage.success('批量删除成功');
  await loadData();
}

function handlePageChange(nextPage: number) {
  page.value = nextPage;
  loadData();
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
        placeholder="搜索用户 / 动作 / 详情"
        clearable
      />
      <div class="page-toolbar__actions">
        <el-button @click="downloadTemplate">下载模板</el-button>
        <el-upload :show-file-list="false" accept=".xlsx,.xls" :auto-upload="false" :on-change="({ raw }: any) => raw && importLogs(raw)">
          <el-button>导入日志</el-button>
        </el-upload>
        <el-button @click="exportLogs">导出日志</el-button>
        <el-button type="danger" plain @click="batchDelete">批量删除</el-button>
      </div>
    </div>

    <div class="page-table">
      <el-table border :data="list" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="48" />
        <el-table-column prop="userName" label="用户" width="120" />
        <el-table-column prop="action" label="动作" width="160" />
        <el-table-column prop="module" label="模块" width="120" />
        <el-table-column prop="detail" label="详情" />
        <el-table-column prop="ipAddress" label="IP" width="140" />
        <el-table-column label="时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
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
  </PageCard>
</template>
