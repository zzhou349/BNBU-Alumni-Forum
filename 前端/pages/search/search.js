const apiConfig = require('../../config/api.js');

// 时间格式化函数（与收藏页一致）
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
      searchKeyword: "",
      currentTab: "posts", // 默认显示帖子标签
      // 搜索状态
      isLoading: false,
      errorMessage: "",
      hasSearched: false, // 是否执行过搜索
      // 帖子数据（改为与收藏页一致的命名）
      collectedPosts: [],
      page: 1,
      pageSize: 10,
      hasMore: true,
      // 用户数据
      userList: []
    },

    onLoad(options) {
      if (options.keyword) {
        this.setData({
          searchKeyword: options.keyword
        }, () => {
          // 若携带关键词，自动执行搜索
          this.performSearch();
        });
      }
    },

    // 切换标签页
    switchTab(e) {
      const tab = e.currentTarget.dataset.tab;
      this.setData({ currentTab: tab });
    },

    // 搜索输入处理
    onSearchInput(e) {
      this.setData({ searchKeyword: e.detail.value });
    },

    // 执行搜索（核心逻辑）
    performSearch() {
      const keyword = this.data.searchKeyword.trim();
      if (!keyword) {
        wx.showToast({ title: "请输入搜索关键词", icon: "none" });
        return;
      }

      // 重置状态
      this.setData({
        isLoading: true,
        errorMessage: "",
        hasSearched: true,
        // 重置帖子分页
        collectedPosts: [],
        page: 1,
        hasMore: true,
        // 重置用户数据
        userList: []
      });

      // 同时请求帖子和用户数据
      Promise.all([
        this.searchPosts(keyword, 1),
        this.searchUsers(keyword)
      ]).then(() => {
        this.setData({ isLoading: false });
      }).catch(err => {
        this.setData({
          isLoading: false,
          errorMessage: err || "搜索失败，请重试"
        });
      });
    },

    // 搜索帖子（改为与收藏页一致的格式）
    searchPosts(keyword, page) {
      return new Promise((resolve, reject) => {
        const { pageSize } = this.data;
        // 获取当前用户ID用于获取互动状态
        const userInfo = wx.getStorageSync('userInfo') || {};
        const userId = userInfo.user_id || '';

        wx.request({
          url: apiConfig.getFullURL(`/search/posts`),
          method: "GET",
          data: {
            keyword,
            page,
            pageSize,
            userId // 传递用户ID获取互动状态
          },
          timeout: 10000,
          success: (res) => {
            if (!res.data || res.data.code !== 200) {
              reject(res.data?.message || "帖子搜索失败");
              return;
            }

            const newPosts = Array.isArray(res.data.data) ? res.data.data : [];
            // 格式化帖子数据（改为与收藏页一致的格式）
            const formattedPosts = newPosts.map(item => ({
              id: item.id || item.post_id || "",
              title: item.title || "无标题",
              content: item.content || item.post_content || "",
              images: item.images ? (
                Array.isArray(item.images) ? item.images :
                item.images.split(',').filter(img => img)
              ) : [],
              createTime: formatTime(item.created_at || item.createTime),
              likeCount: item.likeCount || item.like_count || 0,
              collectCount: item.collectCount || item.collect_count || 0,
              commentCount: item.commentCount || item.comment_count || 0,
              zone: item.zone || "",
              author: {
                id: item.userId || item.user_id || "",
                name: item.username || "",
                avatar: item.avatar || "/assets/avatar.png"
              },
              // 互动状态
              isLiked: !!item.isLiked,
              isCollected: !!item.isCollected
            }));

            // 使用后端返回的hasMore判断是否有更多数据
            const hasMore = res.data.hasMore;

            this.setData({
              collectedPosts: page === 1 ? formattedPosts : [...this.data.collectedPosts, ...formattedPosts],
              page: page,
              hasMore: hasMore
            });
            resolve();
          },
          fail: () => {
            reject("网络错误，帖子搜索失败");
          }
        });
      });
    },

    // 搜索用户（保持不变）
    searchUsers(keyword) {
      return new Promise((resolve, reject) => {
        wx.request({
          url: apiConfig.getFullURL(`/search/users`),
          method: "GET",
          data: { keyword },
          timeout: 10000,
          success: (res) => {
            if (!res.data || res.data.code !== 200) {
              reject(res.data?.message || "用户搜索失败");
              return;
            }
            this.setData({ userList: res.data.data || [] });
            resolve();
          },
          fail: () => {
            reject("网络错误，用户搜索失败");
          }
        });
      });
    },

    // 加载更多帖子（改为与收藏页一致的命名）
    loadMorePosts() {
      if (this.data.isLoading || !this.data.hasMore) return;

      const nextPage = this.data.page + 1;
      this.setData({ isLoading: true });

      this.searchPosts(this.data.searchKeyword.trim(), nextPage)
        .then(() => {
          this.setData({ isLoading: false });
        })
        .catch(err => {
          this.setData({
            isLoading: false,
            errorMessage: err || "加载更多失败"
          });
        });
    },

    // 预览图片（改为与收藏页一致的实现）
    previewImage(e) {
      const currentUrl = e.currentTarget.dataset.url;
      const postId = e.currentTarget.dataset.id;

      const post = this.data.collectedPosts.find(p => p.id === postId);
      if (!post || !post.images) return;

      wx.previewImage({
        current: currentUrl,
        urls: post.images
      });

      e.stopPropagation();
    },

    // 跳转到帖子详情（改为与收藏页一致的命名）
    navigateToPostDetail(e) {
      const postId = e.currentTarget.dataset.id;
      wx.navigateTo({
        url: `/pages/post-detail/post-detail?id=${postId}`
      });
    },

    // 点赞处理（改为与收藏页一致的实现）
    handleLike(e) {
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

    // 收藏处理（改为与收藏页一致的实现）
    handleCollect(e) {
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

    // 跳转到用户主页（保持不变）
    goToUserProfile(e) {
      const userId = e.currentTarget.dataset.userid;
      const username = e.currentTarget.dataset.username;
      const avatar = e.currentTarget.dataset.avatar;

      if (!userId || !username || !avatar) {
        wx.showToast({ title: "用户数据不完整", icon: "none" });
        return;
      }

      wx.navigateTo({
        url: `/pages/user-info/user-info?userId=${userId}&username=${username}&avatar=${avatar}`
      });
    },

    // 头像点击事件（保持不变）
    onAvatarTap(e) {
      const userId = e.currentTarget.dataset.userid;
      const username = e.currentTarget.dataset.username;
      const avatar = e.currentTarget.dataset.avatar;

      if (!userId || !username || !avatar) {
        wx.showToast({ title: "用户数据不完整", icon: "none" });
        return;
      }

      wx.navigateTo({
        url: `/pages/user-info/user-info?userId=${userId}&username=${username}&avatar=${avatar}`,
        success: () => {
          console.log(`跳转到用户[${username}]信息页面成功`);
        },
        fail: (err) => {
          console.error('跳转失败:', err);
          wx.showToast({ title: '跳转失败', icon: 'none' });
        }
      });

      e.stopPropagation();
    }
  });