import { prisma } from '../lib/prisma.js';
import { formatIsoOffset, toAppTime } from '../utils/datetime.js';

const PAPER_STATUSES = ['pending', 'approved', 'rejected'] as const;

function buildLastDays(days: number) {
  return Array.from({ length: days }, (_, index) => toAppTime().subtract(days - index - 1, 'day'));
}

function buildHourlyBuckets() {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour: `${String(hour).padStart(2, '0')}:00`,
    value: 0,
  }));
}

function toStatusCounts(items: Array<{ status: string }>) {
  const counts = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };
  for (const item of items) {
    if (item.status in counts) {
      counts[item.status as keyof typeof counts] += 1;
    }
  }
  return counts;
}

async function collectBaseStats() {
  const last7Days = buildLastDays(7);
  const last30DaysStart = toAppTime().subtract(29, 'day').startOf('day').toDate();

  const [
    currentSemester,
    onlineSessions,
    users,
    departments,
    courses,
    papers,
    loginLogs,
    recentLoginLogs,
  ] = await Promise.all([
    prisma.semester.findFirst({ where: { isCurrent: true } }),
    prisma.session.findMany({
      where: { isOnline: true },
      include: { user: true },
    }),
    prisma.user.findMany({
      include: {
        department: true,
        roles: { include: { role: true } },
      },
    }),
    prisma.department.findMany({
      include: {
        members: true,
        courses: true,
        papers: true,
      },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.course.findMany({
      include: {
        department: true,
        teacher: true,
      },
    }),
    prisma.examPaper.findMany({
      include: {
        department: true,
        teacher: true,
      },
    }),
    prisma.auditLog.findMany({
      where: {
        action: 'user:login',
        createdAt: { gte: last30DaysStart },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.auditLog.findMany({
      where: { action: 'user:login' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  const onlineUserIds = new Set(onlineSessions.map((session) => session.userId));
  const statusCounts = toStatusCounts(papers);
  const teacherUsers = users.filter((user) => user.roles.some((entry) => entry.role.code === 'teacher'));
  const directorUsers = users.filter((user) => user.roles.some((entry) => entry.role.code === 'director'));

  const loginHourlyDistribution = buildHourlyBuckets();
  const loginTrendMap = new Map(last7Days.map((date) => [date.format('MM-DD'), 0]));
  const paperSubmissionTrendMap = new Map(last7Days.map((date) => [date.format('MM-DD'), 0]));
  const reviewTrendMap = new Map(last7Days.map((date) => [date.format('MM-DD'), { approved: 0, rejected: 0 }]));

  for (const log of loginLogs) {
    const loginDay = toAppTime(log.createdAt).format('MM-DD');
    const loginHour = toAppTime(log.createdAt).hour();
    loginHourlyDistribution[loginHour].value += 1;
    if (loginTrendMap.has(loginDay)) {
      loginTrendMap.set(loginDay, (loginTrendMap.get(loginDay) ?? 0) + 1);
    }
  }

  for (const paper of papers) {
    const submitDay = toAppTime(paper.submittedAt).format('MM-DD');
    if (paperSubmissionTrendMap.has(submitDay)) {
      paperSubmissionTrendMap.set(submitDay, (paperSubmissionTrendMap.get(submitDay) ?? 0) + 1);
    }
    if (paper.reviewedAt && ['approved', 'rejected'].includes(paper.status)) {
      const reviewedDay = toAppTime(paper.reviewedAt).format('MM-DD');
      const entry = reviewTrendMap.get(reviewedDay);
      if (entry) {
        if (paper.status === 'approved') {
          entry.approved += 1;
        }
        if (paper.status === 'rejected') {
          entry.rejected += 1;
        }
      }
    }
  }

  const courseTypeMap = new Map<string, number>();
  for (const course of courses) {
    const type = course.courseType?.trim() || '未分类';
    courseTypeMap.set(type, (courseTypeMap.get(type) ?? 0) + 1);
  }

  const teacherPaperRanking = teacherUsers
    .map((teacher) => {
      const teacherPapers = papers.filter((paper) => paper.teacherId === teacher.id);
      const counts = toStatusCounts(teacherPapers);
      return {
        teacherId: teacher.id,
        teacherName: teacher.realName,
        departmentName: teacher.department?.name ?? null,
        submitted: teacherPapers.length,
        approved: counts.approved,
        rejected: counts.rejected,
        pending: counts.pending,
      };
    })
    .sort((left, right) => right.submitted - left.submitted || right.approved - left.approved)
    .slice(0, 8);

  const departmentProgress = departments.map((department) => {
    const counts = toStatusCounts(department.papers);
    const total = department.papers.length;
    const reviewed = counts.approved + counts.rejected;
    return {
      departmentId: department.id,
      departmentName: department.name,
      teacherCount: department.members.length,
      onlineTeachers: department.members.filter((member) => onlineUserIds.has(member.id)).length,
      courseCount: department.courses.length,
      total,
      approved: counts.approved,
      pending: counts.pending,
      rejected: counts.rejected,
      approvalRate: total ? Math.round((counts.approved / total) * 100) : 0,
      reviewedRate: total ? Math.round((reviewed / total) * 100) : 0,
      progress: total ? Math.round((counts.approved / total) * 100) : 0,
    };
  });

  return {
    currentSemesterName: currentSemester?.name ?? null,
    onlineCount: onlineSessions.length,
    totalUsers: users.length,
    totalTeachers: teacherUsers.length,
    totalDirectors: directorUsers.length,
    totalDepartments: departments.length,
    totalCourses: courses.length,
    totalPapers: papers.length,
    pendingCount: statusCounts.pending,
    approvedCount: statusCounts.approved,
    rejectedCount: statusCounts.rejected,
    paperStatusDistribution: PAPER_STATUSES.map((status) => ({
      status,
      value: statusCounts[status],
    })),
    departmentProgress,
    courseTypeDistribution: Array.from(courseTypeMap.entries()).map(([name, value]) => ({ name, value })),
    loginHourlyDistribution,
    loginTrend: Array.from(loginTrendMap.entries()).map(([date, value]) => ({ date, value })),
    paperSubmissionTrend: Array.from(paperSubmissionTrendMap.entries()).map(([date, value]) => ({ date, value })),
    reviewTrend: Array.from(reviewTrendMap.entries()).map(([date, value]) => ({ date, ...value })),
    teacherPaperRanking,
    recentLoginUsers: recentLoginLogs.map((log) => ({
      userId: log.userId,
      userName: log.userName,
      departmentName: users.find((user) => user.id === log.userId)?.department?.name ?? null,
      loginAt: formatIsoOffset(log.createdAt),
      ipAddress: log.ipAddress ?? null,
    })),
  };
}

export async function getAdminStats() {
  return collectBaseStats();
}

export async function getDirectorStats(userId: string, departmentId?: string | null) {
  const stats = await collectBaseStats();
  if (!departmentId) {
    return {
      ...stats,
      teamMembers: [],
      reviewedByCurrentDirector: 0,
    };
  }

  const [teachers, papers, onlineSessions] = await Promise.all([
    prisma.user.findMany({
      where: { departmentId },
      include: { roles: { include: { role: true } } },
      orderBy: { realName: 'asc' },
    }),
    prisma.examPaper.findMany({
      where: { departmentId },
    }),
    prisma.session.findMany({
      where: {
        isOnline: true,
        user: {
          departmentId,
        },
      },
      select: {
        userId: true,
      },
    }),
  ]);
  const onlineUserIds = new Set(onlineSessions.map((session) => session.userId));
  const last7Days = buildLastDays(7);

  const teamMembers = teachers.map((teacher) => ({
    id: teacher.id,
    realName: teacher.realName,
    username: teacher.username,
    roles: teacher.roles.map((entry) => entry.role.name).join(' / '),
    isOnline: onlineUserIds.has(teacher.id),
    lastLoginAt: teacher.lastLoginAt ? formatIsoOffset(teacher.lastLoginAt) : null,
  }));

  const departmentStatus = toStatusCounts(papers);
  const departmentSubmissionTrendMap = new Map(last7Days.map((date) => [date.format('MM-DD'), 0]));
  const departmentReviewTrendMap = new Map(last7Days.map((date) => [date.format('MM-DD'), { approved: 0, rejected: 0 }]));

  for (const paper of papers) {
    const submitDay = toAppTime(paper.submittedAt).format('MM-DD');
    if (departmentSubmissionTrendMap.has(submitDay)) {
      departmentSubmissionTrendMap.set(submitDay, (departmentSubmissionTrendMap.get(submitDay) ?? 0) + 1);
    }
    if (paper.reviewedAt && ['approved', 'rejected'].includes(paper.status)) {
      const reviewedDay = toAppTime(paper.reviewedAt).format('MM-DD');
      const entry = departmentReviewTrendMap.get(reviewedDay);
      if (entry) {
        if (paper.status === 'approved') {
          entry.approved += 1;
        }
        if (paper.status === 'rejected') {
          entry.rejected += 1;
        }
      }
    }
  }

  const currentDepartment = stats.departmentProgress.find((item) => item.departmentId === departmentId);

  return {
    ...stats,
    onlineCount: currentDepartment?.onlineTeachers ?? 0,
    pendingCount: departmentStatus.pending,
    approvedCount: departmentStatus.approved,
    rejectedCount: departmentStatus.rejected,
    totalCourses: currentDepartment?.courseCount ?? 0,
    totalPapers: papers.length,
    paperStatusDistribution: PAPER_STATUSES.map((status) => ({
      status,
      value: departmentStatus[status],
    })),
    paperSubmissionTrend: Array.from(departmentSubmissionTrendMap.entries()).map(([date, value]) => ({ date, value })),
    reviewTrend: Array.from(departmentReviewTrendMap.entries()).map(([date, value]) => ({ date, ...value })),
    departmentProgress: currentDepartment ? [currentDepartment] : [],
    teacherPaperRanking: stats.teacherPaperRanking.filter((item) => item.departmentName === currentDepartment?.departmentName),
    teamMembers,
    reviewedByCurrentDirector: await prisma.examPaper.count({
      where: { reviewerId: userId },
    }),
  };
}
