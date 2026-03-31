import ExcelJS from 'exceljs';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { recordAudit } from '../utils/audit.js';

const router = Router();

router.use(requireAuth);

router.get('/papers', requireRole('admin', 'director'), async (req, res, next) => {
  try {
    const papers = await prisma.examPaper.findMany({
      where: req.user!.currentRole === 'director' ? { departmentId: req.user!.departmentId ?? undefined } : undefined,
      include: { course: true, teacher: true, semester: true, department: true, reviewer: true },
    });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('试卷');
    sheet.addRow(['课程', '教师', '学期', '教研室', '状态', '编号', '提交时间', '审核人', '驳回原因']);
    for (const paper of papers) {
      sheet.addRow([
        paper.course.courseName,
        paper.teacher.realName,
        paper.semester.name,
        paper.department.name,
        paper.status,
        paper.paperNumber,
        paper.submittedAt.toLocaleString(),
        paper.reviewer?.realName ?? '',
        paper.rejectReason ?? '',
      ]);
    }
    await recordAudit(req, 'data:export', 'export', { exportType: '试卷数据' });
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="papers.xlsx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

router.get('/audit-logs', requireRole('admin'), async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' } });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('审计日志');
    sheet.addRow(['用户', '动作', '模块', '详情', 'IP', '状态码', '时间']);
    for (const log of logs) {
      sheet.addRow([log.userName, log.action, log.module, log.detail, log.ipAddress, log.statusCode, log.createdAt.toLocaleString()]);
    }
    await recordAudit(req, 'data:export', 'export', { exportType: '审计日志' });
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.xlsx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

export default router;
