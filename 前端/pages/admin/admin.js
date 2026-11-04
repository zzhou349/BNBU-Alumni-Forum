const apiConfig = require('../../config/api.js');

const reportStatusText = { pending: '待处理', reviewed: '已处理', dismissed: '已驳回' };
const feedbackStatusText = { pending: '待处理', processing: '处理中', resolved: '已解决', dismissed: '已忽略' };
const categoryText = { feature: '功能建议', bug: '问题反馈', content: '内容问题', other: '其他' };

Page({
  data: {
    adminUserId: null,
    currentTab: 'reports',
    currentStatus: 'pending',
    reports: [],
    feedbackList: [],
    isLoading: false,
    errorMessage: ''
  },

  onLoad() {
    const app = getApp();
    const user = app.globalData.userInfo || {};
    const adminUserId = user.user_id || user.id;
    if (!adminUserId || !(user.isAdmin || user.role === 'admin')) {
      wx.showToast({ title: '需要管理员权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    this.setData({ adminUserId });
    this.loadCurrent();
  },

  switchTab(e) {
    this.setData({ currentTab: e.currentTarget.dataset.tab, currentStatus: 'pending', errorMessage: '' });
    this.loadCurrent();
  },

  switchStatus(e) {
    this.setData({ currentStatus: e.currentTarget.dataset.status });
    this.loadCurrent();
  },

  loadCurrent() {
    if (!this.data.adminUserId || this.data.isLoading) return;
    this.setData({ isLoading: true, errorMessage: '' });
    const isReports = this.data.currentTab === 'reports';
    const path = isReports ? '/admin/reports' : '/admin/feedback';
    const status = this.data.currentStatus === 'all' ? undefined : this.data.currentStatus;
    wx.request({
      url: apiConfig.getFullURL(path),
      method: 'GET',
      data: { adminUserId: this.data.adminUserId, status, pageSize: 50 },
      success: res => {
        if (res.data.code !== 200) {
          this.setData({ errorMessage: res.data.message || '加载失败' });
          return;
        }
        if (isReports) {
          this.setData({ reports: (res.data.data || []).map(item => ({
            ...item,
            statusText: reportStatusText[item.status] || item.status,
            timeText: this.formatTime(item.created_at)
          })) });
        } else {
          this.setData({ feedbackList: (res.data.data || []).map(item => ({
            ...item,
            statusText: feedbackStatusText[item.status] || item.status,
            categoryText: categoryText[item.category] || item.category,
            timeText: this.formatTime(item.created_at)
          })) });
        }
      },
      fail: () => this.setData({ errorMessage: '网络请求失败' }),
      complete: () => {
        this.setData({ isLoading: false });
        wx.stopPullDownRefresh();
      }
    });
  },

  formatTime(value) {
    if (!value) return '';
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  },

  openPost(e) {
    const postId = e.currentTarget.dataset.id;
    if (!postId || e.currentTarget.dataset.status !== 'published') return;
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${postId}` });
  },

  processReport(e) {
    const reportId = e.currentTarget.dataset.id;
    const status = e.currentTarget.dataset.status;
    const postAction = e.currentTarget.dataset.action || 'none';
    const content = postAction === 'hide' ? '确认隐藏该帖子并将举报标记为已处理？' : '确认驳回这条举报？';
    wx.showModal({
      title: '处理举报',
      content,
      success: modal => {
        if (!modal.confirm) return;
        wx.request({
          url: apiConfig.getFullURL(`/admin/reports/${reportId}`),
          method: 'PATCH',
          data: { adminUserId: this.data.adminUserId, status, postAction },
          success: res => {
            wx.showToast({ title: res.data.code === 200 ? '处理成功' : (res.data.message || '处理失败'), icon: res.data.code === 200 ? 'success' : 'none' });
            if (res.data.code === 200) this.loadCurrent();
          },
          fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' })
        });
      }
    });
  },

  restorePost(e) {
    wx.request({
      url: apiConfig.getFullURL(`/admin/reports/${e.currentTarget.dataset.id}`),
      method: 'PATCH',
      data: { adminUserId: this.data.adminUserId, status: 'reviewed', postAction: 'restore' },
      success: res => {
        wx.showToast({ title: res.data.code === 200 ? '帖子已恢复' : (res.data.message || '恢复失败'), icon: res.data.code === 200 ? 'success' : 'none' });
        if (res.data.code === 200) this.loadCurrent();
      }
    });
  },

  processFeedback(e) {
    const feedbackId = e.currentTarget.dataset.id;
    const status = e.currentTarget.dataset.status;
    wx.request({
      url: apiConfig.getFullURL(`/admin/feedback/${feedbackId}`),
      method: 'PATCH',
      data: { adminUserId: this.data.adminUserId, status },
      success: res => {
        wx.showToast({ title: res.data.code === 200 ? '状态已更新' : (res.data.message || '处理失败'), icon: res.data.code === 200 ? 'success' : 'none' });
        if (res.data.code === 200) this.loadCurrent();
      },
      fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' })
    });
  },

  onPullDownRefresh() {
    this.loadCurrent();
  }
});
