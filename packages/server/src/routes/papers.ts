import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { uploadDocx, uploadOptionalDocx } from '../middlewares/upload.js';
import { createNotifications } from '../services/notification-service.js';
import { generatePaperNumber } from '../services/paper-number-service.js';
import {
  MAIN_REVIEW_SCOPE_SIGNATURE,
  buildInitialAnalysisReviewPayload,
  buildInitialMainReviewPayload,
  buildTemplatePreviewBuffer,
  finalizeAnalysisApproval,
  finalizeMainApproval,
  findExistingAnalysisReview,
  getMainTemplateIdByCourseType,
  normalizeClassScopeSignature,
  parseTemplateFormData,
  persistUploadedPaperFile,
  withActorDefaults,
} from '../services/paper-template-review-service.js';
import { getIo } from '../socket/context.js';
import { recordAudit } from '../utils/audit.js';
import { AppError, forbidden, notFound } from '../utils/errors.js';
import { mapPaperSummary, paperSummaryInclude } from '../utils/mappers.js';
import { ok } from '../utils/response.js';
import { getFileHash, getPreviewHtml } from '../utils/storage.js';
import {
  createTemplatePayloadDefaults,
  mergeTemplatePayloadByOwners,
} from '../services/docx-template-service.js';

const router = Router();

router.use(requireAuth);

const templateReviewInclude = {
  classGroups: { include: { courseClass: true } },
  directorReviewer: true,
  deanReviewer: true,
} as const;

const workflowPaperInclude = {
  course: { include: { classes: true } },
  semester: true,
  teacher: true,
  department: true,
  reviewer: true,
  classGroups: { include: { courseClass: true } },
  templateReviews: {
    include: templateReviewInclude,
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

const reviewActionSchema = z.object({
  rejectReason: z.string().trim().min(2).optional(),
  formData: z.unknown().optional(),
});

function parseIdList(value: unknown) {
  if (Array.isArray(value)) {
    return z.array(z.string()).parse(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [] as string[];
    }
    try {
      return z.array(z.string()).parse(JSON.parse(trimmed));
    } catch {
      return trimmed
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [] as string[];
}

function parseFormDataInput(value: unknown) {
  try {
    return parseTemplateFormData(value);
  } catch {
    throw new AppError('模板表单数据格式不正确', 400);
  }
}

function getAllowedOwners(roleCode: string) {
  if (roleCode === 'teacher') return ['teacher'];
  if (roleCode === 'director') return ['director'];
  if (roleCode === 'academic_dean') return ['academic_dean'];
  return [];
}

function getStageLabel(roleCode: string) {
  if (roleCode === 'director') return 'director';
  if (roleCode === 'academic_dean') return 'academic_dean';
  return 'teacher';
}

function sendDocxBuffer(res: Parameters<typeof ok>[0], buffer: Buffer, fileName: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.send(buffer);
}

async function listAcademicDeanUserIds() {
  const users = await prisma.user.findMany({
    where: {
      status: true,
      roles: {
        some: {
          role: {
            code: 'academic_dean',
          },
        },
      },
    },
    select: { id: true },
  });
  return users.map((item) => item.id);
}

async function getActorRealName(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { realName: true },
  });
  return user?.realName ?? '';
}

function mapTemplateReviewDetail(review: any) {
  return {
    id: review.id,
    paperId: review.paperId,
    workflowType: review.workflowType,
    templateId: review.templateId,
    status: review.status,
    rejectReason: review.rejectReason,
    rejectionStage: review.rejectionStage,
    approvedFilePath: review.approvedFilePath,
    formData: parseTemplateFormData(review.formData),
    teacherSubmittedAt: review.teacherSubmittedAt?.toISOString() ?? null,
    directorReviewedAt: review.directorReviewedAt?.toISOString() ?? null,
    deanReviewedAt: review.deanReviewedAt?.toISOString() ?? null,
    directorReviewerId: review.directorReviewerId,
    directorReviewerName: review.directorReviewer?.realName ?? null,
    deanReviewerId: review.deanReviewerId,
    deanReviewerName: review.deanReviewer?.realName ?? null,
    scopeSignature: review.scopeSignature,
    scopes: review.classGroups.map((item) => ({
      id: item.courseClass.id,
      className: item.courseClass.className,
    })),
  };
}

async function emitPaperEvent(options: {
  type: 'paper:new-submission' | 'paper:status-changed';
  paperId: string;
  status: string;
  courseName: string;
  teacherName: string;
  teacherId: string;
  departmentId: string;
  message: string;
  workflowType?: string;
  templateId?: string;
  reviewId?: string;
}) {
  try {
    const io = getIo();
    const payload = {
      paperId: options.paperId,
      status: options.status,
      courseName: options.courseName,
      teacherName: options.teacherName,
      message: options.message,
      workflowType: options.workflowType,
      templateId: options.templateId,
      reviewId: options.reviewId,
    };
    io.to(`user:${options.teacherId}`).emit(options.type, payload);
    io.to(`department:${options.departmentId}`).emit(options.type, payload);
    io.to('role:admin').emit(options.type, payload);
    io.to('role:academic_dean').emit(options.type, payload);
  } catch {
    // ignore when socket is not ready
  }
}

async function createMainFlowNotifications(paper: { teacherId: string; departmentId: string; courseName: string; teacherName: string }) {
  const department = await prisma.department.findUnique({
    where: { id: paper.departmentId },
    select: { directorId: true },
  });
  const deanUserIds = await listAcademicDeanUserIds();
  const userIds = [department?.directorId, ...deanUserIds].filter(Boolean) as string[];
  await createNotifications({
    userIds,
    type: 'paper',
    title: '有新的试卷编号审核待处理',
    content: `${paper.teacherName} 提交了 ${paper.courseName} 的试卷与审核模板`,
  });
}

async function createAnalysisNotifications(paper: { teacherName: string; courseName: string; departmentId: string }, classNames: string[]) {
  const department = await prisma.department.findUnique({
    where: { id: paper.departmentId },
    select: { directorId: true },
  });
  const deanUserIds = await listAcademicDeanUserIds();
  const userIds = [department?.directorId, ...deanUserIds].filter(Boolean) as string[];
  await createNotifications({
    userIds,
    type: 'paper',
    title: '有新的试卷分析审核待处理',
    content: `${paper.teacherName} 提交了 ${paper.courseName} 的试卷分析（${classNames.join('、')}）`,
  });
}

async function getPaperSummaryById(id: string) {
  return prisma.examPaper.findUnique({
    where: { id },
    include: paperSummaryInclude,
  });
}

async function getWorkflowPaperForTeacher(id: string, teacherId: string) {
  const paper = await prisma.examPaper.findFirst({
    where: { id, teacherId },
    include: workflowPaperInclude,
  });
  if (!paper) {
    throw notFound('试卷不存在');
  }
  return paper;
}

async function getWorkflowPaperForRole(id: string, user: NonNullable<Express.Request['user']>) {
  const where =
    user.currentRole === 'teacher'
      ? { id, teacherId: user.userId }
      : user.currentRole === 'director'
        ? { id, departmentId: user.departmentId ?? undefined }
        : user.currentRole === 'academic_dean'
          ? { id }
          : user.currentRole === 'admin'
            ? { id }
            : null;
  if (!where) {
    throw forbidden();
  }
  const paper = await prisma.examPaper.findFirst({
    where,
    include: workflowPaperInclude,
  });
  if (!paper) {
    throw notFound('试卷不存在');
  }
  return paper;
}

function getMainReviewOrThrow(paper: Awaited<ReturnType<typeof getWorkflowPaperForRole>>) {
  const review = paper.templateReviews.find((item) => item.workflowType === 'numbering_review');
  if (!review) {
    throw notFound('主模板审核记录不存在');
  }
  return review;
}

function applyOwnerPayload(templateId: string, baseFormData: unknown, incomingFormData: Record<string, unknown>, roleCode: string, realName?: string | null) {
  const merged = mergeTemplatePayloadByOwners(
    templateId,
    parseTemplateFormData(baseFormData),
    incomingFormData,
    getAllowedOwners(roleCode),
  );
  return withActorDefaults(merged, roleCode, realName);
}

function resetReviewerSections(templateId: string, formData: Record<string, unknown>) {
  const defaults = createTemplatePayloadDefaults(templateId);
  const afterDirectorReset = mergeTemplatePayloadByOwners(templateId, formData, defaults, ['director']);
  return mergeTemplatePayloadByOwners(templateId, afterDirectorReset, defaults, ['academic_dean']);
}

async function resolveAnalysisReviewForAccess(paperId: string, reviewId: string, user: NonNullable<Express.Request['user']>) {
  const where =
    user.currentRole === 'teacher'
      ? { id: reviewId, paperId, workflowType: 'analysis_review' as const, paper: { teacherId: user.userId } }
      : user.currentRole === 'director'
        ? { id: reviewId, paperId, workflowType: 'analysis_review' as const, paper: { departmentId: user.departmentId ?? undefined } }
        : { id: reviewId, paperId, workflowType: 'analysis_review' as const };

  const review = await prisma.paperTemplateReview.findFirst({
    where,
    include: {
      ...templateReviewInclude,
      paper: {
        include: workflowPaperInclude,
      },
    },
  });
  if (!review) {
    throw notFound('试卷分析审核记录不存在');
  }
  return review;
}

router.post('/submit', requireRole('teacher'), ...uploadDocx, async (req, res, next) => {
  try {
    const courseId = String(req.body.courseId ?? '');
    const selectedClassIds = parseIdList(req.body.courseClassIds);
    const incomingMainReviewData = parseFormDataInput(req.body.mainReviewData);

    if (!courseId) {
      throw new AppError('课程不能为空', 400);
    }
    if (!req.file) {
      throw new AppError('请上传 DOCX 试卷文件', 400);
    }

    const course = await prisma.course.findFirst({
      where: { id: courseId, teacherId: req.user!.userId },
      include: {
        semester: true,
        department: true,
        classes: true,
      },
    });
    if (!course) {
      throw forbidden('只能提交自己名下课程的试卷');
    }

    const latestPaper = await prisma.examPaper.findFirst({
      where: { courseId },
      orderBy: { version: 'desc' },
    });
    const version = (latestPaper?.version ?? 0) + 1;
    const persisted = await persistUploadedPaperFile({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      semesterCode: course.semester.code,
      departmentCode: course.department.code,
      teacherId: req.user!.userId,
    });

    if (latestPaper?.fileHash && latestPaper.fileHash === persisted.fileHash) {
      throw new AppError('新提交的试卷与上一版本完全一致，请确认后再提交', 400);
    }

    const classIds = selectedClassIds.length ? selectedClassIds : course.classes.map((item) => item.id);
    const createdPaper = await prisma.examPaper.create({
      data: {
        courseId: course.id,
        teacherId: req.user!.userId,
        semesterId: course.semesterId,
        departmentId: course.departmentId,
        version,
        originalFileName: persisted.originalFileName,
        originalFilePath: persisted.originalFilePath,
        fileHash: persisted.fileHash,
        previewHtml: persisted.previewHtml,
        classGroups: {
          create: classIds.map((courseClassId) => ({ courseClassId })),
        },
      },
      include: workflowPaperInclude,
    });

    const templateId = getMainTemplateIdByCourseType(createdPaper.course.courseType);
    const initialPayload = await buildInitialMainReviewPayload(createdPaper);
    const mergedPayload = withActorDefaults(
      mergeTemplatePayloadByOwners(templateId, initialPayload, incomingMainReviewData, ['teacher']),
      'teacher',
      createdPaper.teacher.realName,
    );

    await prisma.paperTemplateReview.create({
      data: {
        paperId: createdPaper.id,
        workflowType: 'numbering_review',
        templateId,
        scopeSignature: MAIN_REVIEW_SCOPE_SIGNATURE,
        status: 'pending',
        formData: JSON.stringify(mergedPayload),
        teacherSubmittedAt: new Date(),
      },
    });

    const summary = await getPaperSummaryById(createdPaper.id);
    if (!summary) {
      throw notFound('试卷不存在');
    }
    const summaryDto = mapPaperSummary(summary);

    await createMainFlowNotifications({
      teacherId: summaryDto.teacherId,
      departmentId: summaryDto.departmentId,
      courseName: summaryDto.courseName,
      teacherName: summaryDto.teacherName,
    });
    await emitPaperEvent({
      type: 'paper:new-submission',
      paperId: summaryDto.id,
      status: summaryDto.status,
      courseName: summaryDto.courseName,
      teacherName: summaryDto.teacherName,
      teacherId: summaryDto.teacherId,
      departmentId: summaryDto.departmentId,
      message: '有新的试卷编号审核待处理',
      workflowType: 'numbering_review',
      templateId,
    });

    await recordAudit(req, version > 1 ? 'paper:resubmit' : 'paper:submit', 'paper', {
      courseName: createdPaper.course.courseName,
      version,
    });
    ok(res, summaryDto, '试卷提交成功');
  } catch (error) {
    next(error);
  }
});

router.get('/my', requireRole('teacher'), async (req, res, next) => {
  try {
    const papers = await prisma.examPaper.findMany({
      where: { teacherId: req.user!.userId },
      include: paperSummaryInclude,
      orderBy: { submittedAt: 'desc' },
    });
    ok(res, papers.map(mapPaperSummary));
  } catch (error) {
    next(error);
  }
});

router.get('/pending', requireRole('director', 'academic_dean'), async (req, res, next) => {
  try {
    const where =
      req.user!.currentRole === 'director'
        ? {
            departmentId: req.user!.departmentId ?? undefined,
            status: 'pending',
          }
        : {
            status: { in: ['pending', 'pending_dean'] },
          };

    const papers = await prisma.examPaper.findMany({
      where,
      include: paperSummaryInclude,
      orderBy: { submittedAt: 'desc' },
    });
    ok(res, papers.map(mapPaperSummary));
  } catch (error) {
    next(error);
  }
});

router.get('/analysis-reviews/pending', requireRole('director', 'academic_dean'), async (req, res, next) => {
  try {
    const reviews = await prisma.paperTemplateReview.findMany({
      where: {
        workflowType: 'analysis_review',
        status: req.user!.currentRole === 'director' ? 'pending' : { in: ['pending', 'pending_dean'] },
        paper: req.user!.currentRole === 'director' ? { departmentId: req.user!.departmentId ?? undefined } : undefined,
      },
      include: {
        ...templateReviewInclude,
        paper: {
          include: paperSummaryInclude,
        },
      },
      orderBy: { teacherSubmittedAt: 'desc' },
    });
    ok(
      res,
      reviews.map((review) => ({
        ...mapTemplateReviewDetail(review),
        paper: mapPaperSummary(review.paper),
      })),
    );
  } catch (error) {
    next(error);
  }
});

router.get('/all', requireRole('admin', 'academic_dean'), async (_req, res, next) => {
  try {
    const papers = await prisma.examPaper.findMany({
      include: paperSummaryInclude,
      orderBy: { submittedAt: 'desc' },
    });
    ok(res, papers.map(mapPaperSummary));
  } catch (error) {
    next(error);
  }
});

router.get('/department/:deptId', requireRole('director', 'admin', 'academic_dean'), async (req, res, next) => {
  try {
    const deptId = String(req.params.deptId);
    if (req.user!.currentRole === 'director' && req.user!.departmentId !== deptId) {
      throw forbidden('只能查看本教研室数据');
    }
    const papers = await prisma.examPaper.findMany({
      where: { departmentId: deptId },
      include: paperSummaryInclude,
      orderBy: { submittedAt: 'desc' },
    });
    ok(res, papers.map(mapPaperSummary));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/main-review', async (req, res, next) => {
  try {
    const paper = await getWorkflowPaperForRole(String(req.params.id), req.user!);
    const review = getMainReviewOrThrow(paper);
    ok(res, {
      paper: mapPaperSummary((await getPaperSummaryById(paper.id))!),
      review: mapTemplateReviewDetail(review),
      canDownload: Boolean(review.approvedFilePath),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/main-review/resubmit', requireRole('teacher'), ...uploadOptionalDocx, async (req, res, next) => {
  try {
    const paper = await getWorkflowPaperForTeacher(String(req.params.id), req.user!.userId);
    const review = getMainReviewOrThrow(paper);
    if (!['rejected', 'draft_teacher', 'pending'].includes(review.status)) {
      throw new AppError('当前状态不允许重新提交主模板审核', 400);
    }

    const incomingTeacherData = parseFormDataInput(req.body.mainReviewData);
    const nextClassIds = parseIdList(req.body.courseClassIds);
    const classIds = nextClassIds.length ? nextClassIds : paper.classGroups.map((item) => item.courseClass.id);
    let currentFilePatch: Record<string, unknown> = {};

    if (req.file) {
      const persisted = await persistUploadedPaperFile({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        semesterCode: paper.semester.code,
        departmentCode: paper.department.code,
        teacherId: paper.teacherId,
      });
      const currentHash = await getFileHash(paper.originalFilePath);
      if (currentHash === persisted.fileHash) {
        throw new AppError('重新提交的试卷与当前文件完全一致，请确认后再提交', 400);
      }
      currentFilePatch = {
        originalFileName: persisted.originalFileName,
        originalFilePath: persisted.originalFilePath,
        fileHash: persisted.fileHash,
        previewHtml: persisted.previewHtml,
        approvedFilePath: null,
        paperNumber: null,
      };
    }

    const freshPaper = req.file
      ? await prisma.examPaper.findFirstOrThrow({
          where: { id: paper.id },
          include: workflowPaperInclude,
        })
      : paper;
    const systemPayload = await buildInitialMainReviewPayload(freshPaper);
    const basePayload = mergeTemplatePayloadByOwners(review.templateId, parseTemplateFormData(review.formData), systemPayload, ['system']);
    const teacherMerged = mergeTemplatePayloadByOwners(review.templateId, basePayload, incomingTeacherData, ['teacher']);
    const cleanedPayload = resetReviewerSections(review.templateId, teacherMerged);
    const nextFormData = withActorDefaults(cleanedPayload, 'teacher', paper.teacher.realName);

    await prisma.$transaction(async (tx) => {
      await tx.paperClassGroup.deleteMany({ where: { paperId: paper.id } });
      await tx.paperClassGroup.createMany({
        data: classIds.map((courseClassId) => ({ paperId: paper.id, courseClassId })),
      });
      await tx.examPaper.update({
        where: { id: paper.id },
        data: {
          ...currentFilePatch,
          status: 'pending',
          rejectReason: null,
          rejectionStage: null,
          reviewerId: null,
          approvalNote: null,
          reviewedAt: null,
          submittedAt: new Date(),
        },
      });
      await tx.paperTemplateReview.update({
        where: { id: review.id },
        data: {
          status: 'pending',
          rejectReason: null,
          rejectionStage: null,
          approvedFilePath: null,
          formData: JSON.stringify(nextFormData),
          teacherSubmittedAt: new Date(),
          directorReviewedAt: null,
          deanReviewedAt: null,
          directorReviewerId: null,
          deanReviewerId: null,
        },
      });
    });

    const summary = await getPaperSummaryById(paper.id);
    if (!summary) {
      throw notFound('试卷不存在');
    }
    const summaryDto = mapPaperSummary(summary);
    await createMainFlowNotifications({
      teacherId: summaryDto.teacherId,
      departmentId: summaryDto.departmentId,
      courseName: summaryDto.courseName,
      teacherName: summaryDto.teacherName,
    });
    await emitPaperEvent({
      type: 'paper:new-submission',
      paperId: summaryDto.id,
      status: summaryDto.status,
      courseName: summaryDto.courseName,
      teacherName: summaryDto.teacherName,
      teacherId: summaryDto.teacherId,
      departmentId: summaryDto.departmentId,
      message: '试卷主流程已重新提交',
      workflowType: 'numbering_review',
      templateId: review.templateId,
    });
    await recordAudit(req, 'paper:resubmit', 'paper', {
      courseName: summaryDto.courseName,
      version: summaryDto.version,
    });
    ok(res, summaryDto, '主模板审核已重新提交');
  } catch (error) {
    next(error);
  }
});

router.get('/:id/main-review/preview-file', async (req, res, next) => {
  try {
    const paper = await getWorkflowPaperForRole(String(req.params.id), req.user!);
    const review = getMainReviewOrThrow(paper);
    if (review.approvedFilePath) {
      res.download(review.approvedFilePath, path.basename(review.approvedFilePath));
      return;
    }
    const buffer = await buildTemplatePreviewBuffer(review.templateId, parseTemplateFormData(review.formData));
    sendDocxBuffer(res, buffer, `${paper.course.courseName}-${review.templateId}.docx`);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/main-review/download', async (req, res, next) => {
  try {
    const paper = await getWorkflowPaperForRole(String(req.params.id), req.user!);
    const review = getMainReviewOrThrow(paper);
    if (!review.approvedFilePath) {
      throw new AppError('主模板尚未审核通过，暂不能下载归档文件', 400);
    }
    res.download(review.approvedFilePath, path.basename(review.approvedFilePath));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/analysis-reviews', async (req, res, next) => {
  try {
    const paper = await getWorkflowPaperForRole(String(req.params.id), req.user!);
    const reviews = paper.templateReviews.filter((item) => item.workflowType === 'analysis_review');
    ok(res, reviews.map((item) => mapTemplateReviewDetail(item)));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/analysis-reviews', requireRole('teacher'), async (req, res, next) => {
  try {
    const paper = await getWorkflowPaperForTeacher(String(req.params.id), req.user!.userId);
    if (paper.status !== 'approved') {
      throw new AppError('试卷主流程通过后才能发起试卷分析审核', 400);
    }
    const classIds = parseIdList(req.body.courseClassIds);
    if (!classIds.length) {
      throw new AppError('请至少选择一个班级', 400);
    }
    const scopeSignature = normalizeClassScopeSignature(classIds);
    const existing = await findExistingAnalysisReview(paper.id, scopeSignature);
    if (existing) {
      if (existing.status === 'approved') {
        throw new AppError('该班级组合的试卷分析已审核通过，不能重复发起', 400);
      }
      if (['pending', 'pending_dean'].includes(existing.status)) {
        throw new AppError('该班级组合已存在待审核的试卷分析，请勿重复提交', 400);
      }
      ok(res, mapTemplateReviewDetail(existing), '已存在该班级组合的分析申请，请在原记录上继续编辑');
      return;
    }

    const scopedClasses = paper.classGroups
      .map((item) => item.courseClass)
      .filter((item) => classIds.includes(item.id));
    const classNames = scopedClasses.map((item) => item.className);
    const initialPayload = await buildInitialAnalysisReviewPayload(paper, classNames);
    const incomingTeacherData = parseFormDataInput(req.body.formData);
    const formData = withActorDefaults(
      mergeTemplatePayloadByOwners('exam-analysis', initialPayload, incomingTeacherData, ['teacher']),
      'teacher',
      paper.teacher.realName,
    );

    const review = await prisma.paperTemplateReview.create({
      data: {
        paperId: paper.id,
        workflowType: 'analysis_review',
        templateId: 'exam-analysis',
        scopeSignature,
        status: 'pending',
        formData: JSON.stringify(formData),
        teacherSubmittedAt: new Date(),
        classGroups: {
          create: classIds.map((courseClassId) => ({ courseClassId })),
        },
      },
      include: templateReviewInclude,
    });

    await createAnalysisNotifications(
      { teacherName: paper.teacher.realName, courseName: paper.course.courseName, departmentId: paper.departmentId },
      classNames,
    );
    await emitPaperEvent({
      type: 'paper:new-submission',
      paperId: paper.id,
      status: review.status,
      courseName: paper.course.courseName,
      teacherName: paper.teacher.realName,
      teacherId: paper.teacherId,
      departmentId: paper.departmentId,
      message: '有新的试卷分析审核待处理',
      workflowType: 'analysis_review',
      templateId: 'exam-analysis',
      reviewId: review.id,
    });
    ok(res, mapTemplateReviewDetail(review), '试卷分析审核已发起');
  } catch (error) {
    next(error);
  }
});

router.get('/:id/analysis-reviews/:reviewId', async (req, res, next) => {
  try {
    const review = await resolveAnalysisReviewForAccess(String(req.params.id), String(req.params.reviewId), req.user!);
    const summary = await getPaperSummaryById(review.paper.id);
    ok(res, {
      paper: summary ? mapPaperSummary(summary) : null,
      review: mapTemplateReviewDetail(review),
      canDownload: Boolean(review.approvedFilePath),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/analysis-reviews/:reviewId/resubmit', requireRole('teacher'), async (req, res, next) => {
  try {
    const review = await resolveAnalysisReviewForAccess(String(req.params.id), String(req.params.reviewId), req.user!);
    if (review.paper.teacherId !== req.user!.userId) {
      throw forbidden('只能重提自己的试卷分析审核');
    }
    if (!['rejected', 'draft_teacher', 'pending'].includes(review.status)) {
      throw new AppError('当前状态不允许重新提交试卷分析审核', 400);
    }

    const classIds = parseIdList(req.body.courseClassIds);
    if (!classIds.length) {
      throw new AppError('请至少选择一个班级', 400);
    }
    const scopeSignature = normalizeClassScopeSignature(classIds);
    if (scopeSignature !== (review.scopeSignature ?? '')) {
      const existing = await findExistingAnalysisReview(review.paperId, scopeSignature);
      if (existing && existing.id !== review.id) {
        if (existing.status === 'approved') {
          throw new AppError('该班级组合的试卷分析已审核通过，不能重复发起', 400);
        }
        if (['pending', 'pending_dean'].includes(existing.status)) {
          throw new AppError('该班级组合已存在待审核的试卷分析，请勿重复提交', 400);
        }
      }
    }

    const allClasses = review.paper.classGroups.map((item) => item.courseClass);
    const classNames = allClasses.filter((item) => classIds.includes(item.id)).map((item) => item.className);
    const systemPayload = await buildInitialAnalysisReviewPayload(review.paper, classNames);
    const currentPayload = mergeTemplatePayloadByOwners('exam-analysis', parseTemplateFormData(review.formData), systemPayload, ['system']);
    const teacherMerged = mergeTemplatePayloadByOwners('exam-analysis', currentPayload, parseFormDataInput(req.body.formData), ['teacher']);
    const cleaned = resetReviewerSections('exam-analysis', teacherMerged);
    const nextFormData = withActorDefaults(cleaned, 'teacher', review.paper.teacher.realName);

    await prisma.$transaction(async (tx) => {
      await tx.paperTemplateReviewClassGroup.deleteMany({ where: { reviewId: review.id } });
      await tx.paperTemplateReviewClassGroup.createMany({
        data: classIds.map((courseClassId) => ({ reviewId: review.id, courseClassId })),
      });
      await tx.paperTemplateReview.update({
        where: { id: review.id },
        data: {
          scopeSignature,
          status: 'pending',
          rejectReason: null,
          rejectionStage: null,
          approvedFilePath: null,
          formData: JSON.stringify(nextFormData),
          teacherSubmittedAt: new Date(),
          directorReviewedAt: null,
          deanReviewedAt: null,
          directorReviewerId: null,
          deanReviewerId: null,
        },
      });
    });

    await createAnalysisNotifications(
      { teacherName: review.paper.teacher.realName, courseName: review.paper.course.courseName, departmentId: review.paper.departmentId },
      classNames,
    );
    await emitPaperEvent({
      type: 'paper:new-submission',
      paperId: review.paper.id,
      status: 'pending',
      courseName: review.paper.course.courseName,
      teacherName: review.paper.teacher.realName,
      teacherId: review.paper.teacherId,
      departmentId: review.paper.departmentId,
      message: '试卷分析审核已重新提交',
      workflowType: 'analysis_review',
      templateId: 'exam-analysis',
      reviewId: review.id,
    });

    const refreshed = await resolveAnalysisReviewForAccess(review.paperId, review.id, req.user!);
    ok(res, mapTemplateReviewDetail(refreshed), '试卷分析审核已重新提交');
  } catch (error) {
    next(error);
  }
});

router.post('/:id/approve', requireRole('director', 'academic_dean'), async (req, res, next) => {
  try {
    const paper = await getWorkflowPaperForRole(String(req.params.id), req.user!);
    const review = getMainReviewOrThrow(paper);
    const formData = parseFormDataInput(reviewActionSchema.parse(req.body).formData);
    const actorRealName = await getActorRealName(req.user!.userId);

    if (req.user!.currentRole === 'director') {
      if (paper.status !== 'pending' || paper.departmentId !== req.user!.departmentId) {
        throw notFound('待教研室主任审核试卷不存在');
      }
      const nextFormData = applyOwnerPayload(review.templateId, review.formData, formData, 'director', actorRealName);
      await prisma.paperTemplateReview.update({
        where: { id: review.id },
        data: {
          status: 'pending_dean',
          formData: JSON.stringify(nextFormData),
          directorReviewedAt: new Date(),
          directorReviewerId: req.user!.userId,
        },
      });
      await prisma.examPaper.update({
        where: { id: paper.id },
        data: {
          status: 'pending_dean',
          reviewerId: req.user!.userId,
          reviewedAt: new Date(),
        },
      });
      const deanUserIds = await listAcademicDeanUserIds();
      await createNotifications({
        userIds: deanUserIds,
        type: 'approval',
        title: '试卷已提交教学院长审核',
        content: `${paper.course.courseName} 已由教研室主任审核通过，待教学院长审核`,
      });
      const summary = await getPaperSummaryById(paper.id);
      ok(res, mapPaperSummary(summary!), '试卷已提交教学院长审核');
      return;
    }

    if (paper.status !== 'pending_dean') {
      throw new AppError('只有待教学院长审核的试卷才能最终通过', 400);
    }

    const nextFormData = applyOwnerPayload(review.templateId, review.formData, formData, 'academic_dean', actorRealName);
    const paperNumber = await generatePaperNumber(paper.semesterId);
    const approvedFiles = await finalizeMainApproval({
      paper,
      templateId: review.templateId,
      formData: nextFormData,
      paperNumber,
    });

    await prisma.$transaction(async (tx) => {
      await tx.paperTemplateReview.update({
        where: { id: review.id },
        data: {
          status: 'approved',
          formData: JSON.stringify(nextFormData),
          approvedFilePath: approvedFiles.approvedTemplatePath,
          deanReviewedAt: new Date(),
          deanReviewerId: req.user!.userId,
          rejectReason: null,
          rejectionStage: null,
        },
      });
      await tx.examPaper.update({
        where: { id: paper.id },
        data: {
          status: 'approved',
          paperNumber,
          approvedFilePath: approvedFiles.approvedPaperPath,
          reviewerId: req.user!.userId,
          reviewedAt: new Date(),
          rejectReason: null,
          rejectionStage: null,
        },
      });
    });

    await createNotifications({
      userIds: [paper.teacherId],
      type: 'approval',
      title: '试卷编号审核已通过',
      content: `${paper.course.courseName} 已完成审核，试卷编号为 ${paperNumber}`,
    });
    const summary = await getPaperSummaryById(paper.id);
    await emitPaperEvent({
      type: 'paper:status-changed',
      paperId: paper.id,
      status: 'approved',
      courseName: paper.course.courseName,
      teacherName: paper.teacher.realName,
      teacherId: paper.teacherId,
      departmentId: paper.departmentId,
      message: '试卷主流程已审核通过',
      workflowType: 'numbering_review',
      templateId: review.templateId,
    });
    await recordAudit(req, 'paper:approve', 'paper', {
      teacherName: paper.teacher.realName,
      courseName: paper.course.courseName,
      paperNumber,
    });
    ok(res, mapPaperSummary(summary!), '试卷审核通过');
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reject', requireRole('director', 'academic_dean'), async (req, res, next) => {
  try {
    const paper = await getWorkflowPaperForRole(String(req.params.id), req.user!);
    const review = getMainReviewOrThrow(paper);
    const body = reviewActionSchema.parse(req.body);
    const rejectReason = z.string().trim().min(2).parse(body.rejectReason);
    const actorRealName = await getActorRealName(req.user!.userId);

    if (req.user!.currentRole === 'director') {
      if (paper.status !== 'pending' || paper.departmentId !== req.user!.departmentId) {
        throw notFound('待教研室主任审核试卷不存在');
      }
    } else if (!['pending', 'pending_dean'].includes(paper.status)) {
      throw notFound('待驳回试卷不存在');
    }

    const nextFormData = applyOwnerPayload(
      review.templateId,
      review.formData,
      parseFormDataInput(body.formData),
      req.user!.currentRole,
      actorRealName,
    );
    const rejectionStage = getStageLabel(req.user!.currentRole);

    await prisma.$transaction(async (tx) => {
      await tx.paperTemplateReview.update({
        where: { id: review.id },
        data: {
          status: 'rejected',
          rejectReason,
          rejectionStage,
          formData: JSON.stringify(nextFormData),
          ...(req.user!.currentRole === 'director'
            ? { directorReviewedAt: new Date(), directorReviewerId: req.user!.userId }
            : { deanReviewedAt: new Date(), deanReviewerId: req.user!.userId }),
        },
      });
      await tx.examPaper.update({
        where: { id: paper.id },
        data: {
          status: 'rejected',
          rejectReason,
          rejectionStage,
          reviewerId: req.user!.userId,
          reviewedAt: new Date(),
        },
      });
    });

    await createNotifications({
      userIds: [paper.teacherId],
      type: 'approval',
      title: '试卷编号审核被驳回',
      content: `${paper.course.courseName} 被驳回，原因：${rejectReason}`,
    });
    await emitPaperEvent({
      type: 'paper:status-changed',
      paperId: paper.id,
      status: 'rejected',
      courseName: paper.course.courseName,
      teacherName: paper.teacher.realName,
      teacherId: paper.teacherId,
      departmentId: paper.departmentId,
      message: '试卷主流程已被驳回',
      workflowType: 'numbering_review',
      templateId: review.templateId,
    });
    await recordAudit(req, 'paper:reject', 'paper', {
      teacherName: paper.teacher.realName,
      courseName: paper.course.courseName,
      reason: rejectReason,
    });
    const summary = await getPaperSummaryById(paper.id);
    ok(res, mapPaperSummary(summary!), '试卷已驳回');
  } catch (error) {
    next(error);
  }
});

router.post('/:id/analysis-reviews/:reviewId/approve', requireRole('director', 'academic_dean'), async (req, res, next) => {
  try {
    const review = await resolveAnalysisReviewForAccess(String(req.params.id), String(req.params.reviewId), req.user!);
    const incomingFormData = parseFormDataInput(reviewActionSchema.parse(req.body).formData);
    const actorRealName = await getActorRealName(req.user!.userId);

    if (req.user!.currentRole === 'director') {
      if (review.paper.departmentId !== req.user!.departmentId || review.status !== 'pending') {
        throw notFound('待教研室主任审核的试卷分析不存在');
      }
      const nextFormData = applyOwnerPayload('exam-analysis', review.formData, incomingFormData, 'director', actorRealName);
      await prisma.paperTemplateReview.update({
        where: { id: review.id },
        data: {
          status: 'pending_dean',
          formData: JSON.stringify(nextFormData),
          directorReviewedAt: new Date(),
          directorReviewerId: req.user!.userId,
        },
      });
      ok(res, null, '试卷分析已提交教学院长审核');
      return;
    }

    if (review.status !== 'pending_dean') {
      throw new AppError('只有待教学院长审核的试卷分析才能最终通过', 400);
    }
    const nextFormData = applyOwnerPayload('exam-analysis', review.formData, incomingFormData, 'academic_dean', actorRealName);
    const approvedFilePath = await finalizeAnalysisApproval({
      paperOriginalFilePath: review.paper.originalFilePath,
      reviewId: review.id,
      formData: nextFormData,
    });
    await prisma.paperTemplateReview.update({
      where: { id: review.id },
      data: {
        status: 'approved',
        formData: JSON.stringify(nextFormData),
        approvedFilePath,
        deanReviewedAt: new Date(),
        deanReviewerId: req.user!.userId,
        rejectReason: null,
        rejectionStage: null,
      },
    });
    await createNotifications({
      userIds: [review.paper.teacherId],
      type: 'approval',
      title: '试卷分析审核已通过',
      content: `${review.paper.course.courseName} 的试卷分析已完成审核`,
    });
    await emitPaperEvent({
      type: 'paper:status-changed',
      paperId: review.paper.id,
      status: 'approved',
      courseName: review.paper.course.courseName,
      teacherName: review.paper.teacher.realName,
      teacherId: review.paper.teacherId,
      departmentId: review.paper.departmentId,
      message: '试卷分析流程已审核通过',
      workflowType: 'analysis_review',
      templateId: 'exam-analysis',
      reviewId: review.id,
    });
    const refreshed = await resolveAnalysisReviewForAccess(review.paperId, review.id, req.user!);
    ok(res, mapTemplateReviewDetail(refreshed), '试卷分析审核通过');
  } catch (error) {
    next(error);
  }
});

router.post('/:id/analysis-reviews/:reviewId/reject', requireRole('director', 'academic_dean'), async (req, res, next) => {
  try {
    const review = await resolveAnalysisReviewForAccess(String(req.params.id), String(req.params.reviewId), req.user!);
    const body = reviewActionSchema.parse(req.body);
    const rejectReason = z.string().trim().min(2).parse(body.rejectReason);
    const actorRealName = await getActorRealName(req.user!.userId);

    if (req.user!.currentRole === 'director') {
      if (review.paper.departmentId !== req.user!.departmentId || review.status !== 'pending') {
        throw notFound('待教研室主任审核的试卷分析不存在');
      }
    } else if (!['pending', 'pending_dean'].includes(review.status)) {
      throw notFound('待驳回的试卷分析不存在');
    }

    const nextFormData = applyOwnerPayload('exam-analysis', review.formData, parseFormDataInput(body.formData), req.user!.currentRole, actorRealName);
    await prisma.paperTemplateReview.update({
      where: { id: review.id },
      data: {
        status: 'rejected',
        rejectReason,
        rejectionStage: getStageLabel(req.user!.currentRole),
        formData: JSON.stringify(nextFormData),
        ...(req.user!.currentRole === 'director'
          ? { directorReviewedAt: new Date(), directorReviewerId: req.user!.userId }
          : { deanReviewedAt: new Date(), deanReviewerId: req.user!.userId }),
      },
    });
    await createNotifications({
      userIds: [review.paper.teacherId],
      type: 'approval',
      title: '试卷分析审核被驳回',
      content: `${review.paper.course.courseName} 的试卷分析被驳回，原因：${rejectReason}`,
    });
    await emitPaperEvent({
      type: 'paper:status-changed',
      paperId: review.paper.id,
      status: 'rejected',
      courseName: review.paper.course.courseName,
      teacherName: review.paper.teacher.realName,
      teacherId: review.paper.teacherId,
      departmentId: review.paper.departmentId,
      message: '试卷分析流程已被驳回',
      workflowType: 'analysis_review',
      templateId: 'exam-analysis',
      reviewId: review.id,
    });
    const refreshed = await resolveAnalysisReviewForAccess(review.paperId, review.id, req.user!);
    ok(res, mapTemplateReviewDetail(refreshed), '试卷分析已驳回');
  } catch (error) {
    next(error);
  }
});

router.get('/:id/analysis-reviews/:reviewId/preview-file', async (req, res, next) => {
  try {
    const review = await resolveAnalysisReviewForAccess(String(req.params.id), String(req.params.reviewId), req.user!);
    if (review.approvedFilePath) {
      res.download(review.approvedFilePath, path.basename(review.approvedFilePath));
      return;
    }
    const buffer = await buildTemplatePreviewBuffer('exam-analysis', parseTemplateFormData(review.formData));
    sendDocxBuffer(res, buffer, `${review.paper.course.courseName}-试卷分析模板.docx`);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/analysis-reviews/:reviewId/download', async (req, res, next) => {
  try {
    const review = await resolveAnalysisReviewForAccess(String(req.params.id), String(req.params.reviewId), req.user!);
    if (!review.approvedFilePath) {
      throw new AppError('试卷分析尚未审核通过，暂不能下载归档文件', 400);
    }
    res.download(review.approvedFilePath, path.basename(review.approvedFilePath));
  } catch (error) {
    next(error);
  }
});

router.put('/:id/class-group', requireRole('teacher'), async (req, res, next) => {
  try {
    const paperId = String(req.params.id);
    const courseClassIds = z.array(z.string()).parse(req.body.courseClassIds ?? []);
    const paper = await prisma.examPaper.findFirst({
      where: { id: paperId, teacherId: req.user!.userId },
    });
    if (!paper) {
      throw notFound('试卷不存在');
    }
    await prisma.paperClassGroup.deleteMany({ where: { paperId: paper.id } });
    await prisma.paperClassGroup.createMany({
      data: courseClassIds.map((courseClassId) => ({
        paperId: paper.id,
        courseClassId,
      })),
    });
    ok(res, null, '班级分组更新成功');
  } catch (error) {
    next(error);
  }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    const paper = await getWorkflowPaperForRole(String(req.params.id), req.user!);
    const filePath = paper.status === 'approved' && paper.approvedFilePath ? paper.approvedFilePath : paper.originalFilePath;
    await recordAudit(req, 'paper:download', 'paper', {
      courseName: paper.course.courseName,
      paperNumber: paper.paperNumber ?? '未编号',
    });
    res.download(filePath, path.basename(filePath));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/preview-file', async (req, res, next) => {
  try {
    const paper = await getWorkflowPaperForRole(String(req.params.id), req.user!);
    const filePath = paper.status === 'approved' && paper.approvedFilePath ? paper.approvedFilePath : paper.originalFilePath;
    const buffer = await fs.readFile(filePath);
    sendDocxBuffer(res, buffer, path.basename(filePath));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/preview', async (req, res, next) => {
  try {
    const paper = await getWorkflowPaperForRole(String(req.params.id), req.user!);
    if (paper.status === 'approved' && paper.approvedFilePath) {
      const previewHtml = await getPreviewHtml(paper.approvedFilePath);
      ok(res, { previewHtml });
      return;
    }
    ok(res, { previewHtml: paper.previewHtml });
  } catch (error) {
    next(error);
  }
});

export default router;
