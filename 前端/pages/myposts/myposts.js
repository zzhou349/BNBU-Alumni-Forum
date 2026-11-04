const apiConfig = require('../../config/api.js');

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  Page({
    data: {
      myPosts: [],
      isLoading: false,
      hasMore: true,
      page: 1,
      pageSize: 10,
      userId: null // 当前登录用户ID
    },

    onLoad() {
      const app = getApp();
      const userId = app.globalData.userInfo ? app.globalData.userInfo.user_id : null;
      if (!userId) {
        wx.showToast({ title: '请先登录', icon: 'none' });
        return;
      }

      this.setData({ userId });
      this.loadMyPosts();
    },

    onPullDownRefresh() {
      this.setData({ page: 1, hasMore: true });
      this.loadMyPosts(true);
    },

    // 加载用户自己发布的帖子
    loadMyPosts(refresh = false) {
      if (this.data.isLoading || !this.data.hasMore) return;

      const { userId, page, pageSize } = this.data;

      this.setData({ isLoading: true });

      wx.request({
        url: apiConfig.getFullURL(`/user/${userId}/myposts`),
        method: 'GET',
        data: {
          page,
          pageSize,
          currentUserId: userId // 传递当前登录用户ID（用于获取互动状态）
        },
        success: (res) => {
          wx.stopPullDownRefresh();
          if (res.data.code === 200) {
            const newPosts = res.data.data.map(post => ({
              id: post.post_id,
              user_id: post.user_id,
              username: post.username || '未知用户',
              avatar: post.avatar || '/assets/avatar.png',
              time: formatTime(post.created_at),
              title: post.title,
              content: post.post_content,
              images: post.images || [],
              zone: post.zone ? [post.zone] : ['未知专区'],
              likeCount: post.like_count || 0,
              collectCount: post.collect_count || 0,
              commentCount: post.comment_count || 0,
              isLiked: post.is_liked || false,
              isCollected: post.is_collected || false
            }));

            let myPosts = refresh ? newPosts : [...this.data.myPosts, ...newPosts];

            this.setData({
              myPosts,
              page: this.data.page + 1,
              hasMore: newPosts.length >= this.data.pageSize
            });
          } else {
            wx.showToast({ title: '加载失败', icon: 'none' });
          }
        },
        fail: () => {
          wx.stopPullDownRefresh();
          wx.showToast({ title: '网络错误', icon: 'none' });
        },
        complete: () => {
          this.setData({ isLoading: false });
        }
      });
    },

    // 预览图片
    previewImage: function(e) {
      const currentUrl = e.currentTarget.dataset.url;
      const index = e.currentTarget.dataset.index;
      const postId = e.currentTarget.dataset.id;

      const post = this.data.myPosts.find(p => p.id === postId);
      if (!post || !post.images) return;

      wx.previewImage({
        current: currentUrl,
        urls: post.images
      });

      e.stopPropagation();
    },

    // 跳转到帖子详情
    navigateToPostDetail: function(e) {
      const postId = e.currentTarget.dataset.id;
      wx.navigateTo({
        url: `/pages/post-detail/post-detail?id=${postId}`
      });
    },

    onAvatarTap: function(e) {
      const userId = Number(e.currentTarget.dataset.userid);
      if (!userId) return;
      wx.navigateTo({ url: `/pages/user-info/user-info?userId=${userId}` });
    },

    // 点赞处理
    handleLike: function(e) {
      const postId = e.currentTarget.dataset.id;
      const index = this.data.myPosts.findIndex(p => p.id === postId);
      if (index === -1) return;

      const post = this.data.myPosts[index];

      // 检查是否登录
      const app = getApp();
      const userId = app.globalData.userInfo ? app.globalData.userInfo.user_id : null;
      if (!userId) {
        wx.showToast({
          title: '请先登录',
          icon: 'none',
          duration: 2000
        });
        return;
      }

      const isLiked = !post.isLiked;
      const actionType = isLiked ? 'like' : 'unlike';

      // 更新UI
      const newMyPosts = [...this.data.myPosts];
      newMyPosts[index] = {
        ...post,
        isLiked: isLiked,
        likeCount: isLiked ? post.likeCount + 1 : Math.max(0, post.likeCount - 1)
      };
      this.setData({ myPosts: newMyPosts });

      // 发送请求
      wx.request({
        url: apiConfig.getFullURL(`/posts/${postId}/interact`),
        method: 'POST',
        data: {
          userId: userId,
          actionType: actionType
        },
        success: (res) => {
          if (res.data.code !== 200) {
            // 回滚
            const rollbackPosts = [...this.data.myPosts];
            rollbackPosts[index] = post;
            this.setData({ myPosts: rollbackPosts });
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        },
        fail: () => {
          const rollbackPosts = [...this.data.myPosts];
          rollbackPosts[index] = post;
          this.setData({ myPosts: rollbackPosts });
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      });
    },

    // 收藏处理
    handleCollect: function(e) {
      const postId = e.currentTarget.dataset.id;
      const index = this.data.myPosts.findIndex(p => p.id === postId);
      if (index === -1) return;

      const post = this.data.myPosts[index];

      const app = getApp();
      const userId = app.globalData.userInfo ? app.globalData.userInfo.user_id : null;
      if (!userId) {
        wx.showToast({
          title: '请先登录',
          icon: 'none',
          duration: 2000
        });
        return;
      }

      const isCollected = !post.isCollected;
      const actionType = isCollected ? 'collect' : 'uncollect';

      // 更新UI
      const newMyPosts = [...this.data.myPosts];
      newMyPosts[index] = {
        ...post,
        isCollected: isCollected,
        collectCount: isCollected ? post.collectCount + 1 : Math.max(0, post.collectCount - 1)
      };
      this.setData({ myPosts: newMyPosts });

      // 发送请求
      wx.request({
        url: apiConfig.getFullURL(`/posts/${postId}/interact`),
        method: 'POST',
        data: {
          userId: userId,
          actionType: actionType
        },
        success: (res) => {
          if (res.data.code !== 200) {
            // 操作失败，回滚
            const rollbackPosts = [...this.data.myPosts];
            rollbackPosts[index] = post;
            this.setData({ myPosts: rollbackPosts });
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        },
        fail: () => {
          const rollbackPosts = [...this.data.myPosts];
          rollbackPosts[index] = post;
          this.setData({ myPosts: rollbackPosts });
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      });
    },

    onReachBottom() {
      if (!this.data.isLoading && this.data.hasMore) {
        this.loadMyPosts();
      }
    },

    // 删除帖子
    handleDelete: function(e) {
      const postId = e.currentTarget.dataset.id;
      const index = this.data.myPosts.findIndex(p => p.id === postId);
      if (index === -1) return;

      const post = this.data.myPosts[index];

      wx.showModal({
        title: '确认删除',
        content: '确定要删除这篇帖子吗？',
        success: (res) => {
          if (res.confirm) {
            // 发送删除请求
            wx.request({
              url: apiConfig.getFullURL(`/posts/${postId}`),
              method: 'DELETE',
              data: {
                userId: this.data.userId
              },
              success: (res) => {
                if (res.data.code === 200) {
                  // 从列表中移除
                  const updatedPosts = this.data.myPosts.filter(p => p.id !== postId);
                  this.setData({ myPosts: updatedPosts });
                  wx.showToast({ title: '删除成功' });
                } else {
                  wx.showToast({ title: '删除失败', icon: 'none' });
                }
              },
              fail: () => {
                wx.showToast({ title: '网络错误', icon: 'none' });
              }
            });
          }
        }
      });
    }
  });
