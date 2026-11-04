'use strict';

const path = require('node:path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function columnExists(connection, table, column) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [process.env.DB_NAME, table, column]
  );
  return rows.length > 0;
}

async function constraintExists(connection, table, constraint) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`,
    [process.env.DB_NAME, table, constraint]
  );
  return rows.length > 0;
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    if (!(await columnExists(connection, 'users', 'role'))) {
      await connection.query("ALTER TABLE users ADD COLUMN role ENUM('user', 'admin') NOT NULL DEFAULT 'user' AFTER verification_level");
    }
    if (!(await columnExists(connection, 'post_reports', 'reviewed_by'))) {
      await connection.query('ALTER TABLE post_reports ADD COLUMN reviewed_by INT UNSIGNED NULL AFTER status');
    }
    if (!(await columnExists(connection, 'post_reports', 'reviewed_at'))) {
      await connection.query('ALTER TABLE post_reports ADD COLUMN reviewed_at DATETIME NULL AFTER reviewed_by');
    }
    if (!(await columnExists(connection, 'post_reports', 'updated_at'))) {
      await connection.query('ALTER TABLE post_reports ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');
    }
    if (!(await constraintExists(connection, 'post_reports', 'fk_post_reports_reviewer'))) {
      await connection.query('ALTER TABLE post_reports ADD CONSTRAINT fk_post_reports_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL');
    }

    await connection.query(`CREATE TABLE IF NOT EXISTS feedback (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NULL,
      category ENUM('feature', 'bug', 'content', 'other') NOT NULL DEFAULT 'other',
      content VARCHAR(2000) NOT NULL,
      contact VARCHAR(100) NOT NULL DEFAULT '',
      status ENUM('pending', 'processing', 'resolved', 'dismissed') NOT NULL DEFAULT 'pending',
      reviewed_by INT UNSIGNED NULL,
      reviewed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_feedback_status_created (status, created_at),
      CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_feedback_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

    const account = String(process.env.DEV_ADMIN_ACCOUNT || 'admin@alumni.uic.edu.cn').toLowerCase();
    const password = String(process.env.DEV_ADMIN_PASSWORD || 'Admin123!');
    const passwordHash = await bcrypt.hash(password, 12);
    await connection.execute(
      `INSERT INTO users (account, password_hash, nickname, avatar, bio, role)
       VALUES (?, ?, '系统管理员', '/assets/avatar.png', '本地开发管理员', 'admin')
       ON DUPLICATE KEY UPDATE role = 'admin', password_hash = VALUES(password_hash)`,
      [account, passwordHash]
    );
    console.log(`Phase 3 migration completed. Development admin: ${account}`);
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
