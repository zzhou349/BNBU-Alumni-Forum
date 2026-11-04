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
      userInfo: {
        userId: '',
        username: '',
        avatar: '',
        bio: '',
        postCount: 0,
        followersCount: 0,
        followingCount: 0
      },
      userPosts: [],
      isFollowing: false,
      isLoading: true,
      currentPage: 1,
      hasMore: true,
      currentUserId: null
    },

    onLoad: function(options) {
      const app = getApp();
      const currentUser = app.globalData.userInfo;

      this.setData({
        currentUserId: currentUser ? currentUser.user_id : null
      });

      // 加载用户详细信息
      this.loadUserDetails(options.userId);

      // 加载用户帖子
      this.loadUserPosts(options.userId);
    },

    // 加载用户详细信息
    loadUserDetails: function(userId) {
      const that = this;

      wx.request({
        url: apiConfig.getFullURL(`/user/${userId}`),
        method: 'GET',
        data: {
          currentUserId: that.data.currentUserId
        },
        success: (res) => {
          if (res.statusCode === 200 && res.data.code === 200) {
            const userData = res.data.data;
            that.setData({
              userInfo: {
                userId: userData.user.userId,
                username: userData.user.username,
                avatar: userData.user.avatar,
                bio: userData.user.bio,
                postCount: userData.postCount,
                followersCount: userData.followersCount,
                followingCount: userData.followingCount
              },
              isFollowing: userData.isFollowing
            });
          } else {
            wx.showToast({
              title: '获取用户信息失败',
              icon: 'none'
            });
          }
          that.setData({ isLoading: false });
        },
        fail: (err) => {
          console.log('获取用户详情失败:', err);
          wx.showToast({
            title: '网络请求失败',
            icon: 'none'
          });
          that.setData({ isLoading: false });
        }
      });
    },

    // 修改loadUserPosts函数
loadUserPosts: function(userId, page = 1) {
    const that = this;

    if (that.data.isLoadingPosts) return;

    that.setData({ isLoadingPosts: true });

    wx.request({
      url: apiConfig.getFullURL(`/user/${userId}/myposts`),
      method: 'GET',
      data: {
        currentUserId: that.data.currentUserId,
        page: page,
        pageSize: 10
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data.code === 200) {
          const newPosts = (res.data.data || []).map(post => ({
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

          const allPosts = page === 1 ? newPosts : [...that.data.userPosts, ...newPosts];

          that.setData({
            userPosts: allPosts,
            currentPage: page,
            hasMore: newPosts.length >= 10
          });
        } else {
          wx.showToast({
            title: '获取帖子失败',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        console.log('获取用户帖子失败:', err);
      },
      complete: () => {
        that.setData({ isLoadingPosts: false });
      }
    });
  },

  // 添加图片预览功能
  previewImage: function(e) {
    const currentUrl = e.currentTarget.dataset.url;
    const index = e.currentTarget.dataset.index;
    const postId = e.currentTarget.dataset.id;

    const post = this.data.userPosts.find(p => p.id === postId);
    if (!post || !post.images) return;

    wx.previewImage({
      current: currentUrl,
      urls: post.images
    });
  },

    // 加载更多帖子
    onReachBottom: function() {
      if (this.data.hasMore && !this.data.isLoadingPosts) {
        this.loadUserPosts(this.data.userInfo.userId, this.data.currentPage + 1);
      }
    },

    openRelations(e) {
      const mode = e.currentTarget.dataset.mode;
      const userId = this.data.userInfo.userId;
      if (!userId || !['followers', 'following'].includes(mode)) return;
      wx.navigateTo({
        url: `/pages/follow/follow?mode=${mode}&userId=${userId}`
      });
    },

    // 关注/取消关注处理
    handleFollow: function() {
      const that = this;

      if (!that.data.currentUserId) {
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        });
        return;
      }

      const action = that.data.isFollowing ? 'unfollow' : 'follow';

      wx.request({
        url: apiConfig.getFullURL(`/follow`),
        method: 'POST',
        data: {
          followerId: that.data.currentUserId,
          followedId: that.data.userInfo.userId,
          action: action
        },
        success: (res) => {
          if (res.statusCode === 200 && res.data.code === 200) {
            const newFollowersCount = that.data.userInfo.followersCount +
                                     (action === 'follow' ? 1 : -1);

            that.setData({
              isFollowing: !that.data.isFollowing,
              'userInfo.followersCount': Math.max(newFollowersCount, 0)
            });

            wx.showToast({
              title: action === 'follow' ? '关注成功' : '已取消关注',
              icon: 'success'
            });
          }
        },
        fail: (err) => {
          console.log('关注操作失败:', err);
          wx.showToast({
            title: '操作失败',
            icon: 'none'
          });
        }
      });
    },

    handleLike: function(e) {
      this.togglePostInteraction(e, 'like');
    },

    handleCollect: function(e) {
      this.togglePostInteraction(e, 'collect');
    },

    togglePostInteraction: function(e, type) {
      const postId = Number(e.currentTarget.dataset.id);
      const index = this.data.userPosts.findIndex(post => Number(post.id) === postId);
      const userId = this.data.currentUserId;
      if (!userId) {
        wx.showToast({ title: '请先登录', icon: 'none' });
        return;
      }
      if (index < 0) return;

      const original = this.data.userPosts[index];
      const stateKey = type === 'like' ? 'isLiked' : 'isCollected';
      const countKey = type === 'like' ? 'likeCount' : 'collectCount';
      const nextState = !original[stateKey];
      const actionType = nextState ? type : `un${type}`;
      const posts = [...this.data.userPosts];
      posts[index] = {
        ...original,
        [stateKey]: nextState,
        [countKey]: Math.max(0, original[countKey] + (nextState ? 1 : -1))
      };
      this.setData({ userPosts: posts });

      wx.request({
        url: apiConfig.getFullURL(`/posts/${postId}/interact`),
        method: 'POST',
        data: { userId, actionType },
        success: (res) => {
          if (res.data.code !== 200) {
            const rollback = [...this.data.userPosts];
            rollback[index] = original;
            this.setData({ userPosts: rollback });
            wx.showToast({ title: res.data.message || '操作失败', icon: 'none' });
          }
        },
        fail: () => {
          const rollback = [...this.data.userPosts];
          rollback[index] = original;
          this.setData({ userPosts: rollback });
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      });
    },

    // 发送私聊
    sendPrivateMessage: function() {
      const that = this;

      if (!that.data.currentUserId) {
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        });
        return;
      }

      if (that.data.currentUserId === that.data.userInfo.userId) {
        wx.showToast({
          title: '不能给自己发私聊',
          icon: 'none'
        });
        return;
      }

      // 跳转到聊天页面
      wx.navigateTo({
        url: `/pages/chat/chat?partnerId=${that.data.userInfo.userId}&partnerName=${that.data.userInfo.username}&partnerAvatar=${that.data.userInfo.avatar}`
      });
    },

    // 跳转到帖子详情
    navigateToPostDetail: function(e) {
      const postId = e.currentTarget.dataset.id;
      wx.navigateTo({
        url: `/pages/post-detail/post-detail?id=${postId}`
      });
    },

    onShareAppMessage: function() {
      return {
        title: `${this.data.userInfo.username}的个人主页`,
        path: `/pages/user-info/user-info?userId=${this.data.userInfo.userId}`
      };
    }
  });
