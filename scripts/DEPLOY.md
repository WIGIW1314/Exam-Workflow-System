# 一键脚本说明

## 1. 本地一键提交

PowerShell:

```powershell
.\scripts\git-quick-commit.ps1 -Message "feat: add deployment scripts"
```

CMD:

```bat
scripts\git-quick-commit.cmd "feat: add deployment scripts"
```

说明:

- 默认会 `git add -A`
- 默认会提交到当前分支
- 默认会推送到 `origin/<当前分支>`
- 如果不想推送，可以加 `-SkipPush`

## 2. 宝塔面板一键部署

在服务器项目目录执行:

```bash
bash scripts/bt-deploy.sh
```

如果需要脚本自动克隆仓库:

```bash
REPO_URL="https://github.com/WIGIW1314/Exam-Workflow-System.git" BRANCH="main" bash scripts/bt-deploy.sh
```

如果是首次部署并希望自动写入种子数据:

```bash
RUN_SEED=true bash scripts/bt-deploy.sh
```

可选环境变量:

- `APP_NAME`: 项目名，默认 `exam-workflow-system`
- `APP_ROOT`: 代码部署目录，默认 `/www/wwwroot/exam-workflow-system`
- `WEB_ROOT`: 前端静态资源目录，默认 `/www/wwwroot/exam-workflow-system-web`
- `REPO_URL`: Git 仓库地址
- `BRANCH`: 部署分支，默认 `main`
- `PORT`: 后端端口，默认 `3200`
- `DOMAIN`: 域名，默认 `_`
- `CORS_ORIGIN`: 前端访问地址，默认 `http://<DOMAIN>`
- `RUN_SEED`: 是否执行种子数据，默认 `false`
- `INSTALL_PM2`: 是否自动安装 PM2，默认 `true`

## 3. 宝塔 Nginx

参考配置文件:

[`scripts/baota-nginx.conf.example`](C:\Users\geyun\Documents\projects\Exam Workflow System\scripts\baota-nginx.conf.example)

重点:

- 站点根目录指向前端 `WEB_ROOT`
- `/api` 代理到 Node 服务
- `/socket.io` 打开 WebSocket 升级
