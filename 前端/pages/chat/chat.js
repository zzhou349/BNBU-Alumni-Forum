const apiConfig = require('../../config/api.js');

Page({
  data: {
    messages: [],
    partnerInfo: {},
    inputMessage: '',
    userInfo: null,
    partnerId: null,
    scrollIntoView: '',
    loading: false,
    isLoadingMore: false,
    hasMoreMessages: true,
    isSending: false
  },

  onLoad(options) {
    const app = getApp();
    const partnerId = Number(options.partnerId);
    if (!app.globalData.isLoggedIn || !partnerId) {
      wx.showToast({ title: !partnerId ? '聊天对象无效' : '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    this.setData({ userInfo: app.globalData.userInfo, partnerId });
    this.loadPartnerInfo();
    this.loadMessages();
  },

  onShow() {
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.fetchNewMessages(), 5000);
  },

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  },

  loadPartnerInfo() {
    wx.request({
      url: apiConfig.getFullURL(`/user/${this.data.partnerId}`),
      success: res => {
        if (res.data.code === 200) this.setData({ partnerInfo: res.data.data.user });
      }
    });
  },

  formatMessages(rows) {
    return (rows || []).map(message => ({
      ...message,
      isMe: Number(message.sender_id) === Number(this.data.userInfo.user_id),
      time: this.formatTime(message.created_time)
    }));
  },

  loadMessages() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    wx.request({
      url: apiConfig.getFullURL(`/messages/${this.data.userInfo.user_id}/${this.data.partnerId}`),
      data: { pageSize: 30 },
      success: res => {
        if (res.data.code !== 200) return wx.showToast({ title: res.data.message || '加载消息失败', icon: 'none' });
        const messages = this.formatMessages(res.data.data);
        this.setData({ messages, hasMoreMessages: Boolean(res.data.hasMore) });
        this.scrollToBottom();
      },
      fail: () => wx.showToast({ title: '加载消息失败', icon: 'none' }),
      complete: () => this.setData({ loading: false })
    });
  },

  loadMoreMessages() {
    if (this.data.isLoadingMore || !this.data.hasMoreMessages || !this.data.messages.length) return;
    const anchorId = this.data.messages[0].message_id;
    this.setData({ isLoadingMore: true });
    wx.request({
      url: apiConfig.getFullURL(`/messages/${this.data.userInfo.user_id}/${this.data.partnerId}`),
      data: { pageSize: 30, beforeId: anchorId },
      success: res => {
        if (res.data.code !== 200) return;
        const older = this.formatMessages(res.data.data);
        const known = new Set(this.data.messages.map(item => String(item.message_id)));
        this.setData({
          messages: [...older.filter(item => !known.has(String(item.message_id))), ...this.data.messages],
          hasMoreMessages: Boolean(res.data.hasMore),
          scrollIntoView: `message-${anchorId}`
        });
      },
      complete: () => this.setData({ isLoadingMore: false })
    });
  },

  fetchNewMessages() {
    if (!this.data.userInfo || !this.data.partnerId || this.data.loading) return;
    const persisted = this.data.messages.filter(item => typeof item.message_id === 'number');
    const afterId = persisted.length ? persisted[persisted.length - 1].message_id : 0;
    wx.request({
      url: apiConfig.getFullURL(`/messages/${this.data.userInfo.user_id}/${this.data.partnerId}`),
      data: afterId ? { afterId, pageSize: 100 } : { pageSize: 100 },
      success: res => {
        if (res.data.code !== 200 || !res.data.data?.length) return;
        const known = new Set(this.data.messages.map(item => String(item.message_id)));
        const incoming = this.formatMessages(res.data.data).filter(item => !known.has(String(item.message_id)));
        if (!incoming.length) return;
        this.setData({ messages: [...this.data.messages, ...incoming] });
        this.scrollToBottom();
      }
    });
  },

  sendMessage() {
    const content = this.data.inputMessage.trim();
    if (!content || this.data.isSending) return;
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      message_id: tempId,
      sender_id: this.data.userInfo.user_id,
      receiver_id: this.data.partnerId,
      message_content: content,
      created_time: new Date().toISOString(),
      isMe: true,
      time: '刚刚',
      pending: true
    };
    this.setData({ messages: [...this.data.messages, optimistic], inputMessage: '', isSending: true });
    this.scrollToBottom();
    wx.request({
      url: apiConfig.getFullURL('/send-message'),
      method: 'POST',
      data: { sender_id: this.data.userInfo.user_id, receiver_id: this.data.partnerId, content },
      success: res => {
        if (res.data.code !== 200) {
          this.setData({ messages: this.data.messages.filter(item => item.message_id !== tempId) });
          wx.showToast({ title: res.data.message || '发送失败', icon: 'none' });
          return;
        }
        this.setData({ messages: this.data.messages.map(item => item.message_id === tempId ? {
          ...item,
          message_id: res.data.data.message_id,
          created_time: res.data.data.created_time,
          pending: false
        } : item) });
      },
      fail: () => {
        this.setData({ messages: this.data.messages.filter(item => item.message_id !== tempId) });
        wx.showToast({ title: '网络请求失败', icon: 'none' });
      },
      complete: () => this.setData({ isSending: false })
    });
  },

  formatTime(value) {
    if (!value) return '';
    const date = new Date(value);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  },

  scrollToBottom() {
    setTimeout(() => {
      const last = this.data.messages[this.data.messages.length - 1];
      if (last) this.setData({ scrollIntoView: `message-${last.message_id}` });
    }, 80);
  },

  onInputMessage(e) {
    this.setData({ inputMessage: e.detail.value });
  },

  onAvatarTap(e) {
    const { userid, username, avatar } = e.currentTarget.dataset;
    if (!userid) return;
    wx.navigateTo({ url: `/pages/user-info/user-info?userId=${userid}&username=${encodeURIComponent(username || '')}&avatar=${encodeURIComponent(avatar || '')}` });
  }
});
