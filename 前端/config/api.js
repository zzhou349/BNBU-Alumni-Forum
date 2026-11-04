/**
 * API配置文件
 * 统一管理所有API地址，便于开发和生产环境切换
 */

const config = {
  // 开发环境配置
  development: {
    baseURL: 'http://127.0.0.1:3001',
    emailVerifyURL: 'http://127.0.0.1:3001', // 邮箱验证服务地址（使用本地服务器）
    uploadURL: 'http://127.0.0.1:3001/upload',
    websocketURL: 'ws://127.0.0.1:3001'
  },

  // 生产环境配置（需要HTTPS）
  production: {
    baseURL: 'https://api.uic.edu.cn',
    emailVerifyURL: 'https://api.uic.edu.cn', // 邮箱验证服务
    uploadURL: 'https://api.uic.edu.cn/upload',
    websocketURL: 'wss://api.uic.edu.cn'
  }
};

// 当前环境设置（发布时需要改为 'production'）
const currentEnv = 'development';

// 导出当前环境的配置
const apiConfig = config[currentEnv];

// 添加一些便捷方法
apiConfig.getFullURL = function(path) {
  return `${this.baseURL}${path.startsWith('/') ? path : '/' + path}`;
};

apiConfig.getEmailVerifyURL = function(path) {
  return `${this.emailVerifyURL}${path.startsWith('/') ? path : '/' + path}`;
};

// 打印当前环境配置（开发时便于调试）
if (currentEnv === 'development') {
  console.log('当前API配置环境:', currentEnv);
  console.log('主服务地址:', apiConfig.baseURL);
  console.log('邮箱验证服务地址:', apiConfig.emailVerifyURL);
}

module.exports = apiConfig;
