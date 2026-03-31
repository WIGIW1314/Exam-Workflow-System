export const ROLE_CODES = ['admin', 'director', 'teacher'] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const PAPER_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type PaperStatus = (typeof PAPER_STATUSES)[number];

export const NOTIFICATION_TYPES = ['system', 'paper', 'approval', 'reminder'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const COURSE_TYPES = ['必修', '选修', '实践', '通识'] as const;
export type CourseType = (typeof COURSE_TYPES)[number];
