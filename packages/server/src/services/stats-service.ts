import { prisma } from '../lib/prisma.js';

export async function getAdminStats() {
  const [onlineCount, totalCourses, totalPapers, statusCounts, departments] = await Promise.all([
    prisma.session.count({ where: { isOnline: true } }),
    prisma.course.count(),
    prisma.examPaper.count(),
    prisma.examPaper.groupBy({
      by: ['status'],
      _count: { status: true },
    }),
    prisma.department.findMany({
      include: {
        papers: true,
      },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  const distribution = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };

  for (const item of statusCounts) {
    distribution[item.status as keyof typeof distribution] = item._count.status;
  }

  return {
    onlineCount,
    pendingCount: distribution.pending,
    approvedCount: distribution.approved,
    rejectedCount: distribution.rejected,
    totalCourses,
    totalPapers,
    departmentProgress: departments.map((department) => {
      const total = department.papers.length;
      const approved = department.papers.filter((paper) => paper.status === 'approved').length;
      const pending = department.papers.filter((paper) => paper.status === 'pending').length;
      const rejected = department.papers.filter((paper) => paper.status === 'rejected').length;
      return {
        departmentId: department.id,
        departmentName: department.name,
        total,
        approved,
        pending,
        rejected,
        progress: total ? Math.round((approved / total) * 100) : 0,
      };
    }),
    paperStatusDistribution: [
      { status: 'pending', value: distribution.pending },
      { status: 'approved', value: distribution.approved },
      { status: 'rejected', value: distribution.rejected },
    ],
  };
}

export async function getDirectorStats(userId: string, departmentId?: string | null) {
  const stats = await getAdminStats();
  if (!departmentId) {
    return stats;
  }

  const departmentProgress = stats.departmentProgress.filter((item) => item.departmentId === departmentId);
  const [teachers, onlineSessions] = await Promise.all([
    prisma.user.findMany({
      where: { departmentId },
      include: {
        roles: { include: { role: true } },
      },
    }),
    prisma.session.findMany({
      where: { isOnline: true, user: { departmentId } },
      include: { user: true },
    }),
  ]);

  return {
    ...stats,
    departmentProgress,
    teamMembers: teachers.map((teacher) => ({
      id: teacher.id,
      realName: teacher.realName,
      username: teacher.username,
      roles: teacher.roles.map((entry) => entry.role.name).join(' / '),
      isOnline: onlineSessions.some((session) => session.userId === teacher.id),
    })),
    reviewedByCurrentDirector: await prisma.examPaper.count({
      where: { reviewerId: userId },
    }),
  };
}
