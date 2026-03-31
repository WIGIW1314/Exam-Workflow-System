import type { Prisma } from '@prisma/client';

export function mapUserSummary(
  user: Prisma.UserGetPayload<{
    include: { roles: { include: { role: true } }; department: true };
  }>,
) {
  return {
    id: user.id,
    username: user.username,
    realName: user.realName,
    email: user.email,
    phone: user.phone,
    departmentId: user.departmentId,
    departmentName: user.department?.name ?? null,
    status: user.status,
    avatar: user.avatar,
    roles: user.roles.map((entry) => ({
      id: entry.role.id,
      code: entry.role.code,
      name: entry.role.name,
    })),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

export function mapCourseSummary(
  course: Prisma.CourseGetPayload<{
    include: {
      semester: true;
      teacher: true;
      department: true;
      classes: true;
    };
  }>,
) {
  return {
    id: course.id,
    semesterId: course.semesterId,
    semesterName: course.semester.name,
    courseCode: course.courseCode,
    courseName: course.courseName,
    teacherId: course.teacherId,
    teacherName: course.teacher.realName,
    departmentId: course.departmentId,
    departmentName: course.department.name,
    creditHours: course.creditHours,
    courseType: course.courseType,
    classes: course.classes.map((item) => ({ id: item.id, className: item.className })),
  };
}

export function mapPaperSummary(
  paper: Prisma.ExamPaperGetPayload<{
    include: {
      course: true;
      semester: true;
      teacher: true;
      department: true;
      reviewer: true;
      classGroups: { include: { courseClass: true } };
    };
  }>,
) {
  return {
    id: paper.id,
    courseId: paper.courseId,
    courseName: paper.course.courseName,
    courseCode: paper.course.courseCode,
    semesterId: paper.semesterId,
    semesterName: paper.semester.name,
    teacherId: paper.teacherId,
    teacherName: paper.teacher.realName,
    departmentId: paper.departmentId,
    departmentName: paper.department.name,
    classGroups: paper.classGroups.map((item) => ({
      id: item.courseClass.id,
      className: item.courseClass.className,
    })),
    version: paper.version,
    originalFileName: paper.originalFileName,
    approvedFilePath: paper.approvedFilePath,
    paperNumber: paper.paperNumber,
    status: paper.status,
    rejectReason: paper.rejectReason,
    reviewerId: paper.reviewerId,
    reviewerName: paper.reviewer?.realName ?? null,
    reviewedAt: paper.reviewedAt?.toISOString() ?? null,
    submittedAt: paper.submittedAt.toISOString(),
    previewHtml: paper.previewHtml,
    fileHash: paper.fileHash,
  };
}
