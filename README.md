# Exam Workflow System

试卷工作流系统是一套面向高校教务管理场景的全栈 Web 应用，用于实现试卷从出题、提交、审核、编号到归档的数字化闭环管理。

本项目已按 `pnpm workspace` 组织为 monorepo，包含：

- 前端：Vue 3 + TypeScript + Vite + Element Plus + Pinia + Vue Router + ECharts
- 后端：Express + TypeScript + Prisma + SQLite + Socket.IO
- 共享层：前后端共享类型、状态枚举、接口模型

## 1. 项目特性

- 角色体系：管理员、教研室主任、教师
- 认证能力：JWT 登录、角色切换、单端登录踢出
- 管理端：用户、学期、教研室、课程、编号规则、系统设置、审计日志
- 教师端：查看课程、设置班级分组、上传 DOCX 试卷、查看审核状态、下载带编号试卷
- 主任端：待审试卷列表、在线预览、通过/驳回、教研室数据总览
- 工作流能力：试卷版本递增、审核通过后自动生成编号、DOCX 注入编号
- 实时能力：在线状态、通知中心、试卷状态实时推送
- 数据能力：课程导入、试卷导出、审计日志导出
- 运维能力：SQLite 自动备份任务、PM2 启动配置、宝塔一键部署脚本

## 2. 试卷编号规则

已按当前确认方案实现：

- 注入位置：页眉右上角
- 展示形式：带框线文本框
- 内容格式：`试卷编号：xxxxxxxx`
- 字体：宋体
- 字号：小四对应的 Word 半磅值
- 实现方式：纯 JS 方式处理 DOCX 结构，不依赖 LibreOffice

核心实现文件：

- [packages/server/src/utils/docx.ts](C:\Users\geyun\Documents\projects\Exam Workflow System\packages\server\src\utils\docx.ts)
- [packages/server/src/services/paper-number-service.ts](C:\Users\geyun\Documents\projects\Exam Workflow System\packages\server\src\services\paper-number-service.ts)

## 3. 目录结构

```text
Exam Workflow System/
├─ package.json
├─ pnpm-workspace.yaml
├─ README.md
├─ scripts/
│  ├─ bt-deploy.sh
│  ├─ git-quick-commit.ps1
│  ├─ git-quick-commit.cmd
│  ├─ pm2.exam-workflow.config.cjs
│  ├─ baota-nginx.conf.example
│  └─ DEPLOY.md
├─ packages/
│  ├─ client/
│  ├─ server/
│  └─ shared/
└─ implementation_plan.md
```

## 4. 开发环境要求

- Node.js >= 20
- `corepack` 可用
- pnpm 10

推荐检查：

```bash
node -v
corepack pnpm -v
```

## 5. 安装与启动

### 5.1 安装依赖

```bash
corepack pnpm install
```

### 5.2 初始化数据库

```bash
corepack pnpm db:migrate
corepack pnpm db:seed
```

### 5.3 启动开发环境

```bash
corepack pnpm dev
```

启动后默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000`

### 5.4 构建生产版本

```bash
corepack pnpm build
```

### 5.5 类型检查

```bash
corepack pnpm type-check
```

## 6. 默认账号

种子数据会创建以下账号：

- 管理员：`admin / 123456`
- 教研室主任：`director / 123456`
- 教师：`teacher / 123456`

种子文件：

- [packages/server/prisma/seed.ts](C:\Users\geyun\Documents\projects\Exam Workflow System\packages\server\prisma\seed.ts)

## 7. 常用命令

根目录命令：

```bash
corepack pnpm dev
corepack pnpm build
corepack pnpm type-check
corepack pnpm db:migrate
corepack pnpm db:seed
```

脚本入口：

```bash
corepack pnpm git:quick
corepack pnpm deploy:bt
```

## 8. 环境配置

服务端环境变量文件：

- [packages/server/.env](C:\Users\geyun\Documents\projects\Exam Workflow System\packages\server\.env)
- [packages/server/.env.example](C:\Users\geyun\Documents\projects\Exam Workflow System\packages\server\.env.example)

主要变量：

- `DATABASE_URL`：SQLite 数据库地址
- `JWT_SECRET`：JWT 密钥
- `PORT`：后端端口
- `CORS_ORIGIN`：允许访问的前端域名

## 9. 主要页面与路由

管理员：

- `/admin/dashboard`
- `/admin/users`
- `/admin/semesters`
- `/admin/departments`
- `/admin/courses`
- `/admin/workflow`
- `/admin/papers`
- `/admin/audit-logs`
- `/admin/settings`

教师：

- `/teacher/courses`
- `/teacher/papers`
- `/teacher/profile`

主任：

- `/director/dashboard`
- `/director/reviews`
- `/director/data`
- `/director/profile`

路由文件：

- [packages/client/src/router/index.ts](C:\Users\geyun\Documents\projects\Exam Workflow System\packages\client\src\router\index.ts)

## 10. 核心接口前缀

统一前缀：

```text
/api/v1
```

主要模块：

- `/auth`
- `/users`
- `/semesters`
- `/departments`
- `/courses`
- `/papers`
- `/number-rules`
- `/stats`
- `/audit-logs`
- `/notifications`
- `/online`
- `/export`

## 11. 部署

### 11.1 宝塔面板一键部署

部署脚本：

- [scripts/bt-deploy.sh](C:\Users\geyun\Documents\projects\Exam Workflow System\scripts\bt-deploy.sh)

示例：

```bash
REPO_URL="https://github.com/WIGIW1314/Exam-Workflow-System.git" BRANCH="main" RUN_SEED=true bash scripts/bt-deploy.sh
```

该脚本会完成：

- 安装 Node.js / pnpm
- 克隆或更新仓库
- 安装依赖
- 同步数据库结构
- 可选执行种子数据
- 构建前后端
- 发布前端静态资源
- 使用 PM2 启动后端

### 11.2 PM2 配置

- [scripts/pm2.exam-workflow.config.cjs](C:\Users\geyun\Documents\projects\Exam Workflow System\scripts\pm2.exam-workflow.config.cjs)

### 11.3 宝塔 Nginx 示例

- [scripts/baota-nginx.conf.example](C:\Users\geyun\Documents\projects\Exam Workflow System\scripts\baota-nginx.conf.example)

### 11.4 部署说明文档

- [scripts/DEPLOY.md](C:\Users\geyun\Documents\projects\Exam Workflow System\scripts\DEPLOY.md)

## 12. 一键提交脚本

Windows 本地提交脚本：

- [scripts/git-quick-commit.ps1](C:\Users\geyun\Documents\projects\Exam Workflow System\scripts\git-quick-commit.ps1)
- [scripts/git-quick-commit.cmd](C:\Users\geyun\Documents\projects\Exam Workflow System\scripts\git-quick-commit.cmd)

示例：

```powershell
.\scripts\git-quick-commit.ps1 -Message "feat: update readme"
```

或：

```bat
scripts\git-quick-commit.cmd "feat: update readme"
```

## 13. 当前实现说明

当前仓库已经具备可运行的完整业务骨架和主流程实现，适合直接继续：

- 本地联调
- 教务流程试运行
- 服务器部署
- 后续按真实学校数据继续扩展

如果后续需要继续增强，优先建议：

- 补充更细粒度权限矩阵
- 增加更严格的表单校验与导入模板
- 增加自动化测试
- 优化前端构建产物体积
- 接入正式域名与 HTTPS

## 14. 参考文件

- 方案文档：[implementation_plan.md](C:\Users\geyun\Documents\projects\Exam Workflow System\implementation_plan.md)
- 根配置：[package.json](C:\Users\geyun\Documents\projects\Exam Workflow System\package.json)
- 前端入口：[packages/client/src/main.ts](C:\Users\geyun\Documents\projects\Exam Workflow System\packages\client\src\main.ts)
- 后端入口：[packages/server/src/app.ts](C:\Users\geyun\Documents\projects\Exam Workflow System\packages\server\src\app.ts)
- 数据库模型：[packages/server/prisma/schema.prisma](C:\Users\geyun\Documents\projects\Exam Workflow System\packages\server\prisma\schema.prisma)
