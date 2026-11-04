const apiConfig = require('../../config/api.js');

// 时间格式化函数（与首页一致）
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
      collectedPosts: [],
      isLoading: false,
      hasMore: true,
      page: 1,
      pageSize: 10
    },

    onLoad() {
      this.loadCollectedPosts();
    },

    onPullDownRefresh() {
      this.setData({ page: 1, hasMore: true });
      this.loadCollectedPosts(true);
    },

    // 加载收藏的帖子
    loadCollectedPosts(refresh = false) {
      if (this.data.isLoading || !this.data.hasMore) return;

      const app = getApp();
      const userId = app.globalData.userInfo ? app.globalData.userInfo.user_id : null;

      if (!userId) {
        wx.showToast({ title: '请先登录', icon: 'none' });
        return;
      }

      this.setData({ isLoading: true });

      wx.request({
        url: apiConfig.getFullURL(`/user/${userId}/collected-posts`),
        method: 'GET',
        data: {
          page: this.data.page,
          pageSize: this.data.pageSize
        },
        success: (res) => {
          wx.stopPullDownRefresh();
          if (res.data.code === 200) {
            // 调整数据结构与首页一致
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
              isCollected: true
            }));

            let collectedPosts = refresh ? newPosts : [...this.data.collectedPosts, ...newPosts];

            this.setData({
              collectedPosts,
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

      const post = this.data.collectedPosts.find(p => p.id === postId);
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
      const index = this.data.collectedPosts.findIndex(p => p.id === postId);
      if (index === -1) return;

      const post = this.data.collectedPosts[index];

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
      const newCollectedPosts = [...this.data.collectedPosts];
      newCollectedPosts[index] = {
        ...post,
        isLiked: isLiked,
        likeCount: isLiked ? post.likeCount + 1 : Math.max(0, post.likeCount - 1)
      };
      this.setData({ collectedPosts: newCollectedPosts });

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
            const rollbackPosts = [...this.data.collectedPosts];
            rollbackPosts[index] = post;
            this.setData({ collectedPosts: rollbackPosts });
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        },
        fail: () => {
          const rollbackPosts = [...this.data.collectedPosts];
          rollbackPosts[index] = post;
          this.setData({ collectedPosts: rollbackPosts });
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      });
    },

    // 收藏处理（特别注意：取消收藏后需移除该帖子）
    handleCollect: function(e) {
      const postId = e.currentTarget.dataset.id;
      const index = this.data.collectedPosts.findIndex(p => p.id === postId);
      if (index === -1) return;

      const post = this.data.collectedPosts[index];

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
      const newCollectedPosts = [...this.data.collectedPosts];
      newCollectedPosts[index] = {
        ...post,
        isCollected: isCollected,
        collectCount: isCollected ? post.collectCount + 1 : Math.max(0, post.collectCount - 1)
      };
      this.setData({ collectedPosts: newCollectedPosts });

      // 发送请求
      wx.request({
        url: apiConfig.getFullURL(`/posts/${postId}/interact`),
        method: 'POST',
        data: {
          userId: userId,
          actionType: actionType
        },
        success: (res) => {
          if (res.data.code === 200) {
            // 如果取消收藏成功，则移除该帖子
            if (!isCollected) {
              const updatedPosts = this.data.collectedPosts.filter(p => p.id !== postId);
              this.setData({ collectedPosts: updatedPosts });
            }
          } else {
            // 操作失败，回滚
            const rollbackPosts = [...this.data.collectedPosts];
            rollbackPosts[index] = post;
            this.setData({ collectedPosts: rollbackPosts });
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        },
        fail: () => {
          const rollbackPosts = [...this.data.collectedPosts];
          rollbackPosts[index] = post;
          this.setData({ collectedPosts: rollbackPosts });
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      });
    },

    onReachBottom() {
      if (!this.data.isLoading && this.data.hasMore) {
        this.loadCollectedPosts();
      }
    }
  });
