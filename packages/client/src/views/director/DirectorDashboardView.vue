<script setup lang="ts">
import * as echarts from 'echarts';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import PageCard from '@/components/common/PageCard.vue';
import { apiGet } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { formatDateTimeShort } from '@/utils/datetime';

type PaperStatus = 'pending' | 'approved' | 'rejected';

interface StatusDistributionItem {
  status: PaperStatus;
  value: number;
}

interface DepartmentProgressItem {
  departmentId: string;
  departmentName: string;
  teacherCount: number;
  onlineTeachers: number;
  courseCount: number;
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  approvalRate: number;
  reviewedRate: number;
  progress: number;
}

interface TeamMemberItem {
  id: string;
  realName: string;
  username: string;
  roles: string;
  isOnline: boolean;
  lastLoginAt: string | null;
}

interface TeacherRankingItem {
  teacherId: string;
  teacherName: string;
  departmentName: string | null;
  submitted: number;
  approved: number;
  rejected: number;
  pending: number;
}

interface TrendItem {
  date: string;
  value: number;
}

interface ReviewTrendItem {
  date: string;
  approved: number;
  rejected: number;
}

interface DirectorStats {
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  onlineCount: number;
  totalCourses: number;
  totalPapers: number;
  reviewedByCurrentDirector: number;
  paperStatusDistribution: StatusDistributionItem[];
  departmentProgress: DepartmentProgressItem[];
  paperSubmissionTrend: TrendItem[];
  reviewTrend: ReviewTrendItem[];
  teacherPaperRanking: TeacherRankingItem[];
  teamMembers: TeamMemberItem[];
}

const authStore = useAuthStore();
const stats = ref<DirectorStats | null>(null);
const tableHeight = 320;
const memberQuery = ref('');
const memberStatusFilter = ref('');
const memberRoleFilter = ref('');
const memberPage = ref(1);
const memberPageSize = 5;

const statusChartRef = ref<HTMLDivElement | null>(null);
const trendChartRef = ref<HTMLDivElement | null>(null);
const teacherChartRef = ref<HTMLDivElement | null>(null);

const chartMap = new Map<string, echarts.ECharts>();
let resizeObserver: ResizeObserver | null = null;

const statusLabelMap: Record<PaperStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
};

const currentDepartment = computed(() => stats.value?.departmentProgress?.[0] ?? null);
const teamCount = computed(() => stats.value?.teamMembers.length ?? 0);
const reviewedCount = computed(() => (stats.value?.approvedCount ?? 0) + (stats.value?.rejectedCount ?? 0));
const onlineRate = computed(() => (teamCount.value ? Math.round(((stats.value?.onlineCount ?? 0) / teamCount.value) * 100) : 0));
const backlogRate = computed(() => (stats.value?.totalPapers ? Math.round(((stats.value.pendingCount ?? 0) / stats.value.totalPapers) * 100) : 0));
const reviewRate = computed(() => currentDepartment.value?.reviewedRate ?? 0);
const approvalRate = computed(() => currentDepartment.value?.approvalRate ?? 0);
const totalPapersSafe = computed(() => stats.value?.totalPapers ?? 0);
const pendingShare = computed(() => (totalPapersSafe.value ? Math.round(((stats.value?.pendingCount ?? 0) / totalPapersSafe.value) * 100) : 0));
const approvedShare = computed(() => (totalPapersSafe.value ? Math.round(((stats.value?.approvedCount ?? 0) / totalPapersSafe.value) * 100) : 0));
const rejectedShare = computed(() => (totalPapersSafe.value ? Math.round(((stats.value?.rejectedCount ?? 0) / totalPapersSafe.value) * 100) : 0));
const memberRoleOptions = computed(() => Array.from(new Set((stats.value?.teamMembers ?? []).map((item) => item.roles))));

const heroSummary = computed(() => {
  if (!stats.value || !currentDepartment.value) {
    return '正在汇总本组试卷审核、教师提交和成员在线情况。';
  }
  return `${currentDepartment.value.departmentName} 当前累计 ${stats.value.totalPapers} 份试卷，已完成 ${reviewRate.value}% 审核，仍有 ${stats.value.pendingCount} 份待处理。`;
});

const heroFocusCards = computed(() => {
  if (!stats.value) {
    return [];
  }
  return [
    {
      label: '当前积压',
      value: stats.value.pendingCount,
      meta: `占全部试卷 ${pendingShare.value}%`,
      tone: 'warning',
    },
    {
      label: '审核推进',
      value: `${reviewRate.value}%`,
      meta: `${reviewedCount.value} 份已完成`,
      tone: 'primary',
    },
    {
      label: '协同在线',
      value: `${onlineRate.value}%`,
      meta: `${stats.value.onlineCount} 位成员在线`,
      tone: 'success',
    },
  ];
});

const kpiCards = computed(() => {
  if (!stats.value) {
    return [];
  }
  return [
    {
      label: '待处理试卷',
      value: stats.value.pendingCount,
      meta: `待审压力 ${backlogRate.value}%`,
      tone: 'warning',
    },
    {
      label: '本组完成度',
      value: `${reviewRate.value}%`,
      meta: `${reviewedCount.value} / ${stats.value.totalPapers} 已审核`,
      tone: 'primary',
    },
    {
      label: '本组通过率',
      value: `${approvalRate.value}%`,
      meta: `${stats.value.approvedCount} 份通过`,
      tone: 'success',
    },
    {
      label: '在线成员',
      value: stats.value.onlineCount,
      meta: `在线率 ${onlineRate.value}%`,
      tone: 'info',
    },
    {
      label: '覆盖课程',
      value: stats.value.totalCourses,
      meta: `${teamCount.value} 位成员协同`,
      tone: 'purple',
    },
    {
      label: '我的审核量',
      value: stats.value.reviewedByCurrentDirector,
      meta: '当前账号累计审核',
      tone: 'rose',
    },
  ];
});

function ensureChart(key: string, element: HTMLDivElement | null) {
  if (!element) {
    return null;
  }
  let chart = chartMap.get(key);
  if (!chart) {
    chart = echarts.init(element);
    chartMap.set(key, chart);
  }
  return chart;
}

function resizeCharts() {
  chartMap.forEach((chart) => chart.resize());
}

function formatAxisLabel(value: string, maxLength = 4) {
  if (value.length <= maxLength) {
    return value;
  }
  const rows: string[] = [];
  for (let index = 0; index < value.length; index += maxLength) {
    rows.push(value.slice(index, index + maxLength));
  }
  return rows.slice(0, 2).join('\n');
}

function renderCharts() {
  if (!stats.value) {
    return;
  }

  ensureChart('status', statusChartRef.value)?.setOption({
    tooltip: { trigger: 'item', formatter: '{b}：{c} 份（{d}%）' },
    legend: {
      bottom: 0,
      icon: 'circle',
      textStyle: { color: '#606266' },
    },
    series: [
      {
        type: 'pie',
        radius: ['52%', '78%'],
        center: ['50%', '42%'],
        label: { color: '#303133' },
        color: ['#f59e0b', '#34d399', '#fb7185'],
        data: stats.value.paperStatusDistribution.map((item) => ({
          name: statusLabelMap[item.status],
          value: item.value,
        })),
      },
    ],
  });

  ensureChart('trend', trendChartRef.value)?.setOption({
    tooltip: { trigger: 'axis' },
    legend: { top: 0, icon: 'roundRect' },
    grid: { left: 56, right: 20, top: 56, bottom: 38, containLabel: true },
    xAxis: {
      type: 'category',
      data: stats.value.paperSubmissionTrend.map((item) => item.date),
    },
    yAxis: {
      type: 'value',
      name: '份数',
      nameLocation: 'middle',
      nameGap: 42,
      nameTextStyle: { color: '#909399' },
      minInterval: 1,
    },
    series: [
      {
        name: '提交',
        type: 'bar',
        barMaxWidth: 18,
        color: '#79bbff',
        data: stats.value.paperSubmissionTrend.map((item) => item.value),
      },
      {
        name: '通过',
        type: 'line',
        smooth: true,
        symbolSize: 8,
        lineStyle: { width: 3, color: '#34d399' },
        itemStyle: { color: '#34d399' },
        areaStyle: { color: 'rgba(52, 211, 153, 0.12)' },
        data: stats.value.reviewTrend.map((item) => item.approved),
      },
      {
        name: '驳回',
        type: 'line',
        smooth: true,
        symbolSize: 8,
        lineStyle: { width: 3, color: '#fb7185' },
        itemStyle: { color: '#fb7185' },
        data: stats.value.reviewTrend.map((item) => item.rejected),
      },
    ],
  });

  ensureChart('teachers', teacherChartRef.value)?.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, icon: 'roundRect' },
    grid: { left: 92, right: 18, top: 54, bottom: 24, containLabel: true },
    xAxis: {
      type: 'value',
      name: '份数',
      nameGap: 18,
      nameTextStyle: { color: '#909399' },
      minInterval: 1,
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: stats.value.teacherPaperRanking.map((item) => item.teacherName),
      axisLabel: {
        formatter: (value: string) => formatAxisLabel(value),
      },
    },
    series: [
      {
        name: '待审',
        type: 'bar',
        stack: 'papers',
        data: stats.value.teacherPaperRanking.map((item) => item.pending),
        color: '#f59e0b',
        barMaxWidth: 18,
      },
      {
        name: '通过',
        type: 'bar',
        stack: 'papers',
        data: stats.value.teacherPaperRanking.map((item) => item.approved),
        color: '#34d399',
        barMaxWidth: 18,
      },
      {
        name: '驳回',
        type: 'bar',
        stack: 'papers',
        data: stats.value.teacherPaperRanking.map((item) => item.rejected),
        color: '#fb7185',
        barMaxWidth: 18,
      },
    ],
  });

  resizeCharts();
}

function formatLoginTime(value: string | null) {
  if (!value) {
    return '暂无记录';
  }
  return formatDateTimeShort(value);
}

const filteredTeamMembers = computed(() => {
  const keyword = memberQuery.value.trim().toLowerCase();
  return (stats.value?.teamMembers ?? []).filter((item) => {
    const matchKeyword =
      !keyword ||
      [item.realName, item.username, item.roles]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    const matchStatus =
      !memberStatusFilter.value ||
      (memberStatusFilter.value === 'online' && item.isOnline) ||
      (memberStatusFilter.value === 'offline' && !item.isOnline);
    const matchRole = !memberRoleFilter.value || item.roles === memberRoleFilter.value;
    return matchKeyword && matchStatus && matchRole;
  });
});

const pagedTeamMembers = computed(() => {
  const start = (memberPage.value - 1) * memberPageSize;
  return filteredTeamMembers.value.slice(start, start + memberPageSize);
});

function handleMemberPageChange(value: number) {
  memberPage.value = value;
}

async function loadData() {
  stats.value = await apiGet<DirectorStats>('/stats/director');
  await nextTick();
  renderCharts();
}

onMounted(async () => {
  await loadData();
  resizeObserver = new ResizeObserver(() => resizeCharts());
  [statusChartRef, trendChartRef, teacherChartRef].forEach((chartRef) => {
    if (chartRef.value) {
      resizeObserver?.observe(chartRef.value);
    }
  });
  window.addEventListener('resize', resizeCharts);
});

watch(
  () => [authStore.onlineVersion, authStore.paperSubmissionVersion, authStore.paperStatusVersion],
  () => {
    void loadData();
  },
);

watch([memberQuery, memberStatusFilter, memberRoleFilter], () => {
  memberPage.value = 1;
});

watch(
  () => filteredTeamMembers.value.length,
  (total) => {
    const maxPage = Math.max(1, Math.ceil(total / memberPageSize));
    if (memberPage.value > maxPage) {
      memberPage.value = maxPage;
    }
  },
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener('resize', resizeCharts);
  chartMap.forEach((chart) => chart.dispose());
  chartMap.clear();
});
</script>

<template>
  <div v-if="stats" class="director-dashboard">
    <section class="director-hero">
      <div class="director-hero__lead">
        <h2>{{ currentDepartment?.departmentName ?? '本组总览' }}</h2>
        <p>{{ heroSummary }}</p>
        <div class="director-hero__chips">
          <span>课程 {{ stats.totalCourses }}</span>
          <span>试卷 {{ stats.totalPapers }}</span>
          <span>成员 {{ teamCount }}</span>
          <span>在线 {{ stats.onlineCount }}</span>
        </div>

        <div class="director-hero__focus">
          <article
            v-for="item in heroFocusCards"
            :key="item.label"
            class="director-hero-focus-card"
            :class="`director-hero-focus-card--${item.tone}`"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.meta }}</small>
          </article>
        </div>

        <div class="director-hero__rail">
          <div class="director-hero__rail-head">
            <span>本组状态带</span>
            <strong>{{ stats.totalPapers }} 份试卷</strong>
          </div>
          <div class="director-hero__rail-bar">
            <span class="is-pending" :style="{ width: `${pendingShare}%` }"></span>
            <span class="is-approved" :style="{ width: `${approvedShare}%` }"></span>
            <span class="is-rejected" :style="{ width: `${rejectedShare}%` }"></span>
          </div>
          <div class="director-hero__rail-legend">
            <span>待审 {{ stats.pendingCount }}</span>
            <span>通过 {{ stats.approvedCount }}</span>
            <span>驳回 {{ stats.rejectedCount }}</span>
          </div>
        </div>
      </div>

      <div class="director-hero__metrics">
        <article v-for="card in kpiCards" :key="card.label" class="director-kpi" :class="`director-kpi--${card.tone}`">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <small>{{ card.meta }}</small>
        </article>
      </div>
    </section>

    <div class="dashboard-grid dashboard-grid--two">
      <PageCard show-title title="状态结构" eyebrow="本组试卷构成">
        <div class="director-card-split">
          <div ref="statusChartRef" class="dashboard-chart dashboard-chart--small director-chart--status" />

          <div class="director-side-stats">
            <div class="director-side-stat">
              <span>待审压力</span>
              <strong>{{ backlogRate }}%</strong>
              <small>待处理占本组试卷的比例</small>
            </div>
            <div class="director-side-stat">
              <span>完成度</span>
              <strong>{{ reviewRate }}%</strong>
              <small>已审核试卷占总量比例</small>
            </div>
            <div class="director-side-stat">
              <span>通过率</span>
              <strong>{{ approvalRate }}%</strong>
              <small>通过试卷占总量比例</small>
            </div>
          </div>
        </div>
      </PageCard>

      <PageCard show-title title="近 7 天提交与审核" eyebrow="节奏趋势">
        <div ref="trendChartRef" class="dashboard-chart dashboard-chart--medium" />
      </PageCard>
    </div>

    <div class="dashboard-grid dashboard-grid--two">
      <PageCard show-title title="教师提交与审核分布" eyebrow="按教师观察任务分布">
        <div ref="teacherChartRef" class="dashboard-chart dashboard-chart--medium" />
      </PageCard>

      <PageCard show-title title="成员在线与活跃" :eyebrow="`在线 ${stats.onlineCount} / ${teamCount}`">
        <div class="dashboard-table-panel">
          <div class="director-member-summary">
            <div class="director-member-pill">
              <span>在线率</span>
              <strong>{{ onlineRate }}%</strong>
            </div>
            <div class="director-member-pill">
              <span>教师人数</span>
              <strong>{{ currentDepartment?.teacherCount ?? teamCount }}</strong>
            </div>
            <div class="director-member-pill">
              <span>课程覆盖</span>
              <strong>{{ stats.totalCourses }}</strong>
            </div>
          </div>

          <div class="page-toolbar dashboard-table-toolbar">
            <el-input v-model="memberQuery" clearable class="page-toolbar__search" placeholder="搜索姓名、账号或角色" />
            <div class="page-toolbar__actions">
              <el-select v-model="memberStatusFilter" clearable placeholder="全部状态" style="width: 140px">
                <el-option label="在线" value="online" />
                <el-option label="离线" value="offline" />
              </el-select>
              <el-select v-model="memberRoleFilter" clearable placeholder="全部角色" style="width: 180px">
                <el-option v-for="item in memberRoleOptions" :key="item" :label="item" :value="item" />
              </el-select>
            </div>
          </div>

          <div class="page-table dashboard-table-wrap">
            <el-table border :data="pagedTeamMembers" :height="tableHeight">
              <el-table-column prop="realName" label="姓名" width="110" />
              <el-table-column prop="roles" label="角色" min-width="120" />
              <el-table-column label="状态" width="90">
                <template #default="{ row }">
                  <span class="member-status" :class="{ 'is-online': row.isOnline }">
                    {{ row.isOnline ? '在线' : '离线' }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="最近活跃" width="120">
                <template #default="{ row }">{{ formatLoginTime(row.lastLoginAt) }}</template>
              </el-table-column>
            </el-table>
          </div>

          <div class="page-pagination">
            <el-pagination
              background
              layout="total, prev, pager, next"
              :current-page="memberPage"
              :page-size="memberPageSize"
              :total="filteredTeamMembers.length"
              @current-change="handleMemberPageChange"
            />
          </div>
        </div>
      </PageCard>
    </div>

    <PageCard show-title title="本组进度透视" eyebrow="效率、负荷与协同状态">
      <div class="director-progress-grid">
        <div class="director-progress-card">
          <div class="director-progress-card__head">
            <strong>审核完成度</strong>
            <span>{{ reviewRate }}%</span>
          </div>
          <el-progress :percentage="reviewRate" :stroke-width="12" color="#409eff" />
          <small>已审核 {{ reviewedCount }} 份，剩余 {{ stats.pendingCount }} 份待处理。</small>
        </div>

        <div class="director-progress-card">
          <div class="director-progress-card__head">
            <strong>通过质量</strong>
            <span>{{ approvalRate }}%</span>
          </div>
          <el-progress :percentage="approvalRate" :stroke-width="12" color="#34d399" />
          <small>本组通过 {{ stats.approvedCount }} 份，驳回 {{ stats.rejectedCount }} 份。</small>
        </div>

        <div class="director-progress-card">
          <div class="director-progress-card__head">
            <strong>在线协同</strong>
            <span>{{ onlineRate }}%</span>
          </div>
          <el-progress :percentage="onlineRate" :stroke-width="12" color="#8b5cf6" />
          <small>{{ stats.onlineCount }} 位成员在线，可及时跟进审核与修改。</small>
        </div>
      </div>
    </PageCard>
  </div>
</template>

<style scoped>
.director-dashboard {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.director-hero {
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  padding: 24px;
  border-radius: var(--radius-sm);
  background:
    linear-gradient(135deg, rgba(64, 158, 255, 0.14), rgba(15, 23, 42, 0.02)),
    rgba(255, 255, 255, 0.56);
  border: 1px solid rgba(255, 255, 255, 0.74);
  box-shadow: var(--shadow);
  backdrop-filter: var(--blur);
}

.director-hero__lead {
  min-width: 0;
}

.director-hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(64, 158, 255, 0.1);
  color: #1d4ed8;
  font-size: 12px;
  letter-spacing: 0.06em;
}

.director-hero__lead h2 {
  margin: 14px 0 10px;
  font-size: 28px;
  line-height: 1.1;
}

.director-hero__lead p {
  margin: 0;
  max-width: 54ch;
  color: #606266;
  line-height: 1.7;
}

.director-hero__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.director-hero__chips span {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #475569;
  font-size: 13px;
}

.director-hero__focus {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 18px;
}

.director-hero-focus-card {
  padding: 16px 16px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.56);
  border: 1px solid rgba(255, 255, 255, 0.72);
}

.director-hero-focus-card span,
.director-hero-focus-card small {
  display: block;
}

.director-hero-focus-card span {
  color: #64748b;
  font-size: 12px;
}

.director-hero-focus-card strong {
  display: block;
  margin: 8px 0 4px;
  font-size: 24px;
  line-height: 1;
}

.director-hero-focus-card small {
  color: #94a3b8;
  font-size: 12px;
}

.director-hero-focus-card--warning strong { color: #d97706; }
.director-hero-focus-card--primary strong { color: #2563eb; }
.director-hero-focus-card--success strong { color: #059669; }

.director-hero__rail {
  margin-top: 16px;
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.48);
  border: 1px solid rgba(255, 255, 255, 0.72);
}

.director-hero__rail-head,
.director-hero__rail-legend {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.director-hero__rail-head span,
.director-hero__rail-legend span {
  color: #64748b;
  font-size: 13px;
}

.director-hero__rail-head strong {
  font-size: 14px;
}

.director-hero__rail-bar {
  display: flex;
  gap: 6px;
  height: 10px;
  margin: 14px 0 12px;
}

.director-hero__rail-bar span {
  min-width: 0;
  border-radius: 999px;
}

.director-hero__rail-bar .is-pending {
  background: linear-gradient(90deg, #fbbf24, #f59e0b);
}

.director-hero__rail-bar .is-approved {
  background: linear-gradient(90deg, #6ee7b7, #34d399);
}

.director-hero__rail-bar .is-rejected {
  background: linear-gradient(90deg, #fda4af, #fb7185);
}

.director-hero__metrics {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.director-kpi {
  min-width: 0;
  padding: 16px 18px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.78);
}

.director-kpi span,
.director-kpi small {
  display: block;
}

.director-kpi span {
  color: #64748b;
  font-size: 13px;
}

.director-kpi strong {
  display: block;
  margin: 8px 0 6px;
  font-size: 30px;
  line-height: 1;
}

.director-kpi small {
  color: #94a3b8;
  font-size: 12px;
}

.director-kpi--warning strong { color: #d97706; }
.director-kpi--primary strong { color: #2563eb; }
.director-kpi--success strong { color: #059669; }
.director-kpi--info strong { color: #0f766e; }
.director-kpi--purple strong { color: #7c3aed; }
.director-kpi--rose strong { color: #e11d48; }

.director-card-split {
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1fr) 220px;
  align-items: center;
}

.director-chart--status {
  min-height: 300px;
}

.director-side-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.director-side-stat {
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.66);
  border: 1px solid rgba(255, 255, 255, 0.72);
}

.director-side-stat span,
.director-side-stat small {
  display: block;
}

.director-side-stat span {
  color: #64748b;
  font-size: 12px;
}

.director-side-stat strong {
  display: block;
  margin: 8px 0 4px;
  font-size: 24px;
}

.director-side-stat small {
  color: #94a3b8;
  line-height: 1.5;
}

.director-member-summary {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 14px;
}

.director-member-pill {
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.66);
  border: 1px solid rgba(255, 255, 255, 0.74);
}

.director-member-pill span,
.director-member-pill strong {
  display: block;
}

.director-member-pill span {
  color: #64748b;
  font-size: 12px;
}

.director-member-pill strong {
  margin-top: 8px;
  font-size: 24px;
}

.member-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #94a3b8;
}

.member-status::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.member-status.is-online {
  color: #34d399;
}

.director-progress-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.director-progress-card {
  padding: 18px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.68);
  border: 1px solid rgba(255, 255, 255, 0.74);
}

.director-progress-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.director-progress-card__head strong {
  font-size: 16px;
}

.director-progress-card__head span {
  color: #409eff;
  font-weight: 700;
}

.director-progress-card small {
  display: block;
  margin-top: 12px;
  color: #94a3b8;
  line-height: 1.6;
}

@media (max-width: 1200px) {
  .director-hero,
  .director-card-split,
  .director-progress-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .director-hero__metrics,
  .director-member-summary,
  .director-hero__focus {
    grid-template-columns: 1fr;
  }
}
</style>
