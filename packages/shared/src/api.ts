import type { NotificationType, PaperStatus, RoleCode } from './enums.js';

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
  timestamp: number;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
}

export interface PaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

export interface UserPayload {
  username: string;
  realName: string;
  email?: string | null;
  phone?: string | null;
  departmentId?: string | null;
  status?: boolean;
  roleCodes: RoleCode[];
}

export interface SemesterPayload {
  name: string;
  code: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
  status?: boolean;
}

export interface DepartmentPayload {
  name: string;
  code: string;
  description?: string;
  directorId?: string | null;
  sortOrder?: number;
  status?: boolean;
}

export interface CoursePayload {
  semesterId: string;
  courseCode: string;
  courseName: string;
  teacherId: string;
  departmentId: string;
  creditHours?: number | null;
  courseType?: string | null;
  classNames: string[];
}

export interface NumberRulePayload {
  semesterId: string;
  prefix: string;
  separator: string;
  dateFormat: string;
  seqLength: number;
  description?: string;
}

export interface ClassGroupPayload {
  courseClassIds: string[];
}

export interface ApprovePaperPayload {
  note?: string;
}

export interface RejectPaperPayload {
  rejectReason: string;
}

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  content: string;
  targetUserIds?: string[];
  targetDepartmentId?: string | null;
}

export interface PaperFilterQuery extends PaginationQuery {
  semesterId?: string;
  departmentId?: string;
  courseId?: string;
  paperStatus?: PaperStatus;
}
