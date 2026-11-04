const apiConfig = require('../../config/api.js');

Page({
  data: {
    mode: 'reset',
    userId: null,
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    email: '',
    code: '',
    codeSent: false,
    testCode: null,
    canSendCode: true,
    sendCodeText: '发送验证码',
    submitting: false
  },

  onLoad(options) {
    const app = getApp();
    const loggedIn = Boolean(app.globalData.isLoggedIn && app.globalData.userInfo);
    const mode = options.mode === 'change' && loggedIn ? 'change' : 'reset';
    this.setData({
      mode,
      userId: loggedIn ? (app.globalData.userInfo.user_id || app.globalData.userInfo.id) : null
    });
    wx.setNavigationBarTitle({ title: mode === 'change' ? '修改密码' : '重置密码' });
  },

  onUnload() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const changes = { [field]: value };
    if (field === 'email' && value !== this.data.email && this.data.codeSent) {
      changes.code = '';
      changes.codeSent = false;
      changes.testCode = null;
    }
    this.setData(changes);
  },

  validateNewPassword() {
    const { newPassword, confirmPassword } = this.data;
    if (newPassword.length < 6 || newPassword.length > 72) {
      wx.showToast({ title: '密码长度应为6至72位', icon: 'none' });
      return false;
    }
    if (newPassword !== confirmPassword) {
      wx.showToast({ title: '两次输入的密码不一致', icon: 'none' });
      return false;
    }
    return true;
  },

  submitChange() {
    if (this.data.submitting || !this.validateNewPassword()) return;
    if (!this.data.oldPassword) return wx.showToast({ title: '请输入原密码', icon: 'none' });
    this.requestPassword('/change-password', {
      userId: this.data.userId,
      oldPassword: this.data.oldPassword,
      newPassword: this.data.newPassword
    }, '密码修改成功');
  },

  sendResetCode() {
    const email = this.data.email.trim().toLowerCase();
    if (!email || !this.data.canSendCode) return;
    wx.showLoading({ title: '发送中...', mask: true });
    wx.request({
      url: apiConfig.getFullURL('/send-verify-code'),
      method: 'POST',
      data: { email, type: 'password_reset' },
      success: res => {
        if (res.data.code !== 200) {
          wx.showToast({ title: res.data.message || '发送失败', icon: 'none' });
          return;
        }
        this.setData({
          email,
          codeSent: true,
          testCode: res.data.data?.testCode ? String(res.data.data.testCode) : null
        });
        this.startCountdown();
        wx.showToast({ title: '验证码已发送', icon: 'success' });
      },
      fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' }),
      complete: () => wx.hideLoading()
    });
  },

  startCountdown() {
    let seconds = 60;
    this.setData({ canSendCode: false, sendCodeText: `${seconds}s后重发` });
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.setData({ canSendCode: true, sendCodeText: '重新发送' });
      } else {
        this.setData({ sendCodeText: `${seconds}s后重发` });
      }
    }, 1000);
  },

  submitReset() {
    if (this.data.submitting || !this.validateNewPassword()) return;
    if (!/^\d{6}$/.test(this.data.code)) return wx.showToast({ title: '请输入6位验证码', icon: 'none' });
    this.requestPassword('/reset-password', {
      email: this.data.email.trim().toLowerCase(),
      code: this.data.code,
      newPassword: this.data.newPassword
    }, '密码重置成功');
  },

  requestPassword(path, data, successTitle) {
    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });
    wx.request({
      url: apiConfig.getFullURL(path),
      method: 'POST',
      data,
      success: res => {
        if (res.data.code !== 200) {
          wx.showToast({ title: res.data.message || '操作失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: successTitle, icon: 'success' });
        if (this.data.mode === 'change') getApp().logout();
        setTimeout(() => wx.redirectTo({ url: '/pages/login/login' }), 1200);
      },
      fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ submitting: false });
      }
    });
  }
});
