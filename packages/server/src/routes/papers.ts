import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { uploadDocx } from '../middlewares/upload.js';
import { createNotifications } from '../services/notification-service.js';
import { generatePaperNumber } from '../services/paper-number-service.js';
import { getIo } from '../socket/context.js';
import { recordAudit } from '../utils/audit.js';
import { injectPaperNumber } from '../utils/docx.js';
import { AppError, forbidden, notFound } from '../utils/errors.js';
import { mapPaperSummary } from '../utils/mappers.js';
import { ok } from '../utils/response.js';
import { buildPaperDir, ensureDir, getFileHash, getPreviewHtml } from '../utils/storage.js';

const router = Router();

router.use(requireAuth);

router.post('/submit', requireRole('teacher'), ...uploadDocx, async (req, res, next) => {
  try {
    const courseId = String(req.body.courseId);
    const selectedClassIds = JSON.parse(String(req.body.courseClassIds ?? '[]')) as string[];
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

    const storageDir = buildPaperDir(course.semester.code, course.department.code, req.user!.userId);
    await ensureDir(storageDir);
    const storedName = `${randomUUID()}.docx`;
    const originalFilePath = path.join(storageDir, storedName);
    await fs.writeFile(originalFilePath, req.file!.buffer);

    const fileHash = await getFileHash(originalFilePath);
    if (latestPaper?.fileHash === fileHash) {
      throw new AppError('新提交的试卷与上一版本完全一致，请确认后再提交', 400);
    }

    const previewHtml = await getPreviewHtml(originalFilePath);
    const paper = await prisma.examPaper.create({
      data: {
        courseId: course.id,
        teacherId: req.user!.userId,
        semesterId: course.semesterId,
        departmentId: course.departmentId,
        version,
        originalFileName: req.file!.originalname,
        originalFilePath,
        fileHash,
        previewHtml,
        classGroups: {
          create: (selectedClassIds.length ? selectedClassIds : course.classes.map((item) => item.id)).map((courseClassId) => ({
            courseClassId,
          })),
        },
      },
      include: {
        course: true,
        semester: true,
        teacher: true,
        department: true,
        reviewer: true,
        classGroups: { include: { courseClass: true } },
      },
    });

    const director = await prisma.department.findUnique({
      where: { id: course.departmentId },
      select: { directorId: true },
    });
    if (director?.directorId) {
      await createNotifications({
        userIds: [director.directorId],
        type: 'paper',
        title: '有新的试卷待审核',
        content: `${paper.teacher.realName} 提交了 ${paper.course.courseName} 的试卷`,
      });
    }
    try {
      const payload = {
        paperId: paper.id,
        status: paper.status,
        courseName: paper.course.courseName,
        teacherName: paper.teacher.realName,
        message: '有新的试卷待审核',
      };
      const io = getIo();
      io.to(`department:${paper.departmentId}`).emit('paper:new-submission', payload);
      io.to('role:admin').emit('paper:new-submission', payload);
      io.to(`user:${paper.teacherId}`).emit('paper:new-submission', payload);
    } catch {
      // ignore before socket ready
    }
    await recordAudit(req, version > 1 ? 'paper:resubmit' : 'paper:submit', 'paper', {
      courseName: course.courseName,
      version,
    });
    ok(res, mapPaperSummary(paper), '试卷提交成功');
  } catch (error) {
    next(error);
  }
});

router.get('/my', requireRole('teacher'), async (req, res, next) => {
  try {
    const papers = await prisma.examPaper.findMany({
      where: { teacherId: req.user!.userId },
      include: {
        course: true,
        semester: true,
        teacher: true,
        department: true,
        reviewer: true,
        classGroups: { include: { courseClass: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
    ok(res, papers.map(mapPaperSummary));
  } catch (error) {
    next(error);
  }
});

router.get('/pending', requireRole('director'), async (req, res, next) => {
  try {
    const papers = await prisma.examPaper.findMany({
      where: {
        departmentId: req.user!.departmentId ?? undefined,
        status: 'pending',
      },
      include: {
        course: true,
        semester: true,
        teacher: true,
        department: true,
        reviewer: true,
        classGroups: { include: { courseClass: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
    ok(res, papers.map(mapPaperSummary));
  } catch (error) {
    next(error);
  }
});

router.get('/all', requireRole('admin'), async (_req, res, next) => {
  try {
    const papers = await prisma.examPaper.findMany({
      include: {
        course: true,
        semester: true,
        teacher: true,
        department: true,
        reviewer: true,
        classGroups: { include: { courseClass: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
    ok(res, papers.map(mapPaperSummary));
  } catch (error) {
    next(error);
  }
});

router.get('/department/:deptId', requireRole('director', 'admin'), async (req, res, next) => {
  try {
    const deptId = String(req.params.deptId);
    if (req.user!.currentRole === 'director' && req.user!.departmentId !== deptId) {
      throw forbidden('只能查看本教研室数据');
    }
    const papers = await prisma.examPaper.findMany({
      where: { departmentId: deptId },
      include: {
        course: true,
        semester: true,
        teacher: true,
        department: true,
        reviewer: true,
        classGroups: { include: { courseClass: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
    ok(res, papers.map(mapPaperSummary));
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

router.post('/:id/approve', requireRole('director'), async (req, res, next) => {
  try {
    const paperId = String(req.params.id);
    const paper = await prisma.examPaper.findFirst({
      where: {
        id: paperId,
        departmentId: req.user!.departmentId ?? undefined,
        status: 'pending',
      },
      include: {
        course: true,
        semester: true,
        teacher: true,
        department: true,
        reviewer: true,
        classGroups: { include: { courseClass: true } },
      },
    });
    if (!paper) {
      throw notFound('待审核试卷不存在');
    }

    const paperNumber = await generatePaperNumber(paper.semesterId);
    const approvedFilePath = paper.originalFilePath.replace('.docx', `.approved.${paperNumber}.docx`);
    await injectPaperNumber(paper.originalFilePath, approvedFilePath, paperNumber);

    const updated = await prisma.examPaper.update({
      where: { id: paper.id },
      data: {
        status: 'approved',
        paperNumber,
        approvedFilePath,
        reviewerId: req.user!.userId,
        reviewedAt: new Date(),
        approvalNote: String(req.body.note ?? ''),
      },
      include: {
        course: true,
        semester: true,
        teacher: true,
        department: true,
        reviewer: true,
        classGroups: { include: { courseClass: true } },
      },
    });

    await createNotifications({
      userIds: [updated.teacherId],
      type: 'approval',
      title: '试卷审核已通过',
      content: `${updated.course.courseName} 试卷已通过审核，编号 ${paperNumber}`,
    });

    try {
      const payload = {
        paperId: updated.id,
        status: updated.status,
        courseName: updated.course.courseName,
        teacherName: updated.teacher.realName,
        message: '试卷审核已通过',
      };
      const io = getIo();
      io.to(`user:${updated.teacherId}`).emit('paper:status-changed', payload);
      io.to(`department:${updated.departmentId}`).emit('paper:status-changed', payload);
      io.to('role:admin').emit('paper:status-changed', payload);
    } catch {
      // ignore
    }

    await recordAudit(req, 'paper:approve', 'paper', {
      teacherName: updated.teacher.realName,
      courseName: updated.course.courseName,
      paperNumber,
    });
    ok(res, mapPaperSummary(updated), '试卷审核通过');
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reject', requireRole('director'), async (req, res, next) => {
  try {
    const paperId = String(req.params.id);
    const rejectReason = z.string().min(2).parse(req.body.rejectReason);
    const paper = await prisma.examPaper.findFirst({
      where: {
        id: paperId,
        departmentId: req.user!.departmentId ?? undefined,
        status: 'pending',
      },
      include: {
        course: true,
        semester: true,
        teacher: true,
        department: true,
        reviewer: true,
        classGroups: { include: { courseClass: true } },
      },
    });
    if (!paper) {
      throw notFound('待审核试卷不存在');
    }
    const updated = await prisma.examPaper.update({
      where: { id: paper.id },
      data: {
        status: 'rejected',
        rejectReason,
        reviewerId: req.user!.userId,
        reviewedAt: new Date(),
      },
      include: {
        course: true,
        semester: true,
        teacher: true,
        department: true,
        reviewer: true,
        classGroups: { include: { courseClass: true } },
      },
    });
    await createNotifications({
      userIds: [updated.teacherId],
      type: 'approval',
      title: '试卷审核被驳回',
      content: `${updated.course.courseName} 试卷被驳回，原因：${rejectReason}`,
    });
    try {
      const payload = {
        paperId: updated.id,
        status: updated.status,
        courseName: updated.course.courseName,
        teacherName: updated.teacher.realName,
        message: '试卷审核被驳回',
      };
      const io = getIo();
      io.to(`user:${updated.teacherId}`).emit('paper:status-changed', payload);
      io.to(`department:${updated.departmentId}`).emit('paper:status-changed', payload);
      io.to('role:admin').emit('paper:status-changed', payload);
    } catch {
      // ignore
    }
    await recordAudit(req, 'paper:reject', 'paper', {
      teacherName: updated.teacher.realName,
      courseName: updated.course.courseName,
      reason: rejectReason,
    });
    ok(res, mapPaperSummary(updated), '试卷已驳回');
  } catch (error) {
    next(error);
  }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    const paperId = String(req.params.id);
    const paper = await prisma.examPaper.findUnique({
      where: { id: paperId },
      include: { course: true },
    });
    if (!paper) {
      throw notFound('试卷不存在');
    }
    const allowed =
      req.user!.currentRole === 'admin' ||
      paper.teacherId === req.user!.userId ||
      paper.reviewerId === req.user!.userId ||
      (req.user!.currentRole === 'director' && paper.departmentId === req.user!.departmentId);
    if (!allowed) {
      throw forbidden('无权下载该试卷');
    }
    const filePath = paper.approvedFilePath ?? paper.originalFilePath;
    await recordAudit(req, 'paper:download', 'paper', {
      courseName: paper.course.courseName,
      paperNumber: paper.paperNumber ?? '未编号',
    });
    res.download(filePath, path.basename(filePath));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/preview', async (req, res, next) => {
  try {
    const paper = await prisma.examPaper.findUnique({ where: { id: String(req.params.id) } });
    if (!paper) {
      throw notFound('试卷不存在');
    }
    ok(res, { previewHtml: paper.previewHtml });
  } catch (error) {
    next(error);
  }
});

export default router;
