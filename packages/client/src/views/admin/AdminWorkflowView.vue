<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageCard from '@/components/common/PageCard.vue';
import { apiGet, apiPost, apiPut } from '@/api';

const rules = ref<any[]>([]);
const settings = ref<any[]>([]);
const lookups = ref<any>({});
const dialogVisible = ref(false);
const editingId = ref('');
const form = reactive({
  semesterId: '',
  prefix: 'SJ',
  separator: '-',
  dateFormat: 'YYYYMM',
  seqLength: 4,
  currentSeq: 0,
  description: '',
});

async function loadData() {
  const [ruleData, settingData, lookupData] = await Promise.all([
    apiGet<any[]>('/number-rules'),
    apiGet<any[]>('/settings'),
    apiGet<any>('/lookups'),
  ]);
  rules.value = ruleData;
  settings.value = settingData;
  lookups.value = lookupData;
}

function openDialog(row?: any) {
  editingId.value = row?.id ?? '';
  Object.assign(form, row ?? {
    semesterId: '',
    prefix: 'SJ',
    separator: '-',
    dateFormat: 'YYYYMM',
    seqLength: 4,
    currentSeq: 0,
    description: '',
  });
  dialogVisible.value = true;
}

async function submitForm() {
  if (editingId.value) {
    await apiPut(`/number-rules/${editingId.value}`, form);
  } else {
    await apiPost('/number-rules', form);
  }
  dialogVisible.value = false;
  ElMessage.success('编号规则已保存');
  await loadData();
}

async function saveSettings() {
  await apiPut('/settings', settings.value);
  ElMessage.success('系统设置已保存');
}

onMounted(loadData);
</script>

<template>
  <div class="split-grid">
    <PageCard title="试卷编号规则" eyebrow="Numbering">
      <template #actions>
        <el-button type="primary" @click="openDialog()">新增规则</el-button>
      </template>
      <el-table :data="rules">
        <el-table-column prop="semesterName" label="学期" />
        <el-table-column prop="prefix" label="前缀" width="90" />
        <el-table-column prop="dateFormat" label="日期格式" width="120" />
        <el-table-column prop="seqLength" label="序号位数" width="100" />
        <el-table-column prop="currentSeq" label="当前序号" width="100" />
        <el-table-column prop="example" label="示例" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button link @click="openDialog(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </PageCard>

    <PageCard title="系统设置" eyebrow="Config">
      <el-table :data="settings">
        <el-table-column prop="key" label="键" width="180" />
        <el-table-column prop="description" label="说明" width="140" />
        <el-table-column label="值">
          <template #default="{ row }">
            <el-input v-model="row.value" />
          </template>
        </el-table-column>
      </el-table>
      <div style="margin-top: 16px; text-align: right">
        <el-button type="primary" @click="saveSettings">保存系统设置</el-button>
      </div>
    </PageCard>
  </div>

  <el-dialog v-model="dialogVisible" :title="editingId ? '编辑编号规则' : '新增编号规则'" width="620px">
    <el-form label-position="top" class="form-grid">
      <el-form-item label="学期">
        <el-select v-model="form.semesterId" :disabled="Boolean(editingId)">
          <el-option v-for="item in lookups.semesters ?? []" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="前缀"><el-input v-model="form.prefix" /></el-form-item>
      <el-form-item label="分隔符"><el-input v-model="form.separator" /></el-form-item>
      <el-form-item label="日期格式"><el-input v-model="form.dateFormat" /></el-form-item>
      <el-form-item label="位数"><el-input-number v-model="form.seqLength" :min="2" :max="8" /></el-form-item>
      <el-form-item label="当前序号" v-if="editingId"><el-input-number v-model="form.currentSeq" :min="0" /></el-form-item>
      <el-form-item label="说明" style="grid-column: 1 / -1">
        <el-input v-model="form.description" type="textarea" :rows="2" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" @click="submitForm">保存</el-button>
    </template>
  </el-dialog>
</template>
