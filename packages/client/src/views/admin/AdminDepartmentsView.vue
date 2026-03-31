<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageCard from '@/components/common/PageCard.vue';
import { apiDelete, apiGet, apiPost, apiPut } from '@/api';

const list = ref<any[]>([]);
const lookups = ref<any>({});
const dialogVisible = ref(false);
const editingId = ref('');
const form = reactive({
  name: '',
  code: '',
  description: '',
  directorId: '',
  sortOrder: 0,
  status: true,
});

async function loadData() {
  const [departments, lookupData] = await Promise.all([apiGet<any[]>('/departments'), apiGet<any>('/lookups')]);
  list.value = departments;
  lookups.value = lookupData;
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

onMounted(loadData);
</script>

<template>
  <PageCard title="教研室管理" eyebrow="Department">
    <template #actions>
      <el-button type="primary" @click="openDialog()">新增教研室</el-button>
    </template>

    <el-table :data="list">
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="code" label="编码" width="120" />
      <el-table-column prop="directorName" label="主任" width="140" />
      <el-table-column prop="memberCount" label="成员数" width="100" />
      <el-table-column prop="description" label="说明" />
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <el-button link @click="openDialog(row)">编辑</el-button>
          <el-button link type="danger" @click="removeItem(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑教研室' : '新增教研室'" width="620px">
      <el-form label-position="top" class="form-grid">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="编码"><el-input v-model="form.code" /></el-form-item>
        <el-form-item label="主任">
          <el-select v-model="form.directorId" clearable>
            <el-option v-for="item in lookups.users ?? []" :key="item.id" :label="item.realName" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sortOrder" :min="0" /></el-form-item>
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
