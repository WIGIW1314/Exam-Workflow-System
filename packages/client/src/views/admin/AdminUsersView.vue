<script setup lang="ts">
import * as XLSX from 'xlsx';
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageCard from '@/components/common/PageCard.vue';
import { apiDelete, apiGet, apiPost, apiPut, downloadFile } from '@/api';

const users = ref<any[]>([]);
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
  username: '',
  realName: '',
  email: '',
  phone: '',
  departmentId: '',
  status: true,
  roleCodes: [] as string[],
});

async function loadData() {
  const [userData, lookupData] = await Promise.all([
    apiGet<any>('/users', { keyword: keyword.value, page: page.value, pageSize: pageSize.value }),
    apiGet('/lookups'),
  ]);
  users.value = userData.list;
  total.value = userData.total;
  lookups.value = lookupData;
}

function handlePageChange(nextPage: number) {
  page.value = nextPage;
  loadData();
}

function openCreate() {
  editingId.value = '';
  Object.assign(form, {
    username: '',
    realName: '',
    email: '',
    phone: '',
    departmentId: '',
    status: true,
    roleCodes: [],
  });
  dialogVisible.value = true;
}

function openEdit(row: any) {
  editingId.value = row.id;
  Object.assign(form, {
    username: row.username,
    realName: row.realName,
    email: row.email,
    phone: row.phone,
    departmentId: row.departmentId,
    status: row.status,
    roleCodes: row.roles.map((item: any) => item.code),
  });
  dialogVisible.value = true;
}

async function submitForm() {
  if (editingId.value) {
    await apiPut(`/users/${editingId.value}`, {
      realName: form.realName,
      email: form.email || null,
      phone: form.phone || null,
      departmentId: form.departmentId || null,
      status: form.status,
    });
    await apiPost(`/users/${editingId.value}/roles`, { roleCodes: form.roleCodes });
    ElMessage.success('用户更新成功');
  } else {
    await apiPost('/users', {
      username: form.username,
      realName: form.realName,
      email: form.email || null,
      phone: form.phone || null,
      departmentId: form.departmentId || null,
      status: form.status,
      roleCodes: form.roleCodes,
    });
    ElMessage.success('用户创建成功');
  }
  dialogVisible.value = false;
  await loadData();
}

async function removeUser(id: string) {
  await apiDelete(`/users/${id}`);
  ElMessage.success('用户已删除');
  await loadData();
}

async function batchDelete() {
  if (!selectedIds.value.length) {
    ElMessage.warning('请先勾选要删除的用户');
    return;
  }
  await ElMessageBox.confirm(`确定删除已选中的 ${selectedIds.value.length} 个用户吗？`, '批量删除确认', { type: 'warning' });
  await apiPost('/users/batch-delete', { ids: selectedIds.value });
  selectedIds.value = [];
  ElMessage.success('批量删除成功');
  await loadData();
}

async function resetPassword(id: string) {
  await apiPost(`/users/${id}/reset-password`);
  ElMessage.success('密码已重置为 123456');
}

async function exportUsers() {
  await downloadFile('/export/users', 'users.xlsx');
}

async function downloadTemplate() {
  await downloadFile('/export/users-template', 'users-template.xlsx');
}

async function importUsers(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 }).slice(1).filter((row) => row.some((cell) => cell !== undefined && cell !== ''));
  const departmentCodeMap = new Map((lookups.value.departments ?? []).map((item: any) => [item.code, item.id]));
  const payload = rows.map((row: any[]) => ({
    username: String(row[0] ?? '').trim(),
    realName: String(row[1] ?? '').trim(),
    email: String(row[2] ?? '').trim() || null,
    phone: String(row[3] ?? '').trim() || null,
    departmentId: departmentCodeMap.get(String(row[4] ?? '').trim()) ?? null,
    roleCodes: String(row[5] ?? '').split(/[,，]/).map((item) => item.trim()).filter(Boolean),
    status: String(row[6] ?? '启用').trim() || '启用',
  })).filter((row) => row.username && row.realName && row.roleCodes.length);
  await apiPost('/users/batch-import', { rows: payload });
  ElMessage.success(`成功导入 ${payload.length} 个用户`);
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
        placeholder="搜索用户名 / 姓名 / 邮箱"
        clearable
      />
      <div class="page-toolbar__actions">
        <el-button @click="downloadTemplate">下载模板</el-button>
        <el-upload :show-file-list="false" accept=".xlsx,.xls" :auto-upload="false" :on-change="({ raw }: any) => raw && importUsers(raw)">
          <el-button>导入用户</el-button>
        </el-upload>
        <el-button @click="exportUsers">导出用户</el-button>
        <el-button type="danger" plain @click="batchDelete">批量删除</el-button>
        <el-button type="primary" @click="openCreate">新建用户</el-button>
      </div>
    </div>

    <div class="page-table">
      <el-table border :data="users" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="48" />
        <el-table-column prop="username" label="用户名" width="120" />
        <el-table-column prop="realName" label="姓名" width="120" />
        <el-table-column prop="departmentName" label="教研室" />
        <el-table-column label="角色">
          <template #default="{ row }">
            <el-tag v-for="role in row.roles" :key="role.id" style="margin-right: 6px">{{ role.name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">{{ row.status ? '启用' : '停用' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link @click="resetPassword(row.id)">重置密码</el-button>
            <el-button link type="danger" @click="removeUser(row.id)">删除</el-button>
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

    <el-dialog v-model="dialogVisible" append-to-body :title="editingId ? '编辑用户' : '新建用户'" width="640px">
      <el-form label-position="top" class="form-grid">
        <el-form-item label="用户名">
          <el-input v-model="form.username" :disabled="Boolean(editingId)" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="form.realName" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="form.email" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item label="教研室">
          <el-select v-model="form.departmentId" clearable>
            <el-option v-for="item in lookups.departments ?? []" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.roleCodes" multiple>
            <el-option v-for="item in lookups.roles ?? []" :key="item.id" :label="item.name" :value="item.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="form.status" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </PageCard>
</template>
