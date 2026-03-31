<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageCard from '@/components/common/PageCard.vue';
import { apiDelete, apiGet, apiPost, apiPut } from '@/api';

const users = ref<any[]>([]);
const lookups = ref<any>({});
const keyword = ref('');
const dialogVisible = ref(false);
const editingId = ref('');
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
    apiGet<any>('/users', { keyword: keyword.value, page: 1, pageSize: 100 }),
    apiGet('/lookups'),
  ]);
  users.value = userData.list;
  lookups.value = lookupData;
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

async function resetPassword(id: string) {
  await apiPost(`/users/${id}/reset-password`);
  ElMessage.success('密码已重置为 123456');
}

onMounted(loadData);
</script>

<template>
  <PageCard title="用户管理" eyebrow="Admin">
    <template #actions>
      <el-button type="primary" @click="openCreate">新建用户</el-button>
    </template>

    <div class="table-toolbar">
      <el-input v-model="keyword" placeholder="搜索用户名 / 姓名 / 邮箱" clearable @change="loadData" />
    </div>

    <el-table :data="users">
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

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑用户' : '新建用户'" width="640px">
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
