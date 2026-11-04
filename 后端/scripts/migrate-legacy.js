'use strict';

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const targetDatabase = process.env.DB_NAME || 'alumni_wall';
const legacyDatabase = process.env.LEGACY_DB_NAME || 'reorain';

function escapeId(value) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) throw new Error(`非法数据库名: ${value}`);
  return `\`${value}\``;
}

async function main() {
  if (targetDatabase === legacyDatabase) throw new Error('新旧数据库名不能相同');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true
  });
  const legacy = escapeId(legacyDatabase);
  const target = escapeId(targetDatabase);
  try {
    const [legacyUsers] = await connection.query(
      `SELECT user_id, user_username, user_password, user_nickname, avatar, bio, created_at FROM ${legacy}.user ORDER BY user_id`
    );
    await connection.beginTransaction();
    for (const user of legacyUsers) {
      const hash = await bcrypt.hash(String(user.user_password), 12);
      await connection.execute(
        `INSERT INTO ${target}.users (id, account, password_hash, nickname, avatar, bio, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE account = VALUES(account), password_hash = VALUES(password_hash),
           nickname = VALUES(nickname), avatar = VALUES(avatar), bio = VALUES(bio)`,
        [user.user_id, user.user_username, hash, user.user_nickname, user.avatar, user.bio || '', user.created_at]
      );
    }

    const copyStatements = [
      `INSERT INTO ${target}.zones (id, name)
       SELECT zone_id, zone_name FROM ${legacy}.zone
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      `INSERT INTO ${target}.posts (id, user_id, zone_id, title, content, like_count, collect_count, comment_count, created_at, updated_at)
       SELECT post_id, user_id, zone_id, title, post_content, like_count, collect_count, comment_count, created_at, updated_at
       FROM ${legacy}.post
       ON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content), like_count = VALUES(like_count),
         collect_count = VALUES(collect_count), comment_count = VALUES(comment_count), updated_at = VALUES(updated_at)`,
      `INSERT IGNORE INTO ${target}.post_images (id, post_id, file_path, sort_order, created_at)
       SELECT id, post_id, file_path, sort_order, created_at FROM ${legacy}.post_pictures`,
      `INSERT INTO ${target}.post_actions (user_id, post_id, is_liked, is_collected, created_at, updated_at)
       SELECT user_id, post_id, is_liked, is_collected, created_at, updated_at FROM ${legacy}.user_post_actions
       ON DUPLICATE KEY UPDATE is_liked = VALUES(is_liked), is_collected = VALUES(is_collected), updated_at = VALUES(updated_at)`,
      `INSERT INTO ${target}.comments (id, post_id, user_id, parent_id, content, like_count, created_at, updated_at)
       SELECT comment_id, post_id, user_id, parent_id, content, like_count, created_at, updated_at FROM ${legacy}.comment
       ON DUPLICATE KEY UPDATE content = VALUES(content), like_count = VALUES(like_count), updated_at = VALUES(updated_at)`,
      `INSERT IGNORE INTO ${target}.comment_likes (comment_id, user_id, created_at)
       SELECT comment_id, user_id, created_at FROM ${legacy}.comment_likes`,
      `INSERT IGNORE INTO ${target}.messages (id, conversation_id, sender_id, receiver_id, content, content_type, created_at)
       SELECT m.message_id, m.conversation_id, m.sender_id, m.receiver_id, mc.message_content,
              CASE mc.content_type WHEN 2 THEN 'image' WHEN 3 THEN 'voice' ELSE 'text' END,
              m.created_time
       FROM ${legacy}.message m JOIN ${legacy}.message_content mc ON mc.message_id = m.message_id`
    ];
    for (const statement of copyStatements) await connection.query(statement);
    await connection.commit();
    console.log(`迁移完成：${legacyDatabase} -> ${targetDatabase}，用户 ${legacyUsers.length} 个`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
