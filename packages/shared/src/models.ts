import type {
  NotificationType,
  PaperReviewStage,
  PaperStatus,
  PaperTemplateId,
  PaperTemplateReviewStatus,
  PaperWorkflowType,
  RoleCode,
  TemplateFieldOwner,
} from './enums.js';

export interface RoleSummary {
  id: string;
  code: RoleCode;
  name: string;
}

export interface UserSummary {
  id: string;
  username: string;
  realName: string;
  email?: string | null;
  phone?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  status: boolean;
  avatar?: string | null;
  roles: RoleSummary[];
  lastLoginAt?: string | null;
}

export interface SemesterSummary {
  id: string;
  name: string;
  code: string;
  isCurrent: boolean;
  status: boolean;
}

export interface DepartmentSummary {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  directorId?: string | null;
  directorName?: string | null;
  memberCount?: number;
  status: boolean;
}

export interface CourseClassSummary {
  id: string;
  className: string;
}

export interface CourseSummary {
  id: string;
  semesterId: string;
  semesterName: string;
  courseCode: string;
  courseName: string;
  teacherId: string;
  teacherName: string;
  departmentId: string;
  departmentName: string;
  creditHours?: number | null;
  courseType?: string | null;
  classes: CourseClassSummary[];
}

export interface NumberRuleSummary {
  id: string;
  semesterId: string;
  semesterName: string;
  prefix: string;
  separator: string;
  dateFormat: string;
  seqLength: number;
  currentSeq: number;
  example: string;
  description?: string | null;
}

export interface ExamPaperSummary {
  id: string;
  courseId: string;
  courseName: string;
  courseCode: string;
  semesterId: string;
  semesterName: string;
  teacherId: string;
  teacherName: string;
  departmentId: string;
  departmentName: string;
  courseType?: string | null;
  classGroups: CourseClassSummary[];
  version: number;
  originalFileName: string;
  approvedFilePath?: string | null;
  paperNumber?: string | null;
  status: PaperStatus;
  rejectReason?: string | null;
  rejectionStage?: PaperReviewStage | null;
  reviewerId?: string | null;
  reviewerName?: string | null;
  reviewedAt?: string | null;
  submittedAt: string;
  previewHtml?: string | null;
  fileHash?: string | null;
  mainReviewTemplateId?: PaperTemplateId | null;
  mainReviewStatus?: PaperTemplateReviewStatus | null;
  mainReviewDocumentAvailable?: boolean;
  canStartAnalysisReview?: boolean;
  analysisReviewCount?: number;
  analysisReviews?: PaperTemplateReviewSummary[];
}

export interface PaperAnalysisScopeSummary {
  id: string;
  className: string;
}

export interface PaperTemplateReviewSummary {
  id: string;
  paperId: string;
  workflowType: PaperWorkflowType;
  templateId: PaperTemplateId;
  status: PaperTemplateReviewStatus;
  rejectReason?: string | null;
  rejectionStage?: PaperReviewStage | null;
  approvedFilePath?: string | null;
  teacherSubmittedAt?: string | null;
  directorReviewedAt?: string | null;
  deanReviewedAt?: string | null;
  directorReviewerId?: string | null;
  directorReviewerName?: string | null;
  deanReviewerId?: string | null;
  deanReviewerName?: string | null;
  scopeSignature?: string | null;
  scopes: PaperAnalysisScopeSummary[];
}

export interface TemplateFieldOption {
  label: string;
  value: string;
}

export interface TemplateFieldDefinition {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'radio' | 'checkboxGroup' | 'signature' | 'repeater';
  owner?: TemplateFieldOwner;
  autoFill?: boolean;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  minRows?: number;
  maxRows?: number;
  addLabel?: string;
  options?: TemplateFieldOption[];
  fields?: TemplateFieldDefinition[];
}

export interface TemplateSectionDefinition {
  id: string;
  title: string;
  description?: string;
  fields: TemplateFieldDefinition[];
}

export interface DocxTemplateDefinition {
  id: PaperTemplateId;
  name: string;
  fileName: string;
  description: string;
  sections: TemplateSectionDefinition[];
}

export interface AuditLogSummary {
  id: string;
  userId?: string | null;
  userName: string;
  action: string;
  module: string;
  target?: string | null;
  detail: string;
  ipAddress?: string | null;
  statusCode?: number | null;
  createdAt: string;
}

export interface NotificationSummary {
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface DashboardStats {
  onlineCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalUsers: number;
  totalTeachers: number;
  totalDirectors: number;
  totalAcademicDeans: number;
  totalDepartments: number;
  totalCourses: number;
  totalPapers: number;
  currentSemesterName?: string | null;
  recentLoginUsers: Array<{
    userId?: string | null;
    userName: string;
    departmentName?: string | null;
    loginAt: string;
    ipAddress?: string | null;
  }>;
  loginHourlyDistribution: Array<{
    hour: string;
    value: number;
  }>;
  loginTrend: Array<{
    date: string;
    value: number;
  }>;
  paperSubmissionTrend: Array<{
    date: string;
    value: number;
  }>;
  reviewTrend: Array<{
    date: string;
    approved: number;
    rejected: number;
  }>;
  courseTypeDistribution: Array<{
    name: string;
    value: number;
  }>;
  teacherPaperRanking: Array<{
    teacherId: string;
    teacherName: string;
    departmentName?: string | null;
    submitted: number;
    approved: number;
    rejected: number;
    pending: number;
  }>;
  departmentProgress: Array<{
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
  }>;
  paperStatusDistribution: Array<{
    status: PaperStatus;
    value: number;
  }>;
}

export interface AuthProfile {
  user: UserSummary;
  token: string;
  sessionId: string;
  currentRole: RoleCode;
  availableRoles: RoleCode[];
}
