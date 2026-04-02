import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  createTemplatePayloadDefaults,
  generateDocxTemplate,
  getDocxTemplateDefinition,
  mergeTemplatePayloadByOwners,
} from './docx-template-service.js';
import { buildPaperDir, ensureDir, getFileHash, getPreviewHtml } from '../utils/storage.js';
import { injectPaperNumber } from '../utils/docx.js';
import { AppError } from '../utils/errors.js';

export const MAIN_REVIEW_SCOPE_SIGNATURE = '__main__';

export function getMainTemplateIdByCourseType(courseType?: string | null) {
  return courseType === '必修' || courseType === '限选' ? 'rationality-review' : 'paper-review';
}

export function normalizeClassScopeSignature(classIds: string[]) {
  return [...new Set(classIds)].sort().join(',');
}

export function parseTemplateFormData(value: unknown) {
  if (!value) {
    return {};
  }
  if (typeof value === 'string') {
    return JSON.parse(value) as Record<string, unknown>;
  }
  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
}

function currentDateValue() {
  return new Date().toISOString().slice(0, 10);
}

export async function resolveDefaultSignatureName(realName?: string | null) {
  if (!realName) {
    return '';
  }
  const template = getDocxTemplateDefinition('rationality-review');
  if (!template) {
    return realName;
  }
  return realName;
}

export function withActorDefaults(payload: Record<string, unknown>, roleCode: string, realName?: string | null) {
  const nextPayload = { ...payload };
  const signerName = realName?.trim();
  const dateValue = currentDateValue();

  if (roleCode === 'teacher') {
    if (nextPayload.teacherSigner == null || String(nextPayload.teacherSigner).trim() === '') {
      nextPayload.teacherSigner = signerName ?? '';
    }
    if (nextPayload.teacherDate == null || String(nextPayload.teacherDate).trim() === '') {
      nextPayload.teacherDate = dateValue;
    }
  }

  if (roleCode === 'director') {
    if (nextPayload.directorSigner == null || String(nextPayload.directorSigner).trim() === '') {
      nextPayload.directorSigner = signerName ?? '';
    }
    if (nextPayload.directorDate == null || String(nextPayload.directorDate).trim() === '') {
      nextPayload.directorDate = dateValue;
    }
  }

  if (roleCode === 'academic_dean') {
    if (nextPayload.deanSigner == null || String(nextPayload.deanSigner).trim() === '') {
      nextPayload.deanSigner = signerName ?? '';
    }
    if (nextPayload.deanDate == null || String(nextPayload.deanDate).trim() === '') {
      nextPayload.deanDate = dateValue;
    }
    if (nextPayload.collegeSigner == null || String(nextPayload.collegeSigner).trim() === '') {
      nextPayload.collegeSigner = signerName ?? '';
    }
    if (nextPayload.collegeDate == null || String(nextPayload.collegeDate).trim() === '') {
      nextPayload.collegeDate = dateValue;
    }
  }

  return nextPayload;
}

export function buildMainReviewSystemPayload(paper: Prisma.ExamPaperGetPayload<{
  include: {
    course: { include: { classes: true } };
    semester: true;
    teacher: true;
    department: true;
    classGroups: { include: { courseClass: true } };
  };
}>) {
  const classNames = paper.classGroups.map((item) => item.courseClass.className).join('、');
  const majorClass = classNames || paper.course.classes.map((item) => item.className).join('、');
  return {
    departmentName: paper.department.name,
    courseName: paper.course.courseName,
    semesterName: paper.semester.name,
    majorGrade: majorClass,
    creditHours: paper.course.creditHours == null ? '' : String(paper.course.creditHours),
    teacherName: paper.teacher.realName,
    paperTeacherName: paper.teacher.realName,
    collegeName: paper.department.name,
    semesterLabel: paper.semester.name,
    classNames: majorClass,
  };
}

export function buildAnalysisSystemPayload(
  paper: Prisma.ExamPaperGetPayload<{
    include: {
      course: true;
      semester: true;
      teacher: true;
      department: true;
    };
  }>,
  classNames: string[],
) {
  return {
    collegeName: paper.department.name,
    semesterLabel: paper.semester.name,
    courseName: paper.course.courseName,
    courseCode: paper.course.courseCode,
    majorClass: classNames.join('、'),
    teacherName: paper.teacher.realName,
  };
}

export async function buildInitialMainReviewPayload(
  paper: Prisma.ExamPaperGetPayload<{
    include: {
      course: { include: { classes: true } };
      semester: true;
      teacher: true;
      department: true;
      classGroups: { include: { courseClass: true } };
    };
  }>,
) {
  const templateId = getMainTemplateIdByCourseType(paper.course.courseType);
  const defaults = createTemplatePayloadDefaults(templateId);
  const systemPayload = buildMainReviewSystemPayload(paper);
  return mergeTemplatePayloadByOwners(templateId, defaults, systemPayload, ['system']);
}

export async function buildInitialAnalysisReviewPayload(
  paper: Prisma.ExamPaperGetPayload<{
    include: {
      course: true;
      semester: true;
      teacher: true;
      department: true;
    };
  }>,
  classNames: string[],
) {
  const defaults = createTemplatePayloadDefaults('exam-analysis');
  const systemPayload = buildAnalysisSystemPayload(paper, classNames);
  return mergeTemplatePayloadByOwners('exam-analysis', defaults, systemPayload, ['system']);
}

export async function persistUploadedPaperFile(options: {
  buffer: Buffer;
  originalName: string;
  semesterCode: string;
  departmentCode: string;
  teacherId: string;
}) {
  const storageDir = buildPaperDir(options.semesterCode, options.departmentCode, options.teacherId);
  await ensureDir(storageDir);
  const storedName = `${randomUUID()}.docx`;
  const originalFilePath = path.join(storageDir, storedName);
  await fs.writeFile(originalFilePath, options.buffer);
  const fileHash = await getFileHash(originalFilePath);
  const previewHtml = await getPreviewHtml(originalFilePath);

  return {
    originalFilePath,
    originalFileName: options.originalName,
    fileHash,
    previewHtml,
  };
}

export async function buildTemplatePreviewBuffer(templateId: string, formData: Record<string, unknown>) {
  const result = await generateDocxTemplate(templateId, formData);
  return result.buffer;
}

export async function generateApprovedTemplateFile(options: {
  targetPath: string;
  templateId: string;
  formData: Record<string, unknown>;
}) {
  const result = await generateDocxTemplate(options.templateId, options.formData);
  await ensureDir(path.dirname(options.targetPath));
  await fs.writeFile(options.targetPath, result.buffer);
  return options.targetPath;
}

export async function finalizeMainApproval(options: {
  paper: Prisma.ExamPaperGetPayload<{
    include: {
      course: true;
      semester: true;
      teacher: true;
      department: true;
    };
  }>;
  templateId: string;
  formData: Record<string, unknown>;
  paperNumber: string;
}) {
  const approvedFilePath = options.paper.originalFilePath.replace('.docx', `.approved.${options.paperNumber}.docx`);
  await injectPaperNumber(options.paper.originalFilePath, approvedFilePath, options.paperNumber);
  const mainReviewFilePath = options.paper.originalFilePath.replace('.docx', `.main-review.${options.paperNumber}.docx`);
  await generateApprovedTemplateFile({
    targetPath: mainReviewFilePath,
    templateId: options.templateId,
    formData: options.formData,
  });

  return {
    approvedPaperPath: approvedFilePath,
    approvedTemplatePath: mainReviewFilePath,
  };
}

export async function finalizeAnalysisApproval(options: {
  paperOriginalFilePath: string;
  reviewId: string;
  formData: Record<string, unknown>;
}) {
  const approvedFilePath = options.paperOriginalFilePath.replace('.docx', `.analysis-review.${options.reviewId}.docx`);
  await generateApprovedTemplateFile({
    targetPath: approvedFilePath,
    templateId: 'exam-analysis',
    formData: options.formData,
  });
  return approvedFilePath;
}

export async function findExistingAnalysisReview(paperId: string, scopeSignature: string) {
  return prisma.paperTemplateReview.findUnique({
    where: {
      paperId_workflowType_scopeSignature: {
        paperId,
        workflowType: 'analysis_review',
        scopeSignature,
      },
    },
    include: {
      classGroups: { include: { courseClass: true } },
      directorReviewer: true,
      deanReviewer: true,
    },
  });
}
