'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const config = {
  host: process.env.HOST || '0.0.0.0',
  port: number(process.env.PORT, 3001),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${number(process.env.PORT, 3001)}`,
  uploadDir: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads'),
  maxUploadBytes: number(process.env.MAX_UPLOAD_MB, 10) * 1024 * 1024,
  emailMode: (process.env.EMAIL_MODE || 'mock').toLowerCase(),
  emailAllowedDomains: (process.env.EMAIL_ALLOWED_DOMAINS || 'mail.uic.edu.cn,alumni.uic.edu.cn')
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
  emailCodeExpireMinutes: number(process.env.EMAIL_CODE_EXPIRE_MINUTES, 5),
  emailSendIntervalSeconds: number(process.env.EMAIL_SEND_INTERVAL_SECONDS, 60),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: number(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'alumni_dev',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'alumni_wall',
    connectionLimit: number(process.env.DB_CONNECTION_LIMIT, 10),
    charset: 'utf8mb4',
    timezone: '+08:00'
  }
};

function number(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveInt(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function pagination(query, defaultSize = 10, maxSize = 50) {
  const page = positiveInt(query.page, 1);
  const pageSize = Math.min(positiveInt(query.pageSize, defaultSize), maxSize);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function ok(res, data = null, extra = {}) {
  return res.json({ code: 200, message: 'success', data, ...extra });
}

function fail(res, status, message) {
  return res.status(status).json({ code: status, message });
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function conversationId(first, second) {
  return [Number(first), Number(second)].sort((a, b) => a - b).join('_');
}

function allowedSchoolEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  return at > 0 && config.emailAllowedDomains.includes(normalized.slice(at + 1));
}

fs.mkdirSync(config.uploadDir, { recursive: true });

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  decimalNumbers: true
});

async function transaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, config.uploadDir),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    callback(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${allowed.includes(extension) ? extension : '.bin'}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, callback) => {
    if (!/^image\//.test(file.mimetype || '')) return callback(new Error('只允许上传图片'));
    callback(null, true);
  }
});

async function loadImages(postIds) {
  if (!postIds.length) return new Map();
  const placeholders = postIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT post_id, file_path FROM post_images WHERE post_id IN (${placeholders}) ORDER BY post_id, sort_order, id`,
    postIds
  );
  const images = new Map(postIds.map((id) => [Number(id), []]));
  for (const row of rows) images.get(Number(row.post_id))?.push(row.file_path);
  return images;
}

function mapPost(row, images) {
  return {
    post_id: Number(row.post_id),
    id: Number(row.post_id),
    user_id: Number(row.user_id),
    userId: Number(row.user_id),
    username: row.username,
    author: row.username,
    avatar: row.avatar || '/assets/avatar.png',
    title: row.title,
    post_content: row.post_content,
    content: row.post_content,
    zone_id: Number(row.zone_id),
    zone: row.zone,
    zone_name: row.zone,
    images: images.get(Number(row.post_id)) || [],
    like_count: Number(row.like_count || 0),
    likeCount: Number(row.like_count || 0),
    collect_count: Number(row.collect_count || 0),
    collectCount: Number(row.collect_count || 0),
    comment_count: Number(row.comment_count || 0),
    commentCount: Number(row.comment_count || 0),
    is_liked: Boolean(row.is_liked),
    isLiked: Boolean(row.is_liked),
    is_collected: Boolean(row.is_collected),
    isCollected: Boolean(row.is_collected),
    created_at: row.created_at,
    time: row.created_at
  };
}

async function queryPosts({ where = 'p.status = \'published\'', params = [], userId = 0, order = 'p.created_at DESC', page = 1, pageSize = 10 }) {
  const safeUserId = positiveInt(userId, 0);
  const offset = (page - 1) * pageSize;
  const baseFrom = `
    FROM posts p
    JOIN users u ON u.id = p.user_id
    JOIN zones z ON z.id = p.zone_id
    LEFT JOIN post_actions pa ON pa.post_id = p.id AND pa.user_id = ?
    WHERE ${where}`;
  const [rows] = await pool.execute(
    `SELECT p.id AS post_id, p.user_id, p.zone_id, p.title, p.content AS post_content,
            p.like_count, p.collect_count, p.comment_count, p.created_at,
            u.nickname AS username, u.avatar, z.name AS zone,
            COALESCE(pa.is_liked, 0) AS is_liked, COALESCE(pa.is_collected, 0) AS is_collected
     ${baseFrom} ORDER BY ${order} LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}`,
    [safeUserId, ...params]
  );
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM posts p WHERE ${where}`,
    params
  );
  const images = await loadImages(rows.map((row) => row.post_id));
  return { posts: rows.map((row) => mapPost(row, images)), total: Number(countRows[0].total || 0) };
}

async function getPostOwner(connection, postId) {
  const [rows] = await connection.execute('SELECT user_id FROM posts WHERE id = ? AND status = \'published\'', [postId]);
  return rows[0] ? Number(rows[0].user_id) : null;
}

async function requireAdmin(userId, connection = pool) {
  if (!userId) return false;
  const [rows] = await connection.execute('SELECT role FROM users WHERE id = ?', [userId]);
  return rows[0]?.role === 'admin';
}

async function addActivity(connection, { recipientId, actorId, postId = null, commentId = null, type, content = '' }) {
  if (!recipientId || recipientId === actorId) return;
  await connection.execute(
    `INSERT INTO activities (recipient_id, actor_id, post_id, comment_id, activity_type, content)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [recipientId, actorId, postId, commentId, type, String(content).slice(0, 255)]
  );
}

function createMailer() {
  if (config.emailMode !== 'smtp') return null;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error('EMAIL_MODE=smtp 时必须配置 SMTP_HOST/SMTP_USER/SMTP_PASS');
  return nodemailer.createTransport({
    host,
    port: number(process.env.SMTP_PORT, 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: { user, pass }
  });
}

const mailer = createMailer();
const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use('/images', express.static(config.uploadDir, { maxAge: '1h', fallthrough: false }));

app.get('/health', asyncRoute(async (_req, res) => {
  const [rows] = await pool.query('SELECT 1 AS healthy');
  ok(res, { service: 'alumni-wall-api', database: rows[0].healthy === 1, emailMode: config.emailMode });
}));

app.post('/register', asyncRoute(async (req, res) => {
  const account = String(req.body.account || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const nickname = String(req.body.nickname || account.split('@')[0] || '').trim();
  const avatar = String(req.body.avatar || '/assets/avatar.png').trim();
  const bio = String(req.body.bio || '').trim();
  if (!account || !password || !nickname) return fail(res, 400, '账号、密码和昵称不能为空');
  if (password.length < 6) return fail(res, 400, '密码长度至少为6位');
  if (account.length > 100 || nickname.length > 50 || bio.length > 255) return fail(res, 400, '输入内容过长');
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const [result] = await pool.execute(
      'INSERT INTO users (account, password_hash, nickname, avatar, bio) VALUES (?, ?, ?, ?, ?)',
      [account, passwordHash, nickname, avatar, bio]
    );
    ok(res, { id: Number(result.insertId), user_id: Number(result.insertId) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return fail(res, 400, '账号已存在');
    throw error;
  }
}));

app.post('/login', asyncRoute(async (req, res) => {
  const account = String(req.body.account || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const [rows] = await pool.execute('SELECT * FROM users WHERE account = ?', [account]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return fail(res, 400, '账号或密码错误');
  ok(res, {
    id: Number(user.id), user_id: Number(user.id), user_username: user.account,
    user_nickname: user.nickname, avatar: user.avatar, bio: user.bio,
    school_email: user.school_email, school_email_verified: Boolean(user.school_email_verified),
    role: user.role || 'user', isAdmin: user.role === 'admin'
  });
}));

app.post('/change-password', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.body.userId || req.body.user_id);
  const oldPassword = String(req.body.oldPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (!userId || !oldPassword || !newPassword) return fail(res, 400, '密码参数不完整');
  if (newPassword.length < 6 || newPassword.length > 72) return fail(res, 400, '新密码长度应为6至72位');
  const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!rows[0] || !(await bcrypt.compare(oldPassword, rows[0].password_hash))) return fail(res, 400, '原密码错误');
  if (await bcrypt.compare(newPassword, rows[0].password_hash)) return fail(res, 400, '新密码不能与原密码相同');
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
  ok(res, { userId });
}));

app.get('/user/follows', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.query.userId);
  const { page, pageSize, offset } = pagination(req.query);
  if (!userId) return fail(res, 400, '无效的用户ID');
  const [rows] = await pool.execute(
    `SELECT u.id, u.id AS user_id, u.nickname, u.nickname AS user_nickname, u.avatar, u.bio,
            f.created_at AS follow_time,
            (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.status = 'published') AS post_count
     FROM follows f JOIN users u ON u.id = f.followed_id
     WHERE f.follower_id = ? ORDER BY f.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    [userId]
  );
  const [countRows] = await pool.execute('SELECT COUNT(*) AS total FROM follows WHERE follower_id = ?', [userId]);
  const total = Number(countRows[0].total);
  ok(res, rows, { total, hasMore: page * pageSize < total });
}));

app.get('/user/:id/following', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.params.id);
  const currentUserId = positiveInt(req.query.currentUserId, 0);
  const { page, pageSize, offset } = pagination(req.query);
  if (!userId) return fail(res, 400, '用户ID无效');
  const [rows] = await pool.execute(
    `SELECT u.id, u.id AS user_id, u.nickname, u.nickname AS user_nickname, u.avatar, u.bio,
            f.created_at AS follow_time,
            (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.status = 'published') AS post_count,
            EXISTS(SELECT 1 FROM follows mine WHERE mine.follower_id = ? AND mine.followed_id = u.id) AS is_following
     FROM follows f JOIN users u ON u.id = f.followed_id
     WHERE f.follower_id = ? ORDER BY f.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    [currentUserId, userId]
  );
  const [counts] = await pool.execute('SELECT COUNT(*) AS total FROM follows WHERE follower_id = ?', [userId]);
  const total = Number(counts[0].total);
  ok(res, rows, { total, hasMore: page * pageSize < total });
}));

app.get('/user/:id/followers', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.params.id);
  const currentUserId = positiveInt(req.query.currentUserId, 0);
  const { page, pageSize, offset } = pagination(req.query);
  if (!userId) return fail(res, 400, '用户ID无效');
  const [rows] = await pool.execute(
    `SELECT u.id, u.id AS user_id, u.nickname, u.nickname AS user_nickname, u.avatar, u.bio,
            f.created_at AS follow_time,
            (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.status = 'published') AS post_count,
            EXISTS(SELECT 1 FROM follows mine WHERE mine.follower_id = ? AND mine.followed_id = u.id) AS is_following
     FROM follows f JOIN users u ON u.id = f.follower_id
     WHERE f.followed_id = ? ORDER BY f.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    [currentUserId, userId]
  );
  const [counts] = await pool.execute('SELECT COUNT(*) AS total FROM follows WHERE followed_id = ?', [userId]);
  const total = Number(counts[0].total);
  ok(res, rows, { total, hasMore: page * pageSize < total });
}));

app.get('/user/:id', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.params.id);
  const currentUserId = positiveInt(req.query.currentUserId, 0);
  if (!userId) return fail(res, 400, '无效的用户ID');
  const [rows] = await pool.execute(
    `SELECT u.id, u.account, u.nickname, u.avatar, u.bio, u.school_email, u.school_email_verified, u.role,
            (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.status = 'published') AS post_count,
            (SELECT COUNT(*) FROM follows f WHERE f.followed_id = u.id) AS followers_count,
            (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) AS following_count,
            EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followed_id = u.id) AS is_following
     FROM users u WHERE u.id = ?`,
    [currentUserId, userId]
  );
  if (!rows[0]) return fail(res, 404, '用户不存在');
  const user = rows[0];
  const nested = { userId, id: userId, username: user.nickname, user_nickname: user.nickname, avatar: user.avatar, bio: user.bio, role: user.role, isAdmin: user.role === 'admin' };
  ok(res, {
    id: userId, user_id: userId, user_username: user.account, user_nickname: user.nickname,
    avatar: user.avatar, bio: user.bio, school_email: user.school_email,
    school_email_verified: Boolean(user.school_email_verified), role: user.role, isAdmin: user.role === 'admin', user: nested,
    postCount: Number(user.post_count), followersCount: Number(user.followers_count),
    followingCount: Number(user.following_count), isFollowing: Boolean(user.is_following)
  });
}));

app.post('/update-profile', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.body.id);
  const nickname = String(req.body.nickname || '').trim();
  const avatar = String(req.body.avatar || '/assets/avatar.png').trim();
  const bio = String(req.body.bio || '').trim();
  if (!userId || !nickname) return fail(res, 400, '用户ID和昵称不能为空');
  const [result] = await pool.execute('UPDATE users SET nickname = ?, avatar = ?, bio = ? WHERE id = ?', [nickname, avatar, bio, userId]);
  if (!result.affectedRows) return fail(res, 404, '用户不存在');
  ok(res, { id: userId, user_id: userId, user_nickname: nickname, nickname, avatar, bio });
}));

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return fail(res, 400, '未收到上传文件');
  const imageUrl = `${config.publicBaseUrl}/images/${encodeURIComponent(req.file.filename)}`;
  // 兼容现有小程序的两个上传调用约定：旧页面读取顶层字段，
  // 新代码读取 data 字段。后续前端统一后可以移除顶层兼容字段。
  res.json({
    code: 200,
    message: 'success',
    filePath: req.file.filename,
    imageUrl,
    data: { filePath: req.file.filename, imageUrl }
  });
});

app.get('/zone', asyncRoute(async (_req, res) => {
  const [rows] = await pool.query('SELECT id AS zone_id, name AS zone_name FROM zones ORDER BY id');
  ok(res, rows);
}));

app.post('/create-post', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.body.user_id);
  const zoneId = positiveInt(req.body.zone_id);
  const title = String(req.body.title || '').trim();
  const content = String(req.body.content || req.body.post_content || '').trim();
  const picturePaths = Array.isArray(req.body.picturePaths) ? req.body.picturePaths.filter(Boolean).slice(0, 9) : [];
  if (!userId || !zoneId || !title || !content) return fail(res, 400, '用户、专区、标题和内容不能为空');
  const postId = await transaction(async (connection) => {
    const [result] = await connection.execute('INSERT INTO posts (user_id, zone_id, title, content) VALUES (?, ?, ?, ?)', [userId, zoneId, title, content]);
    for (let index = 0; index < picturePaths.length; index += 1) {
      await connection.execute('INSERT INTO post_images (post_id, file_path, sort_order) VALUES (?, ?, ?)', [result.insertId, String(picturePaths[index]), index]);
    }
    return Number(result.insertId);
  });
  ok(res, { id: postId, post_id: postId });
}));

app.put('/posts/:id', asyncRoute(async (req, res) => {
  const postId = positiveInt(req.params.id);
  const userId = positiveInt(req.body.userId || req.body.user_id);
  const zoneId = positiveInt(req.body.zone_id || req.body.zoneId);
  const title = String(req.body.title || '').trim();
  const content = String(req.body.content || req.body.post_content || '').trim();
  const picturePaths = Array.isArray(req.body.picturePaths)
    ? req.body.picturePaths.filter(Boolean).map(String).slice(0, 9)
    : [];
  if (!postId || !userId || !zoneId || !title || !content) return fail(res, 400, '帖子编辑参数不完整');
  if (title.length > 150) return fail(res, 400, '帖子标题不能超过150字');
  const updated = await transaction(async (connection) => {
    const [result] = await connection.execute(
      `UPDATE posts SET zone_id = ?, title = ?, content = ?, updated_at = NOW()
       WHERE id = ? AND user_id = ? AND status = 'published'`,
      [zoneId, title, content, postId, userId]
    );
    if (!result.affectedRows) return false;
    await connection.execute('DELETE FROM post_images WHERE post_id = ?', [postId]);
    for (let index = 0; index < picturePaths.length; index += 1) {
      await connection.execute(
        'INSERT INTO post_images (post_id, file_path, sort_order) VALUES (?, ?, ?)',
        [postId, picturePaths[index], index]
      );
    }
    return true;
  });
  if (!updated) return fail(res, 403, '帖子不存在或无权编辑');
  ok(res, { postId });
}));

app.get('/posts', asyncRoute(async (req, res) => {
  const { page, pageSize } = pagination(req.query, 20, 50);
  const result = await queryPosts({ userId: req.query.userId, page, pageSize });
  ok(res, result.posts, { total: result.total, hasMore: page * pageSize < result.total });
}));

app.get(['/zone-posts/:zoneId', '/zones/:zoneId/posts'], asyncRoute(async (req, res) => {
  const zoneId = positiveInt(req.params.zoneId);
  if (!zoneId) return fail(res, 400, '无效的专区ID');
  const { page, pageSize } = pagination(req.query);
  const result = await queryPosts({ where: 'p.status = \'published\' AND p.zone_id = ?', params: [zoneId], userId: req.query.userId, page, pageSize });
  ok(res, result.posts, { total: result.total, hasMore: page * pageSize < result.total });
}));

app.get('/popular-posts', asyncRoute(async (req, res) => {
  const { page, pageSize } = pagination(req.query);
  const minLikes = Math.max(number(req.query.minLikes, 0), 0);
  const order = req.query.sortBy === 'time' ? 'p.created_at DESC' : 'p.like_count DESC, p.created_at DESC';
  const result = await queryPosts({ where: 'p.status = \'published\' AND p.like_count >= ?', params: [minLikes], userId: req.query.userId, page, pageSize, order });
  ok(res, result.posts, { total: result.total, hasMore: page * pageSize < result.total });
}));

app.get('/search/posts', asyncRoute(async (req, res) => {
  const keyword = String(req.query.keyword || '').trim();
  const { page, pageSize } = pagination(req.query);
  if (!keyword) return ok(res, [], { total: 0, hasMore: false });
  const like = `%${keyword}%`;
  const result = await queryPosts({
    where: 'p.status = \'published\' AND (p.title LIKE ? OR p.content LIKE ?)',
    params: [like, like], userId: req.query.userId, page, pageSize
  });
  ok(res, result.posts, { total: result.total, hasMore: page * pageSize < result.total });
}));

app.get('/search/users', asyncRoute(async (req, res) => {
  const keyword = String(req.query.keyword || '').trim();
  if (!keyword) return ok(res, []);
  const [rows] = await pool.execute(
    `SELECT id, id AS user_id, nickname, nickname AS user_nickname, nickname AS username, avatar, bio
     FROM users WHERE nickname LIKE ? OR account LIKE ? ORDER BY nickname LIMIT 50`,
    [`%${keyword}%`, `%${keyword}%`]
  );
  ok(res, rows);
}));

app.get('/post/:id', asyncRoute(async (req, res) => {
  const postId = positiveInt(req.params.id);
  if (!postId) return fail(res, 400, '无效的帖子ID');
  const result = await queryPosts({ where: 'p.status = \'published\' AND p.id = ?', params: [postId], userId: req.query.userId, page: 1, pageSize: 1 });
  if (!result.posts[0]) return fail(res, 404, '帖子不存在');
  const post = result.posts[0];
  ok(res, {
    id: post.id, title: post.title, author: post.username, author_id: post.user_id,
    userId: post.user_id, avatar: post.avatar, time: post.created_at, content: post.content,
    images: post.images, zone: post.zone, zone_id: post.zone_id, like_count: post.like_count,
    collect_count: post.collect_count, comment_count: post.comment_count,
    isLiked: post.isLiked, isCollected: post.isCollected
  });
}));

app.delete('/posts/:id', asyncRoute(async (req, res) => {
  const postId = positiveInt(req.params.id);
  const userId = positiveInt(req.body.userId || req.query.userId);
  if (!postId || !userId) return fail(res, 400, '缺少帖子ID或用户ID');
  const [result] = await pool.execute('UPDATE posts SET status = \'deleted\' WHERE id = ? AND user_id = ? AND status <> \'deleted\'', [postId, userId]);
  if (!result.affectedRows) return fail(res, 403, '帖子不存在或无权删除');
  ok(res, { postId });
}));

app.post('/posts/:id/interact', asyncRoute(async (req, res) => {
  const postId = positiveInt(req.params.id);
  const userId = positiveInt(req.body.userId);
  const actionType = String(req.body.actionType || '');
  if (!postId || !userId || !['like', 'unlike', 'collect', 'uncollect'].includes(actionType)) return fail(res, 400, '互动参数无效');
  const state = await transaction(async (connection) => {
    const [postRows] = await connection.execute('SELECT user_id, like_count, collect_count FROM posts WHERE id = ? AND status = \'published\' FOR UPDATE', [postId]);
    if (!postRows[0]) return null;
    const [actionRows] = await connection.execute('SELECT is_liked, is_collected FROM post_actions WHERE user_id = ? AND post_id = ? FOR UPDATE', [userId, postId]);
    const previous = actionRows[0] || { is_liked: 0, is_collected: 0 };
    const nextLiked = actionType === 'like' ? 1 : actionType === 'unlike' ? 0 : Number(previous.is_liked);
    const nextCollected = actionType === 'collect' ? 1 : actionType === 'uncollect' ? 0 : Number(previous.is_collected);
    const likeDelta = nextLiked - Number(previous.is_liked);
    const collectDelta = nextCollected - Number(previous.is_collected);
    await connection.execute(
      `INSERT INTO post_actions (user_id, post_id, is_liked, is_collected) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_liked = VALUES(is_liked), is_collected = VALUES(is_collected)`,
      [userId, postId, nextLiked, nextCollected]
    );
    await connection.execute(
      'UPDATE posts SET like_count = GREATEST(0, like_count + ?), collect_count = GREATEST(0, collect_count + ?) WHERE id = ?',
      [likeDelta, collectDelta, postId]
    );
    if (likeDelta > 0) await addActivity(connection, { recipientId: Number(postRows[0].user_id), actorId: userId, postId, type: 'like' });
    if (collectDelta > 0) await addActivity(connection, { recipientId: Number(postRows[0].user_id), actorId: userId, postId, type: 'collect' });
    return { isLiked: Boolean(nextLiked), isCollected: Boolean(nextCollected), likeCount: Number(postRows[0].like_count) + likeDelta, collectCount: Number(postRows[0].collect_count) + collectDelta };
  });
  if (!state) return fail(res, 404, '帖子不存在');
  ok(res, state);
}));

app.get('/posts/:postId/comments', asyncRoute(async (req, res) => {
  const postId = positiveInt(req.params.postId);
  const userId = positiveInt(req.query.userId, 0);
  if (!postId) return fail(res, 400, '无效的帖子ID');
  const [rows] = await pool.execute(
    `SELECT c.id, c.post_id, c.user_id, c.parent_id, c.content, c.like_count AS likeCount, c.created_at,
            u.nickname AS username, u.avatar,
            EXISTS(SELECT 1 FROM comment_likes cl WHERE cl.comment_id = c.id AND cl.user_id = ?) AS isLiked
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ? AND c.status = 'published' ORDER BY c.created_at ASC`,
    [userId, postId]
  );
  const byId = new Map(rows.map((row) => [Number(row.id), { ...row, id: Number(row.id), post_id: Number(row.post_id), user_id: Number(row.user_id), parent_id: row.parent_id ? Number(row.parent_id) : null, likeCount: Number(row.likeCount), isLiked: Boolean(row.isLiked), replies: [] }]));
  const roots = [];
  for (const comment of byId.values()) {
    if (comment.parent_id && byId.has(comment.parent_id)) byId.get(comment.parent_id).replies.push(comment);
    else roots.push(comment);
  }
  roots.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  ok(res, roots);
}));

app.post('/posts/:postId/comments', asyncRoute(async (req, res) => {
  const postId = positiveInt(req.params.postId);
  const userId = positiveInt(req.body.userId);
  const parentId = positiveInt(req.body.parentId, null);
  const content = String(req.body.content || '').trim();
  if (!postId || !userId || !content) return fail(res, 400, '评论参数不完整');
  const comment = await transaction(async (connection) => {
    const ownerId = await getPostOwner(connection, postId);
    if (!ownerId) return null;
    let recipientId = ownerId;
    if (parentId) {
      const [parentRows] = await connection.execute('SELECT user_id, post_id FROM comments WHERE id = ? AND status = \'published\'', [parentId]);
      if (!parentRows[0] || Number(parentRows[0].post_id) !== postId) throw Object.assign(new Error('父评论不存在'), { status: 400 });
      recipientId = Number(parentRows[0].user_id);
    }
    const [result] = await connection.execute('INSERT INTO comments (post_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)', [postId, userId, parentId, content]);
    await connection.execute('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?', [postId]);
    await addActivity(connection, { recipientId, actorId: userId, postId, commentId: Number(result.insertId), type: parentId ? 'reply' : 'comment', content });
    const [rows] = await connection.execute('SELECT c.id, c.post_id, c.user_id, c.parent_id, c.content, c.like_count AS likeCount, c.created_at, u.nickname AS username, u.avatar FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?', [result.insertId]);
    return { ...rows[0], id: Number(rows[0].id), likeCount: 0, isLiked: false, replies: [] };
  });
  if (!comment) return fail(res, 404, '帖子不存在');
  ok(res, { comment, shouldUpdate: Boolean(parentId) });
}));

app.post('/comments/:commentId/like', asyncRoute(async (req, res) => {
  const commentId = positiveInt(req.params.commentId);
  const userId = positiveInt(req.body.userId);
  const shouldLike = Boolean(req.body.like);
  if (!commentId || !userId) return fail(res, 400, '点赞参数不完整');
  const likeCount = await transaction(async (connection) => {
    const [rows] = await connection.execute('SELECT like_count FROM comments WHERE id = ? AND status = \'published\' FOR UPDATE', [commentId]);
    if (!rows[0]) return null;
    const [existing] = await connection.execute('SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?', [commentId, userId]);
    const delta = shouldLike && !existing.length ? 1 : !shouldLike && existing.length ? -1 : 0;
    if (shouldLike) await connection.execute('INSERT IGNORE INTO comment_likes (comment_id, user_id) VALUES (?, ?)', [commentId, userId]);
    else await connection.execute('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?', [commentId, userId]);
    if (delta) await connection.execute('UPDATE comments SET like_count = GREATEST(0, like_count + ?) WHERE id = ?', [delta, commentId]);
    return Number(rows[0].like_count) + delta;
  });
  if (likeCount === null) return fail(res, 404, '评论不存在');
  ok(res, { isLiked: shouldLike, likeCount });
}));

app.delete('/comments/:commentId', asyncRoute(async (req, res) => {
  const commentId = positiveInt(req.params.commentId);
  const userId = positiveInt(req.body.userId || req.query.userId);
  if (!commentId || !userId) return fail(res, 400, '缺少评论ID或用户ID');
  const deleted = await transaction(async (connection) => {
    const [rows] = await connection.execute('SELECT post_id, user_id FROM comments WHERE id = ? AND status = \'published\' FOR UPDATE', [commentId]);
    if (!rows[0] || Number(rows[0].user_id) !== userId) return false;
    const [countRows] = await connection.execute('SELECT COUNT(*) AS count FROM comments WHERE (id = ? OR parent_id = ?) AND status = \'published\'', [commentId, commentId]);
    await connection.execute('UPDATE comments SET status = \'deleted\' WHERE id = ? OR parent_id = ?', [commentId, commentId]);
    await connection.execute('UPDATE posts SET comment_count = GREATEST(0, comment_count - ?) WHERE id = ?', [Number(countRows[0].count), rows[0].post_id]);
    return { deletedCount: Number(countRows[0].count) };
  });
  if (!deleted) return fail(res, 403, '评论不存在或无权删除');
  ok(res, { commentId, deletedCount: deleted.deletedCount });
}));

app.post('/follow', asyncRoute(async (req, res) => {
  const followerId = positiveInt(req.body.followerId);
  const followedId = positiveInt(req.body.followedId);
  const action = String(req.body.action || 'follow');
  if (!followerId || !followedId || followerId === followedId || !['follow', 'unfollow'].includes(action)) return fail(res, 400, '关注参数无效');
  if (action === 'follow') {
    await transaction(async (connection) => {
      await connection.execute('INSERT IGNORE INTO follows (follower_id, followed_id) VALUES (?, ?)', [followerId, followedId]);
      await addActivity(connection, { recipientId: followedId, actorId: followerId, type: 'follow' });
    });
  } else {
    await pool.execute('DELETE FROM follows WHERE follower_id = ? AND followed_id = ?', [followerId, followedId]);
  }
  ok(res, { isFollowing: action === 'follow' });
}));

app.get('/user/:id/myposts', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.params.id);
  if (!userId) return fail(res, 400, '无效的用户ID');
  const { page, pageSize } = pagination(req.query);
  const result = await queryPosts({ where: 'p.status = \'published\' AND p.user_id = ?', params: [userId], userId: req.query.currentUserId || userId, page, pageSize });
  ok(res, result.posts, { total: result.total, hasMore: page * pageSize < result.total });
}));

app.get('/user/:id/collected-posts', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.params.id);
  if (!userId) return fail(res, 400, '无效的用户ID');
  const { page, pageSize } = pagination(req.query);
  const result = await queryPosts({
    where: 'p.status = \'published\' AND EXISTS(SELECT 1 FROM post_actions x WHERE x.post_id = p.id AND x.user_id = ? AND x.is_collected = 1)',
    params: [userId], userId, page, pageSize
  });
  ok(res, result.posts, { total: result.total, hasMore: page * pageSize < result.total });
}));

app.post('/track-browsing', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.body.userId);
  const postId = positiveInt(req.body.postId);
  if (!userId || !postId) return fail(res, 400, '浏览记录参数无效');
  await pool.execute(
    `INSERT INTO browsing_history (user_id, post_id, browsed_at) VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE browsed_at = NOW()`,
    [userId, postId]
  );
  ok(res, { userId, postId });
}));

app.get('/user/:id/browsing-history', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.params.id);
  const { page, pageSize, offset } = pagination(req.query);
  if (!userId) return fail(res, 400, '无效的用户ID');
  const [rows] = await pool.execute(
    `SELECT h.id AS history_id, h.post_id, h.browsed_at, p.title, u.nickname AS author
     FROM browsing_history h JOIN posts p ON p.id = h.post_id JOIN users u ON u.id = p.user_id
     WHERE h.user_id = ? AND p.status = 'published' ORDER BY h.browsed_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    [userId]
  );
  const [countRows] = await pool.execute('SELECT COUNT(*) AS total FROM browsing_history WHERE user_id = ?', [userId]);
  const total = Number(countRows[0].total);
  ok(res, rows, { total, hasMore: page * pageSize < total });
}));

app.delete('/user/:id/browsing-history', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.params.id);
  if (!userId) return fail(res, 400, '无效的用户ID');
  await pool.execute('DELETE FROM browsing_history WHERE user_id = ?', [userId]);
  ok(res, { userId });
}));

app.post('/send-message', asyncRoute(async (req, res) => {
  const senderId = positiveInt(req.body.sender_id);
  const receiverId = positiveInt(req.body.receiver_id);
  const content = String(req.body.content || '').trim();
  if (!senderId || !receiverId || senderId === receiverId || !content) return fail(res, 400, '消息参数无效');
  const [result] = await pool.execute(
    'INSERT INTO messages (conversation_id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)',
    [conversationId(senderId, receiverId), senderId, receiverId, content]
  );
  ok(res, { message_id: Number(result.insertId), created_time: new Date().toISOString() });
}));

app.get('/messages/:userId/:partnerId', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.params.userId);
  const partnerId = positiveInt(req.params.partnerId);
  if (!userId || !partnerId) return fail(res, 400, '用户ID无效');
  const pageSize = Math.min(positiveInt(req.query.pageSize, 30), 100);
  const beforeId = positiveInt(req.query.beforeId, null);
  const afterId = positiveInt(req.query.afterId, null);
  const id = conversationId(userId, partnerId);
  if (afterId) {
    const [rows] = await pool.execute(
      `SELECT m.id AS message_id, m.sender_id, m.receiver_id, m.content AS message_content,
              m.created_at AS created_time, u.nickname AS sender_name, u.avatar AS sender_avatar
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT ${pageSize}`,
      [id, afterId]
    );
    await pool.execute('UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND receiver_id = ? AND id > ?', [id, userId, afterId]);
    return ok(res, rows, { hasMore: false });
  }
  const [rows] = await pool.execute(
    `SELECT m.id AS message_id, m.sender_id, m.receiver_id, m.content AS message_content,
            m.created_at AS created_time, u.nickname AS sender_name, u.avatar AS sender_avatar
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = ? ${beforeId ? 'AND m.id < ?' : ''}
     ORDER BY m.id DESC LIMIT ${pageSize + 1}`,
    beforeId ? [id, beforeId] : [id]
  );
  const hasMore = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize).reverse();
  await pool.execute('UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND receiver_id = ?', [id, userId]);
  ok(res, pageRows, { hasMore });
}));

app.get('/conversations/:userId', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.params.userId);
  if (!userId) return fail(res, 400, '用户ID无效');
  const [rows] = await pool.execute(
    `SELECT latest.partner_id, u.nickname AS partner_name, u.avatar AS partner_avatar,
            m.content AS last_message_content, m.created_at AS last_message_time,
            (SELECT COUNT(*) FROM messages unread
             WHERE unread.conversation_id = latest.conversation_id AND unread.receiver_id = ? AND unread.is_read = 0) AS unread_count
     FROM (
       SELECT conversation_id,
              MAX(id) AS last_id,
              CASE WHEN SUBSTRING_INDEX(conversation_id, '_', 1) + 0 = ?
                   THEN SUBSTRING_INDEX(conversation_id, '_', -1) + 0
                   ELSE SUBSTRING_INDEX(conversation_id, '_', 1) + 0 END AS partner_id
       FROM messages WHERE sender_id = ? OR receiver_id = ? GROUP BY conversation_id
     ) latest
     JOIN messages m ON m.id = latest.last_id JOIN users u ON u.id = latest.partner_id
     ORDER BY m.created_at DESC`,
    [userId, userId, userId, userId]
  );
  ok(res, rows);
}));

app.get('/user-activity/:userId', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.params.userId);
  if (!userId) return fail(res, 400, '用户ID无效');
  const { page, pageSize, offset } = pagination(req.query, 20, 50);
  const [rows] = await pool.execute(
    `SELECT a.id, a.activity_type AS type, a.content AS comment, a.created_at AS time, a.is_read,
            actor.id AS user_id, actor.nickname AS username, actor.avatar,
            a.post_id, p.title AS post_title
     FROM activities a JOIN users actor ON actor.id = a.actor_id
     LEFT JOIN posts p ON p.id = a.post_id
     WHERE a.recipient_id = ? ORDER BY a.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    [userId]
  );
  const [counts] = await pool.execute(
    'SELECT COUNT(*) AS total, SUM(is_read = 0) AS unread_total FROM activities WHERE recipient_id = ?',
    [userId]
  );
  const total = Number(counts[0].total || 0);
  ok(res, rows.map(row => ({ ...row, is_read: Boolean(row.is_read) })), {
    total,
    unreadTotal: Number(counts[0].unread_total || 0),
    hasMore: page * pageSize < total
  });
}));

app.post('/user-activity/:userId/read', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.params.userId);
  const activityId = positiveInt(req.body.activityId, null);
  if (!userId) return fail(res, 400, '用户ID无效');
  if (activityId) {
    const [result] = await pool.execute(
      'UPDATE activities SET is_read = 1, read_at = COALESCE(read_at, NOW()) WHERE id = ? AND recipient_id = ?',
      [activityId, userId]
    );
    if (!result.affectedRows) return fail(res, 404, '动态不存在');
  } else {
    await pool.execute(
      'UPDATE activities SET is_read = 1, read_at = COALESCE(read_at, NOW()) WHERE recipient_id = ? AND is_read = 0',
      [userId]
    );
  }
  ok(res, { activityId, all: !activityId });
}));

app.post('/posts/:id/report', asyncRoute(async (req, res) => {
  const postId = positiveInt(req.params.id);
  const reporterId = positiveInt(req.body.userId || req.body.reporterId);
  const reason = String(req.body.reason || '其他').trim();
  if (!postId || !reporterId) return fail(res, 400, '举报参数无效');
  await pool.execute(
    `INSERT INTO post_reports (post_id, reporter_id, reason) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE reason = VALUES(reason), status = 'pending', created_at = NOW()`,
    [postId, reporterId, reason]
  );
  ok(res, { postId });
}));

app.post('/feedback', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.body.userId, null);
  const category = ['feature', 'bug', 'content', 'other'].includes(req.body.category) ? req.body.category : 'other';
  const content = String(req.body.content || '').trim();
  const contact = String(req.body.contact || '').trim();
  if (!content) return fail(res, 400, '反馈内容不能为空');
  if (content.length > 2000 || contact.length > 100) return fail(res, 400, '反馈内容或联系方式过长');
  const [result] = await pool.execute(
    'INSERT INTO feedback (user_id, category, content, contact) VALUES (?, ?, ?, ?)',
    [userId, category, content, contact]
  );
  ok(res, { feedbackId: Number(result.insertId) });
}));

app.get('/admin/reports', asyncRoute(async (req, res) => {
  const adminUserId = positiveInt(req.query.adminUserId);
  if (!(await requireAdmin(adminUserId))) return fail(res, 403, '需要管理员权限');
  const status = ['pending', 'reviewed', 'dismissed'].includes(req.query.status) ? req.query.status : null;
  const { page, pageSize, offset } = pagination(req.query, 20, 50);
  const where = status ? 'WHERE r.status = ?' : '';
  const params = status ? [status] : [];
  const [rows] = await pool.execute(
    `SELECT r.id, r.post_id, r.reason, r.status, r.created_at, r.reviewed_at,
            reporter.id AS reporter_id, reporter.nickname AS reporter_name,
            p.title AS post_title, p.status AS post_status,
            author.id AS author_id, author.nickname AS author_name
     FROM post_reports r
     JOIN users reporter ON reporter.id = r.reporter_id
     JOIN posts p ON p.id = r.post_id
     JOIN users author ON author.id = p.user_id
     ${where} ORDER BY r.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    params
  );
  const [counts] = await pool.execute(`SELECT COUNT(*) AS total FROM post_reports r ${where}`, params);
  const total = Number(counts[0].total);
  ok(res, rows, { total, hasMore: page * pageSize < total });
}));

app.patch('/admin/reports/:id', asyncRoute(async (req, res) => {
  const reportId = positiveInt(req.params.id);
  const adminUserId = positiveInt(req.body.adminUserId);
  const status = ['reviewed', 'dismissed'].includes(req.body.status) ? req.body.status : null;
  const postAction = ['none', 'hide', 'restore'].includes(req.body.postAction) ? req.body.postAction : 'none';
  if (!reportId || !status) return fail(res, 400, '举报处理参数无效');
  if (!(await requireAdmin(adminUserId))) return fail(res, 403, '需要管理员权限');
  const processed = await transaction(async connection => {
    const [rows] = await connection.execute('SELECT post_id FROM post_reports WHERE id = ? FOR UPDATE', [reportId]);
    if (!rows[0]) return false;
    await connection.execute(
      'UPDATE post_reports SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
      [status, adminUserId, reportId]
    );
    if (postAction === 'hide') await connection.execute("UPDATE posts SET status = 'hidden' WHERE id = ? AND status = 'published'", [rows[0].post_id]);
    if (postAction === 'restore') await connection.execute("UPDATE posts SET status = 'published' WHERE id = ? AND status = 'hidden'", [rows[0].post_id]);
    return true;
  });
  if (!processed) return fail(res, 404, '举报记录不存在');
  ok(res, { reportId, status, postAction });
}));

app.get('/admin/feedback', asyncRoute(async (req, res) => {
  const adminUserId = positiveInt(req.query.adminUserId);
  if (!(await requireAdmin(adminUserId))) return fail(res, 403, '需要管理员权限');
  const status = ['pending', 'processing', 'resolved', 'dismissed'].includes(req.query.status) ? req.query.status : null;
  const { page, pageSize, offset } = pagination(req.query, 20, 50);
  const where = status ? 'WHERE f.status = ?' : '';
  const params = status ? [status] : [];
  const [rows] = await pool.execute(
    `SELECT f.id, f.category, f.content, f.contact, f.status, f.created_at, f.reviewed_at,
            u.id AS user_id, u.nickname AS username
     FROM feedback f LEFT JOIN users u ON u.id = f.user_id
     ${where} ORDER BY f.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    params
  );
  const [counts] = await pool.execute(`SELECT COUNT(*) AS total FROM feedback f ${where}`, params);
  const total = Number(counts[0].total);
  ok(res, rows, { total, hasMore: page * pageSize < total });
}));

app.patch('/admin/feedback/:id', asyncRoute(async (req, res) => {
  const feedbackId = positiveInt(req.params.id);
  const adminUserId = positiveInt(req.body.adminUserId);
  const status = ['processing', 'resolved', 'dismissed'].includes(req.body.status) ? req.body.status : null;
  if (!feedbackId || !status) return fail(res, 400, '反馈处理参数无效');
  if (!(await requireAdmin(adminUserId))) return fail(res, 403, '需要管理员权限');
  const [result] = await pool.execute(
    'UPDATE feedback SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
    [status, adminUserId, feedbackId]
  );
  if (!result.affectedRows) return fail(res, 404, '反馈不存在');
  ok(res, { feedbackId, status });
}));

app.post('/send-verify-code', asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const userId = positiveInt(req.body.userId, null);
  const verificationType = ['school_verification', 'password_reset', 'email_change'].includes(req.body.type) ? req.body.type : 'school_verification';
  if (!allowedSchoolEmail(email)) return fail(res, 400, `仅支持 ${config.emailAllowedDomains.join('、')} 邮箱`);
  if (verificationType === 'password_reset') {
    const [users] = await pool.execute('SELECT id FROM users WHERE account = ? OR school_email = ? LIMIT 1', [email, email]);
    if (!users[0]) return fail(res, 404, '该邮箱未绑定账号');
  }
  const [recent] = await pool.execute(
    'SELECT created_at FROM email_verification_codes WHERE email = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND) ORDER BY id DESC LIMIT 1',
    [email, config.emailSendIntervalSeconds]
  );
  if (recent.length) return fail(res, 429, '发送过于频繁，请稍后重试');
  const code = String(crypto.randomInt(100000, 1000000));
  await transaction(async (connection) => {
    await connection.execute('UPDATE email_verification_codes SET is_used = 1 WHERE email = ? AND verification_type = ? AND is_used = 0', [email, verificationType]);
    await connection.execute(
      'INSERT INTO email_verification_codes (email, verification_code, verification_type, user_id, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
      [email, code, verificationType, userId, config.emailCodeExpireMinutes]
    );
  });
  if (mailer) {
    await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: '校友墙邮箱验证码',
      text: `你的验证码是 ${code}，${config.emailCodeExpireMinutes} 分钟内有效。`
    });
  }
  ok(res, config.emailMode === 'mock' ? { testCode: code, expiresIn: config.emailCodeExpireMinutes * 60 } : { expiresIn: config.emailCodeExpireMinutes * 60 });
}));

app.post('/reset-password', asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const newPassword = String(req.body.newPassword || '');
  if (!allowedSchoolEmail(email) || !/^\d{6}$/.test(code)) return fail(res, 400, '邮箱或验证码格式错误');
  if (newPassword.length < 6 || newPassword.length > 72) return fail(res, 400, '新密码长度应为6至72位');
  const result = await transaction(async (connection) => {
    const [codeRows] = await connection.execute(
      `SELECT * FROM email_verification_codes
       WHERE email = ? AND verification_type = 'password_reset' AND is_used = 0
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [email]
    );
    const record = codeRows[0];
    if (!record) return { status: 'invalid' };
    if (new Date(record.expires_at).getTime() < Date.now()) {
      await connection.execute('UPDATE email_verification_codes SET is_used = 1 WHERE id = ?', [record.id]);
      return { status: 'expired' };
    }
    const matches = crypto.timingSafeEqual(Buffer.from(String(record.verification_code)), Buffer.from(code));
    await connection.execute(
      'UPDATE email_verification_codes SET attempts = attempts + 1, is_used = ? WHERE id = ?',
      [matches || Number(record.attempts) >= 2 ? 1 : 0, record.id]
    );
    if (!matches) return { status: 'invalid' };
    const [users] = await connection.execute('SELECT id FROM users WHERE account = ? OR school_email = ? LIMIT 1 FOR UPDATE', [email, email]);
    if (!users[0]) return { status: 'missing' };
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await connection.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, users[0].id]);
    await connection.execute(
      `INSERT INTO email_verification_history (user_id, email, verification_type, status, ip_address, user_agent)
       VALUES (?, ?, 'password_reset', 'success', ?, ?)`,
      [users[0].id, email, req.ip, String(req.headers['user-agent'] || '').slice(0, 500)]
    );
    return { status: 'success', userId: Number(users[0].id) };
  });
  if (result.status === 'expired') return fail(res, 400, '验证码已过期');
  if (result.status === 'missing') return fail(res, 404, '该邮箱未绑定账号');
  if (result.status !== 'success') return fail(res, 400, '验证码错误');
  ok(res, { userId: result.userId });
}));

app.post('/verify-email-code', asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const userId = positiveInt(req.body.userId, null);
  const verificationType = ['school_verification', 'password_reset', 'email_change'].includes(req.body.type) ? req.body.type : 'school_verification';
  if (!allowedSchoolEmail(email) || !/^\d{6}$/.test(code)) return fail(res, 400, '邮箱或验证码格式错误');
  const verified = await transaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT * FROM email_verification_codes
       WHERE email = ? AND verification_type = ? AND is_used = 0 ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [email, verificationType]
    );
    const record = rows[0];
    let status = 'failed';
    if (record && new Date(record.expires_at).getTime() < Date.now()) status = 'expired';
    else if (record && crypto.timingSafeEqual(Buffer.from(String(record.verification_code)), Buffer.from(code))) status = 'success';
    if (record) await connection.execute('UPDATE email_verification_codes SET attempts = attempts + 1, is_used = ? WHERE id = ?', [status === 'success' || Number(record.attempts) >= 2 ? 1 : 0, record.id]);
    await connection.execute(
      'INSERT INTO email_verification_history (user_id, email, verification_type, status, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, email, verificationType, status, req.ip, String(req.headers['user-agent'] || '').slice(0, 500)]
    );
    if (status === 'success' && userId && verificationType === 'school_verification') {
      await connection.execute(
        `UPDATE users SET school_email = ?, school_email_verified = 1,
         school_email_verified_at = NOW(), verification_level = 'school_verified' WHERE id = ?`,
        [email, userId]
      );
    }
    return status;
  });
  if (verified !== 'success') return fail(res, 400, verified === 'expired' ? '验证码已过期' : '验证码错误');
  ok(res, { email, verified: true });
}));

app.get('/user/:userId/verification-status', asyncRoute(async (req, res) => {
  const userId = positiveInt(req.params.userId);
  if (!userId) return fail(res, 400, '无效的用户ID');
  const [rows] = await pool.execute('SELECT school_email, school_email_verified, school_email_verified_at, verification_level FROM users WHERE id = ?', [userId]);
  if (!rows[0]) return fail(res, 404, '用户不存在');
  ok(res, { ...rows[0], school_email_verified: Boolean(rows[0].school_email_verified) });
}));

app.use((req, res) => fail(res, 404, `接口不存在: ${req.method} ${req.path}`));

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof multer.MulterError) return fail(res, 400, error.code === 'LIMIT_FILE_SIZE' ? '图片过大' : error.message);
  if (error.status) return fail(res, error.status, error.message);
  if (error.code === 'ER_NO_REFERENCED_ROW_2') return fail(res, 400, '关联的用户、帖子或专区不存在');
  if (error.code === 'ER_DUP_ENTRY') return fail(res, 400, '数据已存在');
  return fail(res, 500, process.env.NODE_ENV === 'production' ? '服务器内部错误' : error.message);
});

const server = app.listen(config.port, config.host, () => {
  console.log(`Alumni Wall API listening on http://${config.host}:${config.port}`);
  console.log(`Database: ${config.db.host}:${config.db.port}/${config.db.database}`);
  console.log(`Email mode: ${config.emailMode}`);
});

async function shutdown(signal) {
  console.log(`${signal}: shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { app, pool, server };
