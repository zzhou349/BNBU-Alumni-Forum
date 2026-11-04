# 校友墙后端

基于 Node.js、Express 和 MySQL 的校友墙 API，覆盖用户、帖子、图片、评论、点赞、收藏、关注、浏览历史、搜索、私信、通知、举报、反馈、管理员和邮箱验证功能。

## 快速启动

```powershell
Copy-Item .env.example .env
npm install
npm start
```

默认监听 `http://127.0.0.1:3001`。数据库必须先按上一级 `数据库` 目录的说明初始化。

## 命令

- `npm start`：普通启动
- `npm run dev`：监听文件变化并自动重启
- `npm run smoke`：运行完整接口冒烟测试（要求服务已经启动）
- `npm run migrate:phase3`：旧版数据库补充第三阶段表结构
- `npm run migrate:phase4`：旧版数据库补充第四阶段通知已读字段

全新安装直接执行 `数据库/01_完整表结构.sql`，无需再运行阶段迁移。

## 配置

全部配置位于 `.env`。不要提交包含真实数据库密码或 SMTP 密码的 `.env`；模板见 `.env.example`。

