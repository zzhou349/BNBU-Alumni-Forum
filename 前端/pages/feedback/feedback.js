const apiConfig = require('../../config/api.js');

Page({
  data: {
    categories: [
      { value: 'feature', label: '功能建议' },
      { value: 'bug', label: '问题反馈' },
      { value: 'content', label: '内容问题' },
      { value: 'other', label: '其他' }
    ],
    categoryIndex: 0,
    content: '',
    contact: '',
    submitting: false
  },

  onCategoryChange(e) {
    this.setData({ categoryIndex: Number(e.detail.value) });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  submitFeedback() {
    const content = this.data.content.trim();
    if (!content) return wx.showToast({ title: '请填写反馈内容', icon: 'none' });
    if (this.data.submitting) return;
    const app = getApp();
    const userId = app.getValidUserId ? app.getValidUserId() : app.globalData.userInfo?.user_id;
    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });
    wx.request({
      url: apiConfig.getFullURL('/feedback'),
      method: 'POST',
      data: {
        userId: userId || null,
        category: this.data.categories[this.data.categoryIndex].value,
        content,
        contact: this.data.contact.trim()
      },
      success: res => {
        if (res.data.code !== 200) {
          wx.showToast({ title: res.data.message || '提交失败', icon: 'none' });
          return;
        }
        this.setData({ content: '', contact: '', categoryIndex: 0 });
        wx.showToast({ title: '感谢你的反馈', icon: 'success' });
      },
      fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ submitting: false });
      }
    });
  }
});
