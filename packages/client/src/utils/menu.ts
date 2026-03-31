import {
  Calendar,
  Collection,
  Document,
  Files,
  FolderOpened,
  Grid,
  Histogram,
  Setting,
  User,
} from '@element-plus/icons-vue';

export const menuByRole = {
  admin: [
    { path: '/admin/dashboard', label: '仪表盘', icon: Grid },
    { path: '/admin/users', label: '用户管理', icon: User },
    { path: '/admin/semesters', label: '学期管理', icon: Calendar },
    { path: '/admin/departments', label: '教研室管理', icon: Collection },
    { path: '/admin/courses', label: '课程管理', icon: Files },
    { path: '/admin/papers', label: '试卷总览', icon: Document },
    { path: '/admin/audit-logs', label: '审计日志', icon: FolderOpened },
    { path: '/admin/settings', label: '系统设置', icon: Setting },
  ],
  teacher: [
    { path: '/teacher/courses', label: '我的课程', icon: Files },
    { path: '/teacher/papers', label: '试卷提交', icon: Document },
  ],
  director: [
    { path: '/director/dashboard', label: '工作台', icon: Histogram },
    { path: '/director/reviews', label: '试卷审核', icon: Document },
    { path: '/director/data', label: '本组数据', icon: Files },
  ],
} as const;
