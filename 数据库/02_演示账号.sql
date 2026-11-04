SET NAMES utf8mb4;
USE alumni_wall;

INSERT INTO users (
  account,
  password_hash,
  nickname,
  bio,
  role,
  verification_level
) VALUES
  (
    'admin',
    '$2b$10$Rd0Cgr9bY.jFujiYSvQUcOTDcoOtMM44S67e0G.CcMMgITK0GQUW6',
    '论坛管理员',
    '校友墙演示管理员账号',
    'admin',
    'advanced'
  ),
  (
    'demo',
    '$2b$10$ZXHicMof.sVpFqMPO9YnN.CzTzMq1HCIGL4lEmwULJopjW0GVqoFS',
    '演示校友',
    '校友墙普通演示账号',
    'user',
    'basic'
  )
ON DUPLICATE KEY UPDATE
  nickname = VALUES(nickname),
  bio = VALUES(bio),
  role = VALUES(role),
  verification_level = VALUES(verification_level);

