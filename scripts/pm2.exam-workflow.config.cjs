const path = require('node:path');

const appRoot = process.env.APP_ROOT || '/www/wwwroot/exam-workflow-system';

module.exports = {
  apps: [
    {
      name: process.env.PM2_APP_NAME || 'exam-workflow-server',
      cwd: appRoot,
      script: 'node',
      args: 'packages/server/dist/server/src/app.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '3000',
      },
      out_file: path.join(appRoot, 'logs', 'server.out.log'),
      error_file: path.join(appRoot, 'logs', 'server.error.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
