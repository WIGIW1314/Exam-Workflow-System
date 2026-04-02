import ExcelJS from 'exceljs';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { recordAudit } from '../utils/audit.js';
import { formatDateTime } from '../utils/datetime.js';
import { buildSheet, buildTemplateSheet, sendWorkbook } from '../utils/excel.js';

const router = Router();

router.use(requireAuth);

async function logExport(req: Parameters<typeof recordAudit>[0], exportType: string) {
  await recordAudit(req, 'data:export', 'export', { exportType });
}

router.get('/users', requireRole('admin'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      include: { department: true, roles: { include: { role: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const workbook = new ExcelJS.Workbook();
    buildSheet(
      workbook,
      '用户数据',
      [
        { header: '用户名', key: 'username', width: 16 },
        { header: '姓名', key: 'realName', width: 14 },
        { header: '邮箱', key: 'email', width: 24 },
        { header: '手机号', key: 'phone', width: 16 },
        { header: '教研室', key: 'departmentName', width: 18 },
        { header: '角色编码', key: 'roleCodes', width: 22 },
        { header: '状态', key: 'status', width: 10 },
      ],
      users.map((user) => ({
        username: user.username,
        realName: user.realName,
        email: user.email ?? '',
        phone: user.phone ?? '',
        departmentName: user.department?.name ?? '',
        roleCodes: user.roles.map((item) => item.role.code).join(','),
        status: user.status ? '启用' : '停用',
      })),
    );
    await logExport(req, '用户数据');
    await sendWorkbook(res, workbook, 'users.xlsx');
  } catch (error) {
    next(error);
  }
});

router.get('/users-template', requireRole('admin'), async (_req, res, next) => {
  try {
    const workbook = new ExcelJS.Workbook();
    buildTemplateSheet(
      workbook,
      '用户导入模板',
      [
        { header: '用户名', key: 'username', width: 16 },
        { header: '姓名', key: 'realName', width: 14 },
        { header: '邮箱', key: 'email', width: 24 },
        { header: '手机号', key: 'phone', width: 16 },
        { header: '教研室编码', key: 'departmentCode', width: 16 },
        { header: '角色编码', key: 'roleCodes', width: 24 },
        { header: '状态', key: 'status', width: 10 },
      ],
      [
        {
          username: 'teacher01',
          realName: '张老师',
          email: 'teacher01@example.com',
          phone: '13800000000',
          departmentCode: 'CS',
          roleCodes: 'teacher',
          status: '启用',
        },
      ],
    );
    await sendWorkbook(res, workbook, 'users-template.xlsx');
  } catch (error) {
    next(error);
  }
});

router.get('/semesters', requireRole('admin'), async (req, res, next) => {
  try {
    const semesters = await prisma.semester.findMany({ orderBy: { createdAt: 'desc' } });
    const workbook = new ExcelJS.Workbook();
    buildSheet(
      workbook,
      '学期数据',
      [
        { header: '学期名称', key: 'name', width: 22 },
        { header: '学期编码', key: 'code', width: 20 },
        { header: '当前学期', key: 'isCurrent', width: 12 },
        { header: '状态', key: 'status', width: 10 },
      ],
      semesters.map((item) => ({
        name: item.name,
        code: item.code,
        isCurrent: item.isCurrent ? '是' : '否',
        status: item.status ? '启用' : '停用',
      })),
    );
    await logExport(req, '学期数据');
    await sendWorkbook(res, workbook, 'semesters.xlsx');
  } catch (error) {
    next(error);
  }
});

router.get('/semesters-template', requireRole('admin'), async (_req, res, next) => {
  try {
    const workbook = new ExcelJS.Workbook();
    buildTemplateSheet(
      workbook,
      '学期导入模板',
      [
        { header: '学期名称', key: 'name', width: 22 },
        { header: '学期编码', key: 'code', width: 20 },
        { header: '当前学期', key: 'isCurrent', width: 12 },
        { header: '状态', key: 'status', width: 10 },
      ],
      [
        {
          name: '2025-2026 第二学期',
          code: '2025-2026-2',
          isCurrent: '是',
          status: '启用',
        },
      ],
    );
    await sendWorkbook(res, workbook, 'semesters-template.xlsx');
  } catch (error) {
    next(error);
  }
});

router.get('/departments', requireRole('admin'), async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      include: { director: true, members: true },
      orderBy: { sortOrder: 'asc' },
    });
    const workbook = new ExcelJS.Workbook();
    buildSheet(
      workbook,
      '教研室数据',
      [
        { header: '名称', key: 'name', width: 18 },
        { header: '编码', key: 'code', width: 14 },
        { header: '主任用户名', key: 'directorUsername', width: 16 },
        { header: '排序', key: 'sortOrder', width: 10 },
        { header: '状态', key: 'status', width: 10 },
        { header: '说明', key: 'description', width: 26 },
      ],
      departments.map((item) => ({
        name: item.name,
        code: item.code,
        directorUsername: item.director?.username ?? '',
        sortOrder: item.sortOrder,
        status: item.status ? '启用' : '停用',
        description: item.description ?? '',
      })),
    );
    await logExport(req, '教研室数据');
    await sendWorkbook(res, workbook, 'departments.xlsx');
  } catch (error) {
    next(error);
  }
});

router.get('/departments-template', requireRole('admin'), async (_req, res, next) => {
  try {
    const workbook = new ExcelJS.Workbook();
    buildTemplateSheet(
      workbook,
      '教研室导入模板',
      [
        { header: '名称', key: 'name', width: 18 },
        { header: '编码', key: 'code', width: 14 },
        { header: '主任用户名', key: 'directorUsername', width: 16 },
        { header: '排序', key: 'sortOrder', width: 10 },
        { header: '状态', key: 'status', width: 10 },
        { header: '说明', key: 'description', width: 26 },
      ],
      [
        {
          name: '计算机教研室',
          code: 'CS',
          directorUsername: 'director',
          sortOrder: 1,
          status: '启用',
          description: '软件工程与计算机基础课程组',
        },
      ],
    );
    await sendWorkbook(res, workbook, 'departments-template.xlsx');
  } catch (error) {
    next(error);
  }
});

router.get('/courses', requireRole('admin'), async (req, res, next) => {
  try {
    const courses = await prisma.course.findMany({
      include: { semester: true, teacher: true, department: true, classes: true },
      orderBy: { createdAt: 'desc' },
    });
    const workbook = new ExcelJS.Workbook();
    buildSheet(
      workbook,
      '课程数据',
      [
        { header: '学期编码', key: 'semesterCode', width: 20 },
        { header: '课程编号', key: 'courseCode', width: 14 },
        { header: '课程名称', key: 'courseName', width: 22 },
        { header: '教师用户名', key: 'teacherUsername', width: 16 },
        { header: '教研室编码', key: 'departmentCode', width: 16 },
        { header: '班级', key: 'classNames', width: 28 },
        { header: '学分', key: 'creditHours', width: 10 },
        { header: '课程类型', key: 'courseType', width: 12 },
      ],
      courses.map((item) => ({
        semesterCode: item.semester.code,
        courseCode: item.courseCode,
        courseName: item.courseName,
        teacherUsername: item.teacher.username,
        departmentCode: item.department.code,
        classNames: item.classes.map((courseClass) => courseClass.className).join('、'),
        creditHours: item.creditHours ?? '',
        courseType: item.courseType ?? '',
      })),
    );
    await logExport(req, '课程数据');
    await sendWorkbook(res, workbook, 'courses.xlsx');
  } catch (error) {
    next(error);
  }
});

router.get('/courses-template', requireRole('admin'), async (_req, res, next) => {
  try {
    const workbook = new ExcelJS.Workbook();
    buildTemplateSheet(
      workbook,
      '课程导入模板',
      [
        { header: '学期编码', key: 'semesterCode', width: 20 },
        { header: '课程编号', key: 'courseCode', width: 14 },
        { header: '课程名称', key: 'courseName', width: 22 },
        { header: '教师用户名', key: 'teacherUsername', width: 16 },
        { header: '教研室编码', key: 'departmentCode', width: 16 },
        { header: '班级', key: 'classNames', width: 28 },
        { header: '学分', key: 'creditHours', width: 10 },
        { header: '课程类型', key: 'courseType', width: 12 },
      ],
      [
        {
          semesterCode: '2025-2026-2',
          courseCode: 'CS101',
          courseName: '程序设计基础',
          teacherUsername: 'teacher',
          departmentCode: 'CS',
          classNames: '软件工程2301、计算机科学2302',
          creditHours: 3,
          courseType: '必修',
        },
      ],
    );
    await sendWorkbook(res, workbook, 'courses-template.xlsx');
  } catch (error) {
    next(error);
  }
});

router.get('/audit-logs', requireRole('admin'), async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' } });
    const workbook = new ExcelJS.Workbook();
    buildSheet(
      workbook,
      '审计日志',
      [
        { header: '用户', key: 'userName', width: 14 },
        { header: '动作', key: 'action', width: 18 },
        { header: '模块', key: 'module', width: 14 },
        { header: '详情', key: 'detail', width: 34 },
        { header: 'IP', key: 'ipAddress', width: 16 },
        { header: '状态码', key: 'statusCode', width: 10 },
        { header: '时间', key: 'createdAt', width: 22 },
      ],
      logs.map((item) => ({
        userName: item.userName,
        action: item.action,
        module: item.module,
        detail: item.detail,
        ipAddress: item.ipAddress ?? '',
        statusCode: item.statusCode ?? '',
        createdAt: formatDateTime(item.createdAt),
      })),
    );
    await logExport(req, '审计日志');
    await sendWorkbook(res, workbook, 'audit-logs.xlsx');
  } catch (error) {
    next(error);
  }
});

router.get('/audit-logs-template', requireRole('admin'), async (_req, res, next) => {
  try {
    const workbook = new ExcelJS.Workbook();
    buildTemplateSheet(
      workbook,
      '审计日志导入模板',
      [
        { header: '用户', key: 'userName', width: 14 },
        { header: '动作', key: 'action', width: 18 },
        { header: '模块', key: 'module', width: 14 },
        { header: '详情', key: 'detail', width: 34 },
        { header: 'IP', key: 'ipAddress', width: 16 },
        { header: '状态码', key: 'statusCode', width: 10 },
        { header: '时间', key: 'createdAt', width: 22 },
      ],
      [
        {
          userName: '系统管理员',
          action: 'user:create',
          module: 'users',
          detail: '创建用户 张老师',
          ipAddress: '127.0.0.1',
          statusCode: 200,
          createdAt: '2026-03-31 10:00:00',
        },
      ],
    );
    await sendWorkbook(res, workbook, 'audit-logs-template.xlsx');
  } catch (error) {
    next(error);
  }
});

router.get('/papers', requireRole('admin', 'director', 'academic_dean'), async (req, res, next) => {
  try {
    const papers = await prisma.examPaper.findMany({
      where: req.user!.currentRole === 'director' ? { departmentId: req.user!.departmentId ?? undefined } : undefined,
      include: { course: true, teacher: true, semester: true, department: true, reviewer: true },
    });
    const workbook = new ExcelJS.Workbook();
    buildSheet(
      workbook,
      '试卷',
      [
        { header: '课程', key: 'courseName', width: 22 },
        { header: '教师', key: 'teacherName', width: 14 },
        { header: '学期', key: 'semesterName', width: 20 },
        { header: '教研室', key: 'departmentName', width: 18 },
        { header: '状态', key: 'status', width: 10 },
        { header: '编号', key: 'paperNumber', width: 18 },
        { header: '提交时间', key: 'submittedAt', width: 22 },
        { header: '审核人', key: 'reviewerName', width: 14 },
        { header: '驳回原因', key: 'rejectReason', width: 26 },
      ],
      papers.map((paper) => ({
        courseName: paper.course.courseName,
        teacherName: paper.teacher.realName,
        semesterName: paper.semester.name,
        departmentName: paper.department.name,
        status: paper.status,
        paperNumber: paper.paperNumber ?? '',
        submittedAt: formatDateTime(paper.submittedAt),
        reviewerName: paper.reviewer?.realName ?? '',
        rejectReason: paper.rejectReason ?? '',
      })),
    );
    await logExport(req, '试卷数据');
    await sendWorkbook(res, workbook, 'papers.xlsx');
  } catch (error) {
    next(error);
  }
});

export default router;
