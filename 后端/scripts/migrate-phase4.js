'use strict';

const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function columnExists(connection, column) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'activities' AND COLUMN_NAME = ? LIMIT 1`,
    [process.env.DB_NAME, column]
  );
  return rows.length > 0;
}

async function indexExists(connection, indexName) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'activities' AND INDEX_NAME = ? LIMIT 1`,
    [process.env.DB_NAME, indexName]
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
    if (!(await columnExists(connection, 'is_read'))) {
      await connection.query('ALTER TABLE activities ADD COLUMN is_read TINYINT(1) NOT NULL DEFAULT 0 AFTER content');
    }
    if (!(await columnExists(connection, 'read_at'))) {
      await connection.query('ALTER TABLE activities ADD COLUMN read_at DATETIME NULL AFTER is_read');
    }
    if (!(await indexExists(connection, 'idx_activities_recipient_read'))) {
      await connection.query('ALTER TABLE activities ADD KEY idx_activities_recipient_read (recipient_id, is_read, created_at)');
    }
    console.log('Phase 4 migration completed.');
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
