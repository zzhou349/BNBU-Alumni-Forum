// 引入API配置
const apiConfig = require('../../config/api.js');

Page({
  data: {
    email: '',
    verifyCode: '',
    showVerifyCode: false,
    isValidEmail: false,
    canSendCode: true,
    sendCodeText: '发送验证码',
    countdown: 0,
    verificationSuccess: false,
    currentUserId: null,
    testVerifyCode: null, // 存储生成的测试验证码
    alreadyVerified: false, // 是否已经验证过
    verifiedAt: null // 验证时间
  },

  onLoad() {
    // 页面加载时的初始化
    // 获取当前登录用户的信息
    const app = getApp();
    if (app.globalData.isLoggedIn && app.globalData.userInfo) {
      this.setData({
        currentUserId: app.globalData.userInfo.user_id || app.globalData.userInfo.id
      });
    }

    // 检查是否已经验证过邮箱
    this.checkExistingVerification();
  },

  // 检查现有验证状态
  checkExistingVerification() {
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    if (!userInfo || !this.data.currentUserId) return;

    if (userInfo.school_email_verified && userInfo.school_email) {
      this.setData({
        verificationSuccess: true,
        email: userInfo.school_email,
        alreadyVerified: true,
        verifiedAt: userInfo.school_email_verified_at || null
      });
      return;
    }

    wx.request({
      url: apiConfig.getFullURL(`/user/${this.data.currentUserId}/verification-status`),
      method: 'GET',
      success: (res) => {
        if (res.data.code !== 200 || !res.data.data.school_email_verified) return;
        const status = res.data.data;
        const updated = {
          ...app.globalData.userInfo,
          school_email: status.school_email,
          school_email_verified: true,
          school_email_verified_at: status.school_email_verified_at
        };
        app.setLoginStatus(true, updated);
        this.setData({
          verificationSuccess: true,
          email: status.school_email,
          alreadyVerified: true,
          verifiedAt: status.school_email_verified_at
        });
      }
    });
  },

  // 邮箱输入事件
  onEmailInput(e) {
    const email = e.detail.value;
    this.setData({
      email: email,
      isValidEmail: this.validateEmail(email)
    });
  },

  // 验证码输入事件
  onCodeInput(e) {
    this.setData({
      verifyCode: e.detail.value
    });
  },

  // 验证邮箱格式
  validateEmail(email) {
    if (!email) return false;

    // 检查是否以@mail.uic.edu.cn结尾
    const emailRegex = /^[a-zA-Z0-9._-]+@mail\.uic\.edu\.cn$/;
    return emailRegex.test(email);
  },

  // 发送验证码
  sendVerifyCode() {
    const { email, isValidEmail, canSendCode } = this.data;

    if (!email) {
      wx.showToast({
        title: '请输入邮箱地址',
        icon: 'none'
      });
      return;
    }

    if (!isValidEmail) {
      wx.showToast({
        title: '请输入正确的学校邮箱格式',
        icon: 'none'
      });
      return;
    }

    if (!canSendCode) {
      return;
    }

    // 显示加载状态
    wx.showLoading({
      title: '发送中...'
    });

    // 调用后端发送验证码接口
    wx.request({
      url: apiConfig.getEmailVerifyURL('/send-verify-code'), // 后端发送验证码接口
      method: 'POST',
      data: {
        email: email,
        type: 'school_verification', // 标识这是学校邮箱验证
        userId: this.data.currentUserId // 传递用户ID
      },
      success: (res) => {
        wx.hideLoading();

        if (res.data.code === 200) {
          wx.showToast({
            title: '验证码已发送',
            icon: 'success'
          });

          this.setData({
            showVerifyCode: true,
            testVerifyCode: res.data.data && res.data.data.testCode
              ? String(res.data.data.testCode)
              : null
          });

          // 开始倒计时
          this.startCountdown();
        } else {
          wx.showToast({
            title: res.data.message || '发送失败',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('发送验证码失败:', err);
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        });
      }
    });
  },

  // 验证邮箱验证码
  verifyEmailCode() {
    const { email, verifyCode } = this.data;

    if (!verifyCode || verifyCode.length !== 6) {
      wx.showToast({
        title: '请输入6位验证码',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({
      title: '验证中...'
    });

    // 调用后端验证接口
    wx.request({
      url: apiConfig.getEmailVerifyURL('/verify-email-code'), // 后端验证接口
      method: 'POST',
      data: {
        email: email,
        code: verifyCode,
        type: 'school_verification',
        userId: this.data.currentUserId // 传递用户ID
      },
      success: (res) => {
        wx.hideLoading();

        if (res.data.code === 200) {
          this.setData({
            verificationSuccess: true
          });

          wx.showToast({
            title: '邮箱认证成功',
            icon: 'success'
          });

          // 保存认证状态到全局
          const app = getApp();
          const verifiedAt = new Date().toLocaleString('zh-CN');
          const updatedUser = {
            ...app.globalData.userInfo,
            school_email: email,
            school_email_verified: true,
            school_email_verified_at: verifiedAt
          };
          app.setLoginStatus(true, updatedUser);

          // 更新页面状态
          this.setData({
            alreadyVerified: true,
            verifiedAt: verifiedAt
          });

          // 3秒后返回上一页
          setTimeout(() => {
            wx.navigateBack();
          }, 3000);
        } else {
          wx.showToast({
            title: res.data.message || '验证码错误',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('验证失败:', err);
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        });
      }
    });
  },

  // 重置验证流程
  resetVerification() {
    this.setData({
      email: '',
      verifyCode: '',
      showVerifyCode: false,
      isValidEmail: false,
      verificationSuccess: false,
      canSendCode: true,
      sendCodeText: '发送验证码',
      countdown: 0,
      alreadyVerified: false,
      verifiedAt: null,
      testVerifyCode: null
    });

    // 清除全局状态
    const app = getApp();
    if (app.globalData) {
      app.globalData.schoolEmailVerified = false;
      app.globalData.schoolEmail = '';
      app.globalData.schoolEmailVerifiedAt = null;
    }
  },

  // 开始倒计时
  startCountdown() {
    let countdown = 60;
    this.setData({
      canSendCode: false,
      countdown: countdown,
      sendCodeText: `${countdown}s后重发`
    });

    const timer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(timer);
        this.setData({
          canSendCode: true,
          sendCodeText: '重新发送',
          countdown: 0
        });
      } else {
        this.setData({
          countdown: countdown,
          sendCodeText: `${countdown}s后重发`
        });
      }
    }, 1000);
  }
});
