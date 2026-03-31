import type { Request } from 'express';
import { prisma } from '../lib/prisma.js';

const templates: Record<string, string> = {
  'user:login': '{userName} 登录了系统（IP: {ip}）',
  'user:logout': '{userName} 退出了系统',
  'user:create': '{userName} 创建了用户 [{targetName}]',
  'user:update': '{userName} 修改了用户 [{targetName}] 的信息',
  'user:delete': '{userName} 删除了用户 [{targetName}]',
  'role:assign': '{userName} 为用户 [{targetName}] 分配了角色 [{roleName}]',
  'role:switch': '{userName} 切换角色为 [{roleName}]',
  'course:import': '{userName} 导入了 {count} 条课程数据（学期：{semesterName}）',
  'paper:submit': '{userName} 提交了课程 [{courseName}] 的试卷（版本 {version}）',
  'paper:approve': '{userName} 审核通过了 [{teacherName}] 的课程 [{courseName}] 试卷，编号: {paperNumber}',
  'paper:reject': '{userName} 驳回了 [{teacherName}] 的课程 [{courseName}] 试卷，理由: {reason}',
  'paper:download': '{userName} 下载了课程 [{courseName}] 的试卷（编号: {paperNumber})',
  'paper:resubmit': '{userName} 重新提交了课程 [{courseName}] 的试卷（版本 {version}）',
  'number-rule:set': '{userName} 设置了学期 [{semesterName}] 的试卷编号规则',
  'data:export': '{userName} 导出了 [{exportType}] 数据',
};

function renderTemplate(template: string, payload: Record<string, string | number | undefined>) {
  return Object.entries(payload).reduce(
    (content, [key, value]) => content.replaceAll(`{${key}}`, String(value ?? '')),
    template,
  );
}

export async function recordAudit(
  req: Request,
  action: string,
  module: string,
  payload: Record<string, string | number | undefined>,
  statusCode = 200,
) {
  const user = req.user
    ? await prisma.user.findUnique({
        where: { id: req.user.userId },
      })
    : null;

  const template = templates[action] ?? '{userName} 执行了操作';
  await prisma.auditLog.create({
    data: {
      userId: user?.id,
      userName: user?.realName ?? '系统',
      action,
      module,
      target: payload.targetName ? String(payload.targetName) : undefined,
      detail: renderTemplate(template, {
        userName: user?.realName ?? '系统',
        ip: req.ip,
        ...payload,
      }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      statusCode,
    },
  });
}
