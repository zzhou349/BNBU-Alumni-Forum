CREATE DATABASE IF NOT EXISTS alumni_wall CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'alumni_dev'@'127.0.0.1' IDENTIFIED BY 'alumni_dev_password';
CREATE USER IF NOT EXISTS 'alumni_dev'@'localhost' IDENTIFIED BY 'alumni_dev_password';
GRANT ALL PRIVILEGES ON alumni_wall.* TO 'alumni_dev'@'127.0.0.1';
GRANT ALL PRIVILEGES ON alumni_wall.* TO 'alumni_dev'@'localhost';
FLUSH PRIVILEGES;
