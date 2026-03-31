<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageCard from '@/components/common/PageCard.vue';
import { apiDelete, apiGet, apiPost, apiPut } from '@/api';

const list = ref<any[]>([]);
const dialogVisible = ref(false);
const editingId = ref('');
const form = reactive({
  name: '',
  code: '',
  startDate: '',
  endDate: '',
  isCurrent: false,
  status: true,
});

async function loadData() {
  list.value = await apiGet('/semesters');
}

function openDialog(row?: any) {
  editingId.value = row?.id ?? '';
  Object.assign(form, row ?? { name: '', code: '', startDate: '', endDate: '', isCurrent: false, status: true });
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

onMounted(loadData);
</script>

<template>
  <PageCard title="学期管理" eyebrow="Semester">
    <template #actions>
      <el-button type="primary" @click="openDialog()">新增学期</el-button>
    </template>

    <el-table :data="list">
      <el-table-column prop="name" label="学期名称" />
      <el-table-column prop="code" label="编码" width="180" />
      <el-table-column prop="startDate" label="开始日期" width="160" />
      <el-table-column prop="endDate" label="结束日期" width="160" />
      <el-table-column label="当前学期" width="100">
        <template #default="{ row }">{{ row.isCurrent ? '是' : '否' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220">
        <template #default="{ row }">
          <el-button link @click="openDialog(row)">编辑</el-button>
          <el-button link type="primary" @click="setCurrent(row.id)">设为当前</el-button>
          <el-button link type="danger" @click="removeSemester(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑学期' : '新增学期'" width="620px">
      <el-form label-position="top" class="form-grid">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="编码"><el-input v-model="form.code" /></el-form-item>
        <el-form-item label="开始日期"><el-input v-model="form.startDate" placeholder="2026-02-16" /></el-form-item>
        <el-form-item label="结束日期"><el-input v-model="form.endDate" placeholder="2026-07-10" /></el-form-item>
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
