import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

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
      { path: 'admin/workflow', component: () => import('@/views/admin/AdminWorkflowView.vue'), meta: { roles: ['admin'], title: '流程设计' } },
      { path: 'admin/papers', component: () => import('@/views/admin/AdminPapersView.vue'), meta: { roles: ['admin'], title: '试卷总览' } },
      { path: 'admin/audit-logs', component: () => import('@/views/admin/AdminAuditLogsView.vue'), meta: { roles: ['admin'], title: '审计日志' } },
      { path: 'admin/settings', component: () => import('@/views/admin/AdminSettingsView.vue'), meta: { roles: ['admin'], title: '系统设置' } },
      { path: 'teacher/courses', component: () => import('@/views/teacher/TeacherCoursesView.vue'), meta: { roles: ['teacher'], title: '我的课程' } },
      { path: 'teacher/papers', component: () => import('@/views/teacher/TeacherPapersView.vue'), meta: { roles: ['teacher'], title: '试卷提交' } },
      { path: 'teacher/profile', component: () => import('@/views/teacher/TeacherProfileView.vue'), meta: { roles: ['teacher'], title: '个人信息' } },
      { path: 'director/dashboard', component: () => import('@/views/director/DirectorDashboardView.vue'), meta: { roles: ['director'], title: '主任工作台' } },
      { path: 'director/reviews', component: () => import('@/views/director/DirectorReviewsView.vue'), meta: { roles: ['director'], title: '试卷审核' } },
      { path: 'director/data', component: () => import('@/views/director/DirectorDataView.vue'), meta: { roles: ['director'], title: '本组数据' } },
      { path: 'director/profile', component: () => import('@/views/director/DirectorProfileView.vue'), meta: { roles: ['director'], title: '个人信息' } },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const authStore = useAuthStore();
  if (to.meta.public) {
    return true;
  }

  if (!authStore.isLoggedIn) {
    return '/login';
  }

  const roles = (to.meta.roles as string[] | undefined) ?? [];
  if (roles.length && !roles.includes(authStore.currentRole)) {
    const fallbackMap: Record<string, string> = {
      admin: '/admin/dashboard',
      director: '/director/dashboard',
      teacher: '/teacher/courses',
    };
    return fallbackMap[authStore.currentRole];
  }

  return true;
});

export default router;
