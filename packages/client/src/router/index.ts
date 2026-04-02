import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const fallbackMap: Record<string, string> = {
  admin: '/admin/dashboard',
  director: '/director/dashboard',
  academic_dean: '/academic-dean/reviews',
  teacher: '/teacher/courses',
};

const rolePrefixMap: Record<string, string> = {
  admin: '/admin/',
  director: '/director/',
  academic_dean: '/academic-dean/',
  teacher: '/teacher/',
};

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/common/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('@/components/layout/MainLayout.vue'),
    children: [
      { path: '', redirect: '/admin/dashboard' },
      { path: 'admin/dashboard', component: () => import('@/views/admin/AdminDashboardView.vue'), meta: { roles: ['admin'], title: '管理员仪表盘' } },
      { path: 'admin/users', component: () => import('@/views/admin/AdminUsersView.vue'), meta: { roles: ['admin'], title: '用户管理' } },
      { path: 'admin/semesters', component: () => import('@/views/admin/AdminSemestersView.vue'), meta: { roles: ['admin'], title: '学期管理' } },
      { path: 'admin/departments', component: () => import('@/views/admin/AdminDepartmentsView.vue'), meta: { roles: ['admin'], title: '教研室管理' } },
      { path: 'admin/courses', component: () => import('@/views/admin/AdminCoursesView.vue'), meta: { roles: ['admin'], title: '课程管理' } },
      { path: 'admin/papers', component: () => import('@/views/admin/AdminPapersView.vue'), meta: { roles: ['admin'], title: '试卷总览' } },
      { path: 'admin/docx-templates', component: () => import('@/views/common/DocxTemplateView.vue'), meta: { roles: ['admin'], title: '模板文档生成' } },
      { path: 'admin/audit-logs', component: () => import('@/views/admin/AdminAuditLogsView.vue'), meta: { roles: ['admin'], title: '审计日志' } },
      { path: 'admin/settings', component: () => import('@/views/admin/AdminSettingsView.vue'), meta: { roles: ['admin'], title: '系统设置' } },
      { path: 'admin/profile', component: () => import('@/views/admin/AdminProfileView.vue'), meta: { roles: ['admin'], title: '个人中心' } },
      { path: 'teacher/courses', component: () => import('@/views/teacher/TeacherCoursesView.vue'), meta: { roles: ['teacher'], title: '我的课程' } },
      { path: 'teacher/papers', component: () => import('@/views/teacher/TeacherPapersView.vue'), meta: { roles: ['teacher'], title: '试卷提交' } },
      { path: 'teacher/docx-templates', component: () => import('@/views/common/DocxTemplateView.vue'), meta: { roles: ['teacher'], title: '模板文档生成' } },
      { path: 'teacher/profile', component: () => import('@/views/teacher/TeacherProfileView.vue'), meta: { roles: ['teacher'], title: '个人中心' } },
      { path: 'director/dashboard', component: () => import('@/views/director/DirectorDashboardView.vue'), meta: { roles: ['director'], title: '工作台' } },
      { path: 'director/reviews', component: () => import('@/views/director/DirectorReviewsView.vue'), meta: { roles: ['director'], title: '试卷审核' } },
      { path: 'director/data', component: () => import('@/views/director/DirectorDataView.vue'), meta: { roles: ['director'], title: '本组数据' } },
      { path: 'director/docx-templates', component: () => import('@/views/common/DocxTemplateView.vue'), meta: { roles: ['director'], title: '模板文档生成' } },
      { path: 'director/profile', component: () => import('@/views/director/DirectorProfileView.vue'), meta: { roles: ['director'], title: '个人中心' } },
      { path: 'academic-dean/reviews', component: () => import('@/views/director/DirectorReviewsView.vue'), meta: { roles: ['academic_dean'], title: '教学院长审核' } },
      { path: 'academic-dean/data', component: () => import('@/views/admin/AdminPapersView.vue'), meta: { roles: ['academic_dean'], title: '试卷总览' } },
      { path: 'academic-dean/docx-templates', component: () => import('@/views/common/DocxTemplateView.vue'), meta: { roles: ['academic_dean'], title: '模板文档生成' } },
      { path: 'academic-dean/profile', component: () => import('@/views/director/DirectorProfileView.vue'), meta: { roles: ['academic_dean'], title: '个人中心' } },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  if (to.meta.public) {
    return true;
  }

  if (!authStore.bootstrapped && authStore.token) {
    await authStore.bootstrap();
  }

  if (!authStore.isLoggedIn) {
    return '/login';
  }

  if (to.path === '/') {
    const lastRoute = localStorage.getItem('exam-workflow-last-route') ?? '';
    const rolePrefix = rolePrefixMap[authStore.currentRole];
    if (lastRoute && rolePrefix && lastRoute.startsWith(rolePrefix)) {
      return lastRoute;
    }
    return fallbackMap[authStore.currentRole];
  }

  const roles = (to.meta.roles as string[] | undefined) ?? [];
  if (roles.length && !roles.includes(authStore.currentRole)) {
    return fallbackMap[authStore.currentRole];
  }

  return true;
});

router.afterEach((to) => {
  const pageTitle = (to.meta.title as string | undefined) ?? (to.meta.public ? '登录' : '试卷工作流系统');
  document.title = `${pageTitle} - 试卷工作流系统`;

  if (!to.meta.public) {
    localStorage.setItem('exam-workflow-last-route', to.fullPath);
  }
});

export default router;
