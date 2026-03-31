<script setup lang="ts">
import { onMounted, ref } from 'vue';
import PageCard from '@/components/common/PageCard.vue';
import { apiGet } from '@/api';

const stats = ref<any>(null);

async function loadData() {
  stats.value = await apiGet('/stats/director');
}

onMounted(loadData);
</script>

<template>
  <div class="metric-grid" v-if="stats">
    <div class="metric-card">
      <span>待审试卷</span>
      <strong>{{ stats.pendingCount }}</strong>
    </div>
    <div class="metric-card">
      <span>本组通过</span>
      <strong>{{ stats.approvedCount }}</strong>
    </div>
    <div class="metric-card">
      <span>本组驳回</span>
      <strong>{{ stats.rejectedCount }}</strong>
    </div>
  </div>

  <div class="split-grid">
    <PageCard title="本组成员在线情况" eyebrow="Team">
      <el-table :data="stats?.teamMembers ?? []">
        <el-table-column prop="realName" label="姓名" />
        <el-table-column prop="roles" label="角色" />
        <el-table-column label="在线">
          <template #default="{ row }">{{ row.isOnline ? '在线' : '离线' }}</template>
        </el-table-column>
      </el-table>
    </PageCard>

    <PageCard title="本组进度" eyebrow="Progress">
      <div v-for="item in stats?.departmentProgress ?? []" :key="item.departmentId">
        <div style="display: flex; justify-content: space-between">
          <strong>{{ item.departmentName }}</strong>
          <span>{{ item.progress }}%</span>
        </div>
        <el-progress :percentage="item.progress" :stroke-width="12" color="#ba7a34" />
      </div>
    </PageCard>
  </div>
</template>
