const apiConfig = require('../../config/api.js');

Page({
  data: {
    currentTab: 'activity',
    activityList: [],
    chatList: [],
    isLoggedIn: false,
    userInfo: null,
    activityLoading: false,
    chatLoading: false,
    errorMessage: '',
    activityPage: 1,
    activityPageSize: 20,
    hasMoreActivities: true,
    unreadActivityCount: 0,
    unreadMessageCount: 0
  },

  onLoad() {
    this.syncLogin();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: 3 });
    this.syncLogin();
    if (this.data.isLoggedIn) {
      this.loadActivityList(true);
      this.loadChatList(false);
      this.startPolling();
    }
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  syncLogin() {
    const app = getApp();
    this.setData({ isLoggedIn: Boolean(app.globalData.isLoggedIn), userInfo: app.globalData.userInfo });
  },

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.loadChatList(true), 8000);
  },

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  },

  switchTab(e) {
    const currentTab = e.currentTarget.dataset.tab;
    this.setData({ currentTab, errorMessage: '' });
    if (currentTab === 'activity') this.loadActivityList(true);
    else this.loadChatList(false);
  },

  loadActivityList(refresh = false) {
    if (!this.data.userInfo?.user_id || this.data.activityLoading || (!refresh && !this.data.hasMoreActivities)) return;
    const page = refresh ? 1 : this.data.activityPage;
    this.setData({ activityLoading: true, errorMessage: '' });
    wx.request({
      url: apiConfig.getFullURL(`/user-activity/${this.data.userInfo.user_id}`),
      method: 'GET',
      data: { page, pageSize: this.data.activityPageSize },
      success: res => {
        if (res.data.code !== 200) {
          this.setData({ errorMessage: res.data.message || '加载动态失败' });
          return;
        }
        const actionText = { like: '赞了你的帖子', collect: '收藏了你的帖子', comment: '评论了你的帖子', reply: '回复了你的评论', follow: '关注了你' };
        const list = (res.data.data || []).map(item => ({
          ...item,
          is_read: Boolean(item.is_read),
          displayContent: item.comment || actionText[item.type] || '与你产生了互动',
          time: this.formatTime(item.time)
        }));
        this.setData({
          activityList: refresh ? list : [...this.data.activityList, ...list],
          activityPage: page + 1,
          hasMoreActivities: Boolean(res.data.hasMore),
          unreadActivityCount: Number(res.data.unreadTotal || 0)
        });
      },
      fail: () => this.setData({ errorMessage: '网络请求失败' }),
      complete: () => this.setData({ activityLoading: false })
    });
  },

  loadChatList(silent = false) {
    if (!this.data.userInfo?.user_id || this.data.chatLoading) return;
    this.setData({ chatLoading: true });
    if (!silent) wx.showLoading({ title: '加载中...' });
    wx.request({
      url: apiConfig.getFullURL(`/conversations/${this.data.userInfo.user_id}`),
      method: 'GET',
      success: res => {
        if (res.data.code !== 200) return;
        const chatList = (res.data.data || []).map(chat => ({
          ...chat,
          unread_count: Number(chat.unread_count || 0),
          last_message_time: this.formatTime(chat.last_message_time)
        }));
        this.setData({
          chatList,
          unreadMessageCount: chatList.reduce((total, chat) => total + chat.unread_count, 0)
        });
      },
      complete: () => {
        if (!silent) wx.hideLoading();
        this.setData({ chatLoading: false });
      }
    });
  },

  markActivityRead(activityId) {
    const target = this.data.activityList.find(item => Number(item.id) === Number(activityId));
    if (!target || target.is_read) return;
    this.setData({
      activityList: this.data.activityList.map(item => Number(item.id) === Number(activityId) ? { ...item, is_read: true } : item),
      unreadActivityCount: Math.max(0, this.data.unreadActivityCount - 1)
    });
    wx.request({
      url: apiConfig.getFullURL(`/user-activity/${this.data.userInfo.user_id}/read`),
      method: 'POST',
      data: { activityId }
    });
  },

  markAllActivitiesRead() {
    if (!this.data.unreadActivityCount) return;
    wx.request({
      url: apiConfig.getFullURL(`/user-activity/${this.data.userInfo.user_id}/read`),
      method: 'POST',
      data: {},
      success: res => {
        if (res.data.code === 200) this.setData({
          activityList: this.data.activityList.map(item => ({ ...item, is_read: true })),
          unreadActivityCount: 0
        });
      }
    });
  },

  formatTime(value) {
    if (!value) return '';
    const date = new Date(value);
    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}小时前`;
    if (minutes < 10080) return `${Math.floor(minutes / 1440)}天前`;
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  navigateToChat(e) {
    wx.navigateTo({ url: `/pages/chat/chat?partnerId=${e.currentTarget.dataset.id}` });
  },

  navigateToActivity(e) {
    const { id, postid, userid } = e.currentTarget.dataset;
    this.markActivityRead(id);
    if (postid) wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${postid}` });
    else if (userid) wx.navigateTo({ url: `/pages/user-info/user-info?userId=${userid}` });
  },

  navigateToLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  reloadActivity() {
    this.loadActivityList(true);
  },

  onReachBottom() {
    if (this.data.currentTab === 'activity') this.loadActivityList(false);
  }
});
