import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_PASSWORD, ROLE_CODES } from '@exam-workflow/shared';

const prisma = new PrismaClient();

const permissions = [
  ['user:view', '查看用户', 'users'],
  ['user:create', '创建用户', 'users'],
  ['user:update', '编辑用户', 'users'],
  ['user:delete', '删除用户', 'users'],
  ['user:assign-role', '分配角色', 'users'],
  ['semester:manage', '学期管理', 'semester'],
  ['department:manage', '教研室管理', 'department'],
  ['course:manage', '课程管理', 'course'],
  ['course:import', '课程导入', 'course'],
  ['paper:submit', '提交试卷', 'paper'],
  ['paper:review', '审核试卷', 'paper'],
  ['paper:view-all', '查看全部试卷', 'paper'],
  ['paper:download', '下载试卷', 'paper'],
  ['number-rule:manage', '编号规则管理', 'workflow'],
  ['audit:view', '查看审计日志', 'audit'],
  ['stats:view-admin', '查看管理员统计', 'stats'],
  ['stats:view-director', '查看主任统计', 'stats'],
  ['system:manage', '系统设置', 'system'],
];

async function main() {
  const password = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  const [adminRole, directorRole, academicDeanRole, teacherRole] = await Promise.all(
    ROLE_CODES.map((code, index) =>
      prisma.role.upsert({
        where: { code },
        update: {
          name:
            code === 'admin'
              ? '管理员'
              : code === 'director'
                ? '教研室主任'
                : code === 'academic_dean'
                  ? '教学院长'
                  : '教师',
          sortOrder: index,
        },
        create: {
          code,
          name:
            code === 'admin'
              ? '管理员'
              : code === 'director'
                ? '教研室主任'
                : code === 'academic_dean'
                  ? '教学院长'
                  : '教师',
          sortOrder: index,
        },
      }),
    ),
  );

  const permissionRecords = await Promise.all(
    permissions.map(([code, name, module]) =>
      prisma.permission.upsert({
        where: { code },
        update: { name, module },
        create: { code, name, module },
      }),
    ),
  );

  const permissionMap = new Map(permissionRecords.map((item) => [item.code, item.id]));
  const rolePermissionMap: Record<string, string[]> = {
    admin: permissions.map(([code]) => code),
    director: ['paper:review', 'paper:download', 'stats:view-director'],
    academic_dean: ['paper:review', 'paper:download', 'stats:view-director'],
    teacher: ['paper:submit', 'paper:download'],
  };

  for (const [roleCode, permissionCodes] of Object.entries(rolePermissionMap)) {
    const role = {
      admin: adminRole,
      director: directorRole,
      academic_dean: academicDeanRole,
      teacher: teacherRole,
    }[roleCode];
    if (!role) {
      continue;
    }
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissionCodes.map((permissionCode) => ({
        roleId: role.id,
        permissionId: permissionMap.get(permissionCode)!,
      })),
    });
  }

  const semester = await prisma.semester.upsert({
    where: { code: '2025-2026-2' },
    update: {
      name: '2025-2026 第二学期',
      isCurrent: true,
    },
    create: {
      code: '2025-2026-2',
      name: '2025-2026 第二学期',
      isCurrent: true,
    },
  });

  const department = await prisma.department.upsert({
    where: { code: 'CS' },
    update: {
      name: '计算机教研室',
      description: '软件工程与计算机基础课程组',
    },
    create: {
      code: 'CS',
      name: '计算机教研室',
      description: '软件工程与计算机基础课程组',
    },
  });

  const director = await prisma.user.upsert({
    where: { username: 'director' },
    update: {
      realName: '李主任',
      password,
      departmentId: department.id,
      email: 'director@example.com',
      status: true,
    },
    create: {
      username: 'director',
      realName: '李主任',
      password,
      departmentId: department.id,
      email: 'director@example.com',
      status: true,
    },
  });

  await prisma.department.update({
    where: { id: department.id },
    data: { directorId: director.id },
  });

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      realName: '系统管理员',
      password,
      email: 'admin@example.com',
      status: true,
    },
    create: {
      username: 'admin',
      realName: '系统管理员',
      password,
      email: 'admin@example.com',
      status: true,
    },
  });

  const teacher = await prisma.user.upsert({
    where: { username: 'teacher' },
    update: {
      realName: '张老师',
      password,
      departmentId: department.id,
      email: 'teacher@example.com',
      status: true,
    },
    create: {
      username: 'teacher',
      realName: '张老师',
      password,
      departmentId: department.id,
      email: 'teacher@example.com',
      status: true,
    },
  });

  const academicDean = await prisma.user.upsert({
    where: { username: 'academic_dean' },
    update: {
      realName: '王院长',
      password,
      email: 'academic_dean@example.com',
      status: true,
    },
    create: {
      username: 'academic_dean',
      realName: '王院长',
      password,
      email: 'academic_dean@example.com',
      status: true,
    },
  });

  const userRoleData = [
    [admin.id, adminRole.id],
    [director.id, directorRole.id],
    [academicDean.id, academicDeanRole.id],
    [teacher.id, teacherRole.id],
  ];

  for (const [userId, roleId] of userRoleData) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: {},
      create: { userId, roleId },
    });
  }

  const course = await prisma.course.upsert({
    where: {
      semesterId_courseCode_teacherId: {
        semesterId: semester.id,
        courseCode: 'CS101',
        teacherId: teacher.id,
      },
    },
    update: {
      courseName: '程序设计基础',
      departmentId: department.id,
      creditHours: 3,
      courseType: '必修',
    },
    create: {
      semesterId: semester.id,
      courseCode: 'CS101',
      courseName: '程序设计基础',
      teacherId: teacher.id,
      departmentId: department.id,
      creditHours: 3,
      courseType: '必修',
    },
  });

  const classNames = ['软件工程 2301', '计算机科学 2302'];
  for (const className of classNames) {
    await prisma.courseClass.upsert({
      where: {
        id: `${course.id}-${className}`,
      },
      update: {
        className,
      },
      create: {
        id: `${course.id}-${className}`,
        courseId: course.id,
        className,
      },
    });
  }

  await prisma.numberRule.upsert({
    where: { semesterId: semester.id },
    update: {
      prefix: 'SJ',
      separator: '-',
      dateFormat: 'YYYYMM',
      seqLength: 4,
      example: 'SJ-202603-0001',
    },
    create: {
      semesterId: semester.id,
      prefix: 'SJ',
      separator: '-',
      dateFormat: 'YYYYMM',
      seqLength: 4,
      example: 'SJ-202603-0001',
    },
  });

  await prisma.systemConfig.upsert({
    where: { key: 'system.name' },
    update: { value: '试卷工作流系统', description: '系统名称' },
    create: { key: 'system.name', value: '试卷工作流系统', description: '系统名称' },
  });

  console.log('Seed completed.');
  console.log('Admin   -> admin / 123456');
  console.log('Director-> director / 123456');
  console.log('Dean    -> academic_dean / 123456');
  console.log('Teacher -> teacher / 123456');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
