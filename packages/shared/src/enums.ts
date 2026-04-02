export const ROLE_CODES = ['admin', 'director', 'academic_dean', 'teacher'] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const PAPER_STATUSES = ['pending', 'pending_dean', 'approved', 'rejected'] as const;
export type PaperStatus = (typeof PAPER_STATUSES)[number];

export const PAPER_REVIEW_STAGES = ['director_review', 'academic_dean_review'] as const;
export type PaperReviewStage = (typeof PAPER_REVIEW_STAGES)[number];

export const PAPER_WORKFLOW_TYPES = ['numbering_review', 'analysis_review'] as const;
export type PaperWorkflowType = (typeof PAPER_WORKFLOW_TYPES)[number];

export const PAPER_TEMPLATE_IDS = ['rationality-review', 'paper-review', 'exam-analysis'] as const;
export type PaperTemplateId = (typeof PAPER_TEMPLATE_IDS)[number];

export const PAPER_TEMPLATE_REVIEW_STATUSES = ['draft_teacher', 'pending', 'pending_dean', 'approved', 'rejected'] as const;
export type PaperTemplateReviewStatus = (typeof PAPER_TEMPLATE_REVIEW_STATUSES)[number];

export const TEMPLATE_FIELD_OWNERS = ['system', 'teacher', 'director', 'academic_dean'] as const;
export type TemplateFieldOwner = (typeof TEMPLATE_FIELD_OWNERS)[number];

export const NOTIFICATION_TYPES = ['system', 'paper', 'approval', 'reminder'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const COURSE_TYPES = ['必修', '限选', '选修', '实践', '通识'] as const;
export type CourseType = (typeof COURSE_TYPES)[number];
