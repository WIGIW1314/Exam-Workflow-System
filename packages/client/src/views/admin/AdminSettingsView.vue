<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageCard from '@/components/common/PageCard.vue';
import { apiGet, apiPut } from '@/api';

const settings = ref<any[]>([]);

async function loadData() {
  settings.value = await apiGet('/settings');
}

async function saveData() {
  await apiPut('/settings', settings.value);
  ElMessage.success('系统设置已保存');
}

onMounted(loadData);
</script>

<template>
  <PageCard title="系统设置" eyebrow="Settings">
    <el-table :data="settings">
      <el-table-column prop="key" label="键" width="180" />
      <el-table-column prop="description" label="说明" width="180" />
      <el-table-column label="值">
        <template #default="{ row }">
          <el-input v-model="row.value" />
        </template>
      </el-table-column>
    </el-table>
    <div style="margin-top: 16px; text-align: right">
      <el-button type="primary" @click="saveData">保存配置</el-button>
    </div>
  </PageCard>
</template>
