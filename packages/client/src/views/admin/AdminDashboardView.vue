<script setup lang="ts">
import * as echarts from 'echarts';
import { nextTick, onMounted, ref } from 'vue';
import PageCard from '@/components/common/PageCard.vue';
import { apiGet } from '@/api';

const stats = ref<any>(null);
const online = ref<any>(null);
const chartRef = ref<HTMLDivElement | null>(null);

async function loadData() {
  stats.value = await apiGet('/stats/admin');
  online.value = await apiGet('/online/users');
  await nextTick();
  if (chartRef.value && stats.value) {
    const chart = echarts.init(chartRef.value);
    chart.setOption({
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          data: stats.value.paperStatusDistribution.map((item: any) => ({
            name: item.status,
            value: item.value,
          })),
          color: ['#d8a25a', '#0e6b56', '#8f3942'],
        },
      ],
    });
  }
}

onMounted(loadData);
</script>

<template>
  <div class="shell-content">
    <div class="metric-grid" v-if="stats">
      <div class="metric-card">
        <span>在线人数</span>
        <strong>{{ stats.onlineCount }}</strong>
      </div>
      <div class="metric-card">
        <span>待审试卷</span>
        <strong>{{ stats.pendingCount }}</strong>
      </div>
      <div class="metric-card">
        <span>已通过</span>
        <strong>{{ stats.approvedCount }}</strong>
      </div>
      <div class="metric-card">
        <span>已驳回</span>
        <strong>{{ stats.rejectedCount }}</strong>
      </div>
    </div>

    <div class="split-grid">
      <PageCard title="在线状态" eyebrow="Live">
        <el-table :data="online?.onlineUsers ?? []">
          <el-table-column prop="realName" label="姓名" />
          <el-table-column prop="roleCode" label="角色" />
          <el-table-column prop="departmentName" label="教研室" />
        </el-table>
      </PageCard>

      <PageCard title="试卷状态分布" eyebrow="Chart">
        <div ref="chartRef" style="height: 320px" />
      </PageCard>
    </div>

    <PageCard title="教研室进度" eyebrow="Progress">
      <div v-for="item in stats?.departmentProgress ?? []" :key="item.departmentId" style="margin-bottom: 18px">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px">
          <strong>{{ item.departmentName }}</strong>
          <span>{{ item.progress }}%</span>
        </div>
        <el-progress :percentage="item.progress" :stroke-width="12" color="#ba7a34" />
      </div>
    </PageCard>
  </div>
</template>
