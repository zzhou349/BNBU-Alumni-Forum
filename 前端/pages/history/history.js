const apiConfig = require('../../config/api.js');

Page({
    data: {
      historyList: [], // 所有足迹数据
      isLoading: false,
      isRefreshing: false,
      page: 1,
      pageSize: 10, // 分页大小
      total: 0, // 总记录数
      hasMore: true,
      userId: null
    },

    onLoad() {
      console.log('足迹页面加载');
      const app = getApp();
      if (!app.globalData.isLoggedIn) {
        wx.showToast({ title: '请先登录', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }

      this.setData({
        userId: app.globalData.userInfo.user_id
      });

      this.loadHistory();
    },

    onShow() {
      if (this.data.userId) {
        this.loadHistory();
      }
    },

    loadHistory(isRefresh = false) {
        const { userId } = this.data;
        if (!userId || isNaN(userId) || userId <= 0) {
          console.error('无效的用户ID:', userId);
          wx.showToast({ title: '用户信息错误', icon: 'none' });
          this.setData({ isLoading: false, isRefreshing: false });
          return;
        }

        if (this.data.isLoading || (!this.data.hasMore && !isRefresh)) return;

        this.setData({ isLoading: true });
        const { page, pageSize } = this.data;

        wx.request({
            url: apiConfig.getFullURL(`/user/${userId}/browsing-history`),
            method: 'GET',
            data: {
              page: isRefresh ? 1 : page,
              pageSize: pageSize
            },
            success: (res) => {
              if (res.data.code === 200) {
                const serverData = res.data.data || [];
                console.log("1. 服务器原始数据长度：", serverData.length);

                // 获取总记录数
                const total = res.data.total || 0;
                console.log("总记录数：", total);

                const formattedHistory = serverData.map(item => {
                  const timestamp = new Date(item.browsed_at).getTime();
                  return {
                    history_id: item.history_id,
                    post_id: item.post_id,
                    title: item.title,
                    author: item.author,
                    view_time: timestamp,
                    view_time_text: this.formatViewTime(timestamp)
                  };
                });
                console.log("2. 格式化后数据长度：", formattedHistory.length);

                const historyList = isRefresh
                  ? formattedHistory
                  : [...this.data.historyList, ...formattedHistory];
                console.log("3. 合并后数据长度：", historyList.length);

                const uniqueHistory = Array.from(
                  new Map(historyList.map(item => [item.history_id, item])).values()
                ).sort((a, b) => b.view_time - a.view_time);
                console.log("4. 去重后数据长度：", uniqueHistory.length);

                // 使用正确的total变量
                const hasMore = uniqueHistory.length < total;

                this.setData({
                  historyList: uniqueHistory,
                  page: isRefresh ? 2 : page + 1,
                  total: total, // 保存总记录数到data中
                  hasMore: hasMore,
                  isLoading: false,
                  isRefreshing: false
                }, () => {
                  wx.setStorageSync('user_history', uniqueHistory);
                });
              } else {
                console.error('服务器数据错误:', res.data.message);
                this.setData({ isLoading: false, isRefreshing: false });
              }
            },
            fail: (err) => {
              console.error('服务器请求失败', err);
              this.setData({ isLoading: false, isRefreshing: false });
            }
        });
    },

    onRefresh() {
      this.setData({
        isRefreshing: true,
        page: 1,
        hasMore: true
      });
      this.loadHistory(true);
    },

    formatViewTime(timestamp) {
      const now = new Date().getTime();
      const diff = now - timestamp;
      const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return '今天';
      if (diffDays === 1) return '昨天';
      if (diffDays < 7) return `${diffDays}天前`;

      const date = new Date(timestamp);
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    },

    // 加载更多
    loadMoreHistory() {
      this.loadHistory();
    },

    // 跳转到帖子详情
    navigateToPost(e) {
      const postId = e.currentTarget.dataset.post_id;
      wx.navigateTo({
        url: `/pages/post-detail/post-detail?id=${postId}`
      });
    },

    // 预览图片
    previewImage(e) {
      const currentUrl = e.currentTarget.dataset.url;
      const postId = e.currentTarget.dataset.postId;
      const post = this.data.historyList.find(p => p.post_id === postId);
      if (post?.images) {
        wx.previewImage({ current: currentUrl, urls: post.images });
      }
      e.stopPropagation();
    },

    // 处理点赞
    handleLike(e) {
      const postId = e.currentTarget.dataset.id;
      const index = this.data.historyList.findIndex(p => p.post_id === postId);
      if (index === -1) return;

      const post = this.data.historyList[index];
      const isLiked = !post.isLiked;
      const newHistory = [...this.data.historyList];
      newHistory[index] = {
        ...post,
        isLiked,
        like_count: isLiked ? (post.like_count || 0) + 1 : Math.max(0, (post.like_count || 0) - 1)
      };

      this.setData({ historyList: newHistory });
      const allIndex = this.data.historyList.findIndex(p => p.post_id === postId);
      if (allIndex !== -1) {
        const allHistory = [...this.data.historyList];
        allHistory[allIndex] = newHistory[index];
        wx.setStorageSync('user_history', allHistory);
      }

      // 同步到服务器
      wx.request({
        url: apiConfig.getFullURL(`/posts/${postId}/interact`),
        method: 'POST',
        data: {
          userId: this.data.userId,
          actionType: isLiked ? 'like' : 'unlike'
        }
      });

      wx.showToast({ title: isLiked ? '点赞成功' : '取消点赞', icon: 'success' });
      e.stopPropagation();
    },

    // 处理收藏
    handleCollect(e) {
      const postId = e.currentTarget.dataset.id;
      const index = this.data.historyList.findIndex(p => p.post_id === postId);
      if (index === -1) return;

      const post = this.data.historyList[index];
      const isCollected = !post.isCollected;
      const newHistory = [...this.data.historyList];
      newHistory[index] = {
        ...post,
        isCollected,
        collect_count: isCollected ? (post.collect_count || 0) + 1 : Math.max(0, (post.collect_count || 0) - 1)
      };

      this.setData({ historyList: newHistory });
      const allIndex = this.data.historyList.findIndex(p => p.post_id === postId);
      if (allIndex !== -1) {
        const allHistory = [...this.data.historyList];
        allHistory[allIndex] = newHistory[index];
        wx.setStorageSync('user_history', allHistory);
      }

      // 同步到服务器
      wx.request({
        url: apiConfig.getFullURL(`/posts/${postId}/interact`),
        method: 'POST',
        data: {
          userId: this.data.userId,
          actionType: isCollected ? 'collect' : 'uncollect'
        }
      });

      wx.showToast({ title: isCollected ? '收藏成功' : '取消收藏', icon: 'success' });
      e.stopPropagation();
    },

    // 清空足迹
    clearHistory() {
      const { userId } = this.data;
      if (!userId || isNaN(userId) || userId <= 0) {
        console.error('无效的用户ID:', userId);
        wx.showToast({ title: '用户信息错误', icon: 'none' });
        return;
      }

      wx.showModal({
        title: '确认清空',
        content: '确定要清空所有浏览记录吗？',
        success: (res) => {
          if (res.confirm) {
            wx.request({
              url: apiConfig.getFullURL(`/user/${userId}/browsing-history`),
              method: 'DELETE',
              success: () => {
                console.log('服务器足迹已清空');
              },
              fail: (err) => {
                console.error('服务器清空失败:', err);
              },
              complete: () => {
                wx.removeStorageSync('user_history');
                this.setData({
                  historyList: [],
                  page: 1,
                  total: 0,
                  hasMore: false
                });
                wx.showToast({ title: '清空成功', icon: 'success' });
              }
            });
          }
        }
      });
    },
  });