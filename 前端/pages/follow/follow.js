const apiConfig = require('../../config/api.js');

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

Page({
  data: {
    mode: 'following',
    targetUserId: null,
    currentUserId: null,
    isOwn: false,
    followList: [],
    isLoading: false,
    errorMessage: '',
    page: 1,
    pageSize: 10,
    hasMore: true,
    total: 0
  },

  onLoad(options) {
    const app = getApp();
    const currentUserId = app.getValidUserId ? app.getValidUserId() : app.globalData.userInfo?.user_id;
    const targetUserId = Number(options.userId || currentUserId);
    const mode = options.mode === 'followers' ? 'followers' : 'following';
    if (!targetUserId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    this.setData({
      mode,
      targetUserId,
      currentUserId: currentUserId || null,
      isOwn: Number(currentUserId) === targetUserId
    });
    wx.setNavigationBarTitle({ title: mode === 'followers' ? '粉丝列表' : '关注列表' });
    this.loadFollowList(true);
  },

  onShow() {
    if (this.hasShown && this.data.targetUserId) this.loadFollowList(true);
    this.hasShown = true;
  },

  loadFollowList(refresh = false) {
    if (this.data.isLoading || (!refresh && !this.data.hasMore) || !this.data.targetUserId) return Promise.resolve();
    const page = refresh ? 1 : this.data.page;
    if (refresh) this.setData({ followList: [], page: 1, hasMore: true });
    this.setData({ isLoading: true, errorMessage: '' });
    return new Promise(resolve => {
      wx.request({
        url: apiConfig.getFullURL(`/user/${this.data.targetUserId}/${this.data.mode}`),
        method: 'GET',
        data: {
          currentUserId: this.data.currentUserId || 0,
          page,
          pageSize: this.data.pageSize
        },
        success: res => {
          if (res.data.code !== 200) {
            this.setData({ errorMessage: res.data.message || '加载列表失败' });
            return;
          }
          const list = (res.data.data || []).map(item => ({
            id: Number(item.user_id || item.id),
            nickname: item.user_nickname || item.nickname || '未知用户',
            avatar: item.avatar || '/assets/avatar.png',
            bio: item.bio || '',
            followTime: formatDate(item.follow_time),
            postCount: Number(item.post_count || 0),
            isFollowing: Boolean(item.is_following)
          }));
          this.setData({
            followList: refresh ? list : [...this.data.followList, ...list],
            page: page + 1,
            total: Number(res.data.total || 0),
            hasMore: Boolean(res.data.hasMore)
          });
        },
        fail: () => this.setData({ errorMessage: '网络错误，加载失败' }),
        complete: () => {
          this.setData({ isLoading: false });
          wx.stopPullDownRefresh();
          resolve();
        }
      });
    });
  },

  reloadList() {
    this.loadFollowList(true);
  },

  navigateToLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  goToUserProfile(e) {
    const item = this.data.followList.find(user => user.id === Number(e.currentTarget.dataset.userid));
    if (!item) return;
    wx.navigateTo({
      url: `/pages/user-info/user-info?userId=${item.id}&username=${encodeURIComponent(item.nickname)}&avatar=${encodeURIComponent(item.avatar)}`
    });
  },

  handleUnfollow(e) {
    const followedId = Number(e.currentTarget.dataset.userid);
    if (!this.data.isOwn || this.data.mode !== 'following' || !followedId) return;
    wx.showModal({
      title: '取消关注',
      content: '确定不再关注该用户吗？',
      success: modal => {
        if (!modal.confirm) return;
        wx.request({
          url: apiConfig.getFullURL('/follow'),
          method: 'POST',
          data: { followerId: this.data.currentUserId, followedId, action: 'unfollow' },
          success: res => {
            if (res.data.code !== 200) return wx.showToast({ title: res.data.message || '操作失败', icon: 'none' });
            this.setData({
              followList: this.data.followList.filter(item => item.id !== followedId),
              total: Math.max(0, this.data.total - 1)
            });
            wx.showToast({ title: '已取消关注', icon: 'success' });
          },
          fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' })
        });
      }
    });
  },

  onPullDownRefresh() {
    this.loadFollowList(true);
  },

  onReachBottom() {
    this.loadFollowList(false);
  }
});
