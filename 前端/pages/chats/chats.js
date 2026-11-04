const apiConfig = require('../../config/api.js');

Page({
  data: {
    conversations: [],
    loading: false,
    userInfo: null,
    isLoggedIn: false,
    hasLoaded: false, // 新增标志位，表示是否已加载过数据
    isEmpty: false // 新增标志位，表示是否有数据
  },

  onLoad() {
    const app = getApp();
    this.setData({
      userInfo: app.globalData.userInfo,
      isLoggedIn: app.globalData.isLoggedIn
    });

    if (app.globalData.isLoggedIn) {
      this.loadConversations();
    }
  },

  onShow() {
    const app = getApp();
    const isLoggedIn = app.globalData.isLoggedIn;
    this.setData({ isLoggedIn });

    if (isLoggedIn) {
      this.setData({ userInfo: app.globalData.userInfo });
      // 只有当未加载过时才加载，避免重复加载
      if (!this.data.hasLoaded) {
        this.loadConversations();
      }
    }
  },

  loadConversations() {
    if (!this.data.userInfo?.user_id || this.data.loading) return;

    this.setData({ loading: true });
    wx.showLoading({ title: '加载中...' });

    wx.request({
      url: apiConfig.getFullURL(`/conversations/${this.data.userInfo.user_id}`),
      success: (res) => {
        // 无论是否有数据都设置hasLoaded为true
        this.setData({
          hasLoaded: true,
          isEmpty: !res.data.data || res.data.data.length === 0
        });

        if (res.data.code === 200) {
          this.setData({
            conversations: res.data.data.map(chat => ({
              ...chat,
              last_message_time: this.formatTime(chat.last_message_time),
              last_message_content: this.trimMessage(chat.last_message_content)
            })),
            loading: false
          });
        }
      },
      fail: (err) => {
        console.error('加载对话失败:', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
        this.setData({
          loading: false,
          hasLoaded: true,
          isEmpty: true
        });
      },
      complete: () => wx.hideLoading()
    });
  },

  trimMessage(content) {
    if (!content) return '';
    return content.length > 20 ? content.substring(0, 20) + '...' : content;
  },

  formatTime(timeString) {
    if (!timeString) return '';
    const date = new Date(timeString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff/60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}小时前`;
    return `${date.getMonth()+1}月${date.getDate()}日`;
  },

  navigateToChat(e) {
    wx.navigateTo({
      url: `/pages/chat/chat?partnerId=${e.currentTarget.dataset.id}`
    });
  },

  navigateToLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  }
});