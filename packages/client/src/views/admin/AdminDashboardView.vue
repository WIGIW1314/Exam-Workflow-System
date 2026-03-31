<script setup lang="ts">
import * as echarts from 'echarts';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import PageCard from '@/components/common/PageCard.vue';
import { apiGet } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/datetime';

const authStore = useAuthStore();
const stats = ref<any>(null);
const online = ref<any>(null);
const tableHeight = 320;

const loginQuery = ref('');
const loginDepartmentFilter = ref('');
const loginPage = ref(1);
const loginPageSize = 5;

const onlineQuery = ref('');
const onlineRoleFilter = ref('');
const onlineDepartmentFilter = ref('');
const onlinePage = ref(1);
const onlinePageSize = 6;

const departmentQuery = ref('');
const departmentProgressFilter = ref('');
const departmentPage = ref(1);
const departmentPageSize = 5;

const statusChartRef = ref<HTMLDivElement | null>(null);
const departmentChartRef = ref<HTMLDivElement | null>(null);
const loginHourChartRef = ref<HTMLDivElement | null>(null);
const loginTrendChartRef = ref<HTMLDivElement | null>(null);
const reviewTrendChartRef = ref<HTMLDivElement | null>(null);
const courseTypeChartRef = ref<HTMLDivElement | null>(null);
const teacherRankingChartRef = ref<HTMLDivElement | null>(null);

const chartMap = new Map<string, echarts.ECharts>();
let resizeObserver: ResizeObserver | null = null;

const statusLabelMap: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
};

const roleLabelMap: Record<string, string> = {
  admin: '管理员',
  director: '教研室主任',
  teacher: '任课教师',
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function resetPage(pageRef: typeof loginPage) {
  pageRef.value = 1;
}

function clampPage(pageRef: typeof loginPage, total: number, pageSize: number) {
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  if (pageRef.value > maxPage) {
    pageRef.value = maxPage;
  }
}

function handleLoginPageChange(value: number) {
  loginPage.value = value;
}

function handleOnlinePageChange(value: number) {
  onlinePage.value = value;
}

function handleDepartmentPageChange(value: number) {
  departmentPage.value = value;
}

const recentLoginUsers = computed(() => stats.value?.recentLoginUsers ?? []);
const onlineUsers = computed(() => online.value?.onlineUsers ?? []);
const departmentRows = computed(() => stats.value?.departmentProgress ?? []);

const loginDepartmentOptions = computed(() => uniqueStrings(recentLoginUsers.value.map((item: any) => item.departmentName)));
const onlineDepartmentOptions = computed(() => uniqueStrings(onlineUsers.value.map((item: any) => item.departmentName)));
const onlineRoleOptions = computed(() => uniqueStrings(onlineUsers.value.map((item: any) => item.roleCode)));

const filteredRecentLoginUsers = computed(() => {
  const keyword = loginQuery.value.trim().toLowerCase();
  return recentLoginUsers.value.filter((item: any) => {
    const matchKeyword =
      !keyword ||
      [item.userName, item.departmentName, item.ipAddress]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    const matchDepartment = !loginDepartmentFilter.value || item.departmentName === loginDepartmentFilter.value;
    return matchKeyword && matchDepartment;
  });
});

const pagedRecentLoginUsers = computed(() => {
  const start = (loginPage.value - 1) * loginPageSize;
  return filteredRecentLoginUsers.value.slice(start, start + loginPageSize);
});

const filteredOnlineUsers = computed(() => {
  const keyword = onlineQuery.value.trim().toLowerCase();
  return onlineUsers.value.filter((item: any) => {
    const matchKeyword =
      !keyword ||
      [item.realName, item.departmentName, roleLabelMap[item.roleCode] ?? item.roleCode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    const matchRole = !onlineRoleFilter.value || item.roleCode === onlineRoleFilter.value;
    const matchDepartment = !onlineDepartmentFilter.value || item.departmentName === onlineDepartmentFilter.value;
    return matchKeyword && matchRole && matchDepartment;
  });
});

const pagedOnlineUsers = computed(() => {
  const start = (onlinePage.value - 1) * onlinePageSize;
  return filteredOnlineUsers.value.slice(start, start + onlinePageSize);
});

const filteredDepartmentRows = computed(() => {
  const keyword = departmentQuery.value.trim().toLowerCase();
  return departmentRows.value.filter((item: any) => {
    const matchKeyword = !keyword || item.departmentName.toLowerCase().includes(keyword);
    const matchProgress =
      !departmentProgressFilter.value ||
      (departmentProgressFilter.value === 'attention' && item.pending > 0) ||
      (departmentProgressFilter.value === 'complete' && item.pending === 0 && item.total > 0);
    return matchKeyword && matchProgress;
  });
});

const pagedDepartmentRows = computed(() => {
  const start = (departmentPage.value - 1) * departmentPageSize;
  return filteredDepartmentRows.value.slice(start, start + departmentPageSize);
});

function formatAxisLabel(value: string, maxLength = 6) {
  if (!value) {
    return '';
  }
  if (value.length <= maxLength) {
    return value;
  }
  const rows: string[] = [];
  for (let index = 0; index < value.length; index += maxLength) {
    rows.push(value.slice(index, index + maxLength));
  }
  return rows.slice(0, 2).join('\n');
}

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

function renderCharts() {
  if (!stats.value) {
    return;
  }

  ensureChart('status', statusChartRef.value)?.setOption({
    tooltip: { trigger: 'item', formatter: '{b}：{c} 份（{d}%）' },
    legend: { bottom: 0, icon: 'circle', textStyle: { color: '#606266' } },
    series: [
      {
        type: 'pie',
        radius: ['45%', '72%'],
        center: ['50%', '46%'],
        label: { color: '#303133' },
        color: ['#e6a23c', '#67c23a', '#f56c6c'],
        data: stats.value.paperStatusDistribution.map((item: any) => ({
          name: statusLabelMap[item.status] ?? item.status,
          value: item.value,
        })),
      },
    ],
  });

  ensureChart('department', departmentChartRef.value)?.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, icon: 'roundRect' },
    grid: { left: 54, right: 20, top: 54, bottom: 58, containLabel: true },
    xAxis: {
      type: 'category',
      data: stats.value.departmentProgress.map((item: any) => item.departmentName),
      axisLabel: {
        interval: 0,
        margin: 16,
        hideOverlap: true,
        formatter: (value: string) => formatAxisLabel(value),
      },
    },
    yAxis: {
      type: 'value',
      name: '份数',
      nameLocation: 'middle',
      nameGap: 44,
      nameTextStyle: { color: '#909399' },
      minInterval: 1,
    },
    series: [
      { name: '待审核', type: 'bar', stack: 'papers', data: stats.value.departmentProgress.map((item: any) => item.pending), color: '#e6a23c' },
      { name: '已通过', type: 'bar', stack: 'papers', data: stats.value.departmentProgress.map((item: any) => item.approved), color: '#67c23a' },
      { name: '已驳回', type: 'bar', stack: 'papers', data: stats.value.departmentProgress.map((item: any) => item.rejected), color: '#f56c6c' },
    ],
  });

  ensureChart('login-hour', loginHourChartRef.value)?.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 56, right: 16, top: 24, bottom: 36, containLabel: true },
    xAxis: {
      type: 'category',
      data: stats.value.loginHourlyDistribution.map((item: any) => item.hour),
      axisLabel: { interval: 3 },
    },
    yAxis: {
      type: 'value',
      name: '登录次数',
      nameLocation: 'middle',
      nameGap: 48,
      nameTextStyle: { color: '#909399' },
      minInterval: 1,
    },
    series: [
      {
        type: 'bar',
        data: stats.value.loginHourlyDistribution.map((item: any) => item.value),
        color: '#409eff',
        barMaxWidth: 18,
      },
    ],
  });

  ensureChart('login-trend', loginTrendChartRef.value)?.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 56, right: 16, top: 24, bottom: 36, containLabel: true },
    xAxis: { type: 'category', data: stats.value.loginTrend.map((item: any) => item.date) },
    yAxis: {
      type: 'value',
      name: '登录次数',
      nameLocation: 'middle',
      nameGap: 48,
      nameTextStyle: { color: '#909399' },
      minInterval: 1,
    },
    series: [
      {
        name: '登录次数',
        type: 'line',
        smooth: true,
        symbolSize: 8,
        areaStyle: { color: 'rgba(64, 158, 255, 0.16)' },
        lineStyle: { color: '#409eff', width: 3 },
        itemStyle: { color: '#409eff' },
        data: stats.value.loginTrend.map((item: any) => item.value),
      },
    ],
  });

  ensureChart('review-trend', reviewTrendChartRef.value)?.setOption({
    tooltip: { trigger: 'axis' },
    legend: { top: 0, icon: 'roundRect' },
    grid: { left: 54, right: 16, top: 54, bottom: 44, containLabel: true },
    xAxis: { type: 'category', data: stats.value.paperSubmissionTrend.map((item: any) => item.date) },
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
        data: stats.value.paperSubmissionTrend.map((item: any) => item.value),
        color: '#79bbff',
        barMaxWidth: 18,
      },
      {
        name: '通过',
        type: 'line',
        smooth: true,
        data: stats.value.reviewTrend.map((item: any) => item.approved),
        color: '#67c23a',
      },
      {
        name: '驳回',
        type: 'line',
        smooth: true,
        data: stats.value.reviewTrend.map((item: any) => item.rejected),
        color: '#f56c6c',
      },
    ],
  });

  ensureChart('course-type', courseTypeChartRef.value)?.setOption({
    tooltip: { trigger: 'item', formatter: '{b}：{c} 门（{d}%）' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['38%', '68%'],
        center: ['50%', '44%'],
        roseType: 'radius',
        data: stats.value.courseTypeDistribution,
        color: ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399'],
      },
    ],
  });

  ensureChart('teacher-ranking', teacherRankingChartRef.value)?.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 104, right: 24, top: 20, bottom: 28, containLabel: true },
    xAxis: {
      type: 'value',
      name: '提交份数',
      nameGap: 20,
      nameTextStyle: { color: '#909399' },
      minInterval: 1,
    },
    yAxis: {
      type: 'category',
      data: stats.value.teacherPaperRanking.map((item: any) => item.teacherName),
      inverse: true,
      axisLabel: {
        formatter: (value: string) => formatAxisLabel(value, 4),
      },
    },
    series: [
      {
        type: 'bar',
        data: stats.value.teacherPaperRanking.map((item: any) => item.submitted),
        color: '#409eff',
        barMaxWidth: 16,
      },
    ],
  });

  resizeCharts();
}

async function loadData() {
  const [statsData, onlineData] = await Promise.all([
    apiGet('/stats/admin'),
    apiGet('/online/users'),
  ]);
  stats.value = statsData;
  online.value = onlineData;
  await nextTick();
  renderCharts();
}

onMounted(async () => {
  await loadData();
  const chartRefs = [
    statusChartRef,
    departmentChartRef,
    loginHourChartRef,
    loginTrendChartRef,
    reviewTrendChartRef,
    courseTypeChartRef,
    teacherRankingChartRef,
  ];
  resizeObserver = new ResizeObserver(() => resizeCharts());
  chartRefs.forEach((chartRef) => {
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

watch([loginQuery, loginDepartmentFilter], () => resetPage(loginPage));
watch([onlineQuery, onlineRoleFilter, onlineDepartmentFilter], () => resetPage(onlinePage));
watch([departmentQuery, departmentProgressFilter], () => resetPage(departmentPage));

watch(() => filteredRecentLoginUsers.value.length, (total) => clampPage(loginPage, total, loginPageSize));
watch(() => filteredOnlineUsers.value.length, (total) => clampPage(onlinePage, total, onlinePageSize));
watch(() => filteredDepartmentRows.value.length, (total) => clampPage(departmentPage, total, departmentPageSize));

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener('resize', resizeCharts);
  chartMap.forEach((chart) => chart.dispose());
  chartMap.clear();
});
</script>

<template>
  <div class="shell-content">
    <div class="metric-grid" v-if="stats">
      <div class="metric-card">
        <span>在线人数</span>
        <strong>{{ stats.onlineCount }}</strong>
        <small>实时在线会话</small>
      </div>
      <div class="metric-card">
        <span>系统用户</span>
        <strong>{{ stats.totalUsers }}</strong>
        <small>教师 {{ stats.totalTeachers }} / 主任 {{ stats.totalDirectors }}</small>
      </div>
      <div class="metric-card">
        <span>教研室</span>
        <strong>{{ stats.totalDepartments }}</strong>
        <small>当前学期：{{ stats.currentSemesterName || '未设置' }}</small>
      </div>
      <div class="metric-card">
        <span>课程总数</span>
        <strong>{{ stats.totalCourses }}</strong>
        <small>累计课程数据</small>
      </div>
      <div class="metric-card">
        <span>试卷总数</span>
        <strong>{{ stats.totalPapers }}</strong>
        <small>累计提交试卷</small>
      </div>
      <div class="metric-card">
        <span>待审核</span>
        <strong>{{ stats.pendingCount }}</strong>
        <small>当前待处理试卷</small>
      </div>
      <div class="metric-card">
        <span>已通过</span>
        <strong>{{ stats.approvedCount }}</strong>
        <small>审核通过数量</small>
      </div>
      <div class="metric-card">
        <span>已驳回</span>
        <strong>{{ stats.rejectedCount }}</strong>
        <small>审核驳回数量</small>
      </div>
    </div>

    <div class="dashboard-grid dashboard-grid--two">
      <PageCard show-title title="试卷状态分布" eyebrow="总体占比">
        <div ref="statusChartRef" class="dashboard-chart dashboard-chart--medium" />
      </PageCard>

      <PageCard show-title title="教研室审核情况" eyebrow="各教研室待审 / 通过 / 驳回">
        <div ref="departmentChartRef" class="dashboard-chart dashboard-chart--medium" />
      </PageCard>
    </div>

    <div class="dashboard-grid dashboard-grid--three">
      <PageCard show-title title="登录时段分布" eyebrow="近 30 天按小时聚合">
        <div ref="loginHourChartRef" class="dashboard-chart dashboard-chart--small" />
      </PageCard>

      <PageCard show-title title="近 7 天登录趋势" eyebrow="每日登录次数">
        <div ref="loginTrendChartRef" class="dashboard-chart dashboard-chart--small" />
      </PageCard>

      <PageCard show-title title="提交与审核趋势" eyebrow="近 7 天提交 / 通过 / 驳回">
        <div ref="reviewTrendChartRef" class="dashboard-chart dashboard-chart--small" />
      </PageCard>
    </div>

    <div class="dashboard-grid dashboard-grid--two">
      <PageCard show-title title="课程类型分布" eyebrow="课程结构">
        <div ref="courseTypeChartRef" class="dashboard-chart dashboard-chart--medium" />
      </PageCard>

      <PageCard show-title title="教师提交排行" eyebrow="提交量前 8">
        <div ref="teacherRankingChartRef" class="dashboard-chart dashboard-chart--medium" />
      </PageCard>
    </div>

    <div class="dashboard-grid dashboard-grid--two">
      <PageCard show-title title="最近登录记录" eyebrow="最近 10 次登录">
        <div class="dashboard-table-panel">
          <div class="page-toolbar dashboard-table-toolbar">
            <el-input v-model="loginQuery" clearable class="page-toolbar__search" placeholder="搜索用户、教研室或 IP" />
            <div class="page-toolbar__actions">
              <el-select v-model="loginDepartmentFilter" clearable placeholder="全部教研室" style="width: 160px">
                <el-option v-for="item in loginDepartmentOptions" :key="item" :label="item" :value="item" />
              </el-select>
            </div>
          </div>

          <div class="page-table dashboard-table-wrap">
            <el-table border :data="pagedRecentLoginUsers" :height="tableHeight">
              <el-table-column prop="userName" label="用户" width="120" />
              <el-table-column prop="departmentName" label="教研室" width="140" />
              <el-table-column label="登录时间" width="180">
                <template #default="{ row }">{{ formatDateTime(row.loginAt) }}</template>
              </el-table-column>
              <el-table-column prop="ipAddress" label="IP" />
            </el-table>
          </div>

          <div class="page-pagination">
            <el-pagination
              background
              layout="total, prev, pager, next"
              :current-page="loginPage"
              :page-size="loginPageSize"
              :total="filteredRecentLoginUsers.length"
              @current-change="handleLoginPageChange"
            />
          </div>
        </div>
      </PageCard>

      <PageCard show-title title="在线状态" eyebrow="实时在线成员">
        <div class="dashboard-table-panel">
          <div class="page-toolbar dashboard-table-toolbar">
            <el-input v-model="onlineQuery" clearable class="page-toolbar__search" placeholder="搜索姓名、角色或教研室" />
            <div class="page-toolbar__actions">
              <el-select v-model="onlineRoleFilter" clearable placeholder="全部角色" style="width: 140px">
                <el-option
                  v-for="item in onlineRoleOptions"
                  :key="item"
                  :label="roleLabelMap[item] ?? item"
                  :value="item"
                />
              </el-select>
              <el-select v-model="onlineDepartmentFilter" clearable placeholder="全部教研室" style="width: 160px">
                <el-option v-for="item in onlineDepartmentOptions" :key="item" :label="item" :value="item" />
              </el-select>
            </div>
          </div>

          <div class="page-table dashboard-table-wrap">
            <el-table border :data="pagedOnlineUsers" :height="tableHeight">
              <el-table-column prop="realName" label="姓名" width="120" />
              <el-table-column label="角色" width="140">
                <template #default="{ row }">{{ roleLabelMap[row.roleCode] ?? row.roleCode }}</template>
              </el-table-column>
              <el-table-column prop="departmentName" label="教研室" />
            </el-table>
          </div>

          <div class="page-pagination">
            <el-pagination
              background
              layout="total, prev, pager, next"
              :current-page="onlinePage"
              :page-size="onlinePageSize"
              :total="filteredOnlineUsers.length"
              @current-change="handleOnlinePageChange"
            />
          </div>
        </div>
      </PageCard>
    </div>

    <PageCard show-title title="教研室详细统计" eyebrow="覆盖课程、成员、在线、审核效率">
      <div class="dashboard-table-panel">
        <div class="page-toolbar dashboard-table-toolbar">
          <el-input v-model="departmentQuery" clearable class="page-toolbar__search" placeholder="搜索教研室" />
          <div class="page-toolbar__actions">
            <el-select v-model="departmentProgressFilter" clearable placeholder="全部进度" style="width: 160px">
              <el-option label="需跟进" value="attention" />
              <el-option label="已清空待审" value="complete" />
            </el-select>
          </div>
        </div>

        <div class="page-table dashboard-table-wrap">
          <el-table border :data="pagedDepartmentRows" :height="tableHeight">
            <el-table-column prop="departmentName" label="教研室" min-width="160" />
            <el-table-column prop="teacherCount" label="教师数" width="90" />
            <el-table-column prop="onlineTeachers" label="在线教师" width="100" />
            <el-table-column prop="courseCount" label="课程数" width="90" />
            <el-table-column prop="total" label="试卷数" width="90" />
            <el-table-column prop="pending" label="待审" width="90" />
            <el-table-column prop="approved" label="通过" width="90" />
            <el-table-column prop="rejected" label="驳回" width="90" />
            <el-table-column label="通过率" width="110">
              <template #default="{ row }">{{ row.approvalRate }}%</template>
            </el-table-column>
            <el-table-column label="完成度" width="110">
              <template #default="{ row }">{{ row.reviewedRate }}%</template>
            </el-table-column>
          </el-table>
        </div>

        <div class="page-pagination">
          <el-pagination
            background
            layout="total, prev, pager, next"
            :current-page="departmentPage"
            :page-size="departmentPageSize"
            :total="filteredDepartmentRows.length"
            @current-change="handleDepartmentPageChange"
          />
        </div>
      </div>
    </PageCard>
  </div>
</template>
