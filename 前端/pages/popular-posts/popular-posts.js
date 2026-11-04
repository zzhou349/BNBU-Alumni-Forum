const apiConfig = require('../../config/api.js');

Page({
    data: {
      activeTab: 'hot', // 'hot'或'new'
      posts: [],
      currentPage: 1,
      isLoading: false,
      isLoadingMore: false,
      isEnd: false,
      userId: null,
      zoneData: {
        id: '0',
        title: '高赞合集',
        postCount: 0,
        description: '社区热门内容合集，展示点赞数高的优质帖子',
        gradient: 'linear-gradient(135deg, #FF512F, #DD2476)'
      }
    },

    onLoad(options) {
      const app = getApp();
      const userId = app.globalData.userInfo ? app.globalData.userInfo.user_id : null;

      // 更新标题和描述（如果从参数传入）
      if (options.name) {
        this.setData({
          'zoneData.title': options.name,
          userId
        });
      }

      this.loadPopularPosts('hot', 1);
    },

    // 加载高赞帖子
    loadPopularPosts(sortType, page = 1) {
      if (this.data.isLoading || this.data.isEnd) return;

      this.setData({
        isLoading: page === 1,
        isLoadingMore: page > 1
      });

      wx.request({
        url: apiConfig.getFullURL('/popular-posts'),
        method: 'GET',
        data: {
          page: page,
          pageSize: 10,
          sortBy: sortType === 'hot' ? 'likes' : 'time',
          minLikes: 2, // 提高点赞阈值，确保是真正的高赞内容
          userId: this.data.userId
        },
        success: (res) => {
          if (res.data.code === 200) {
            const newPosts = res.data.data.map(post => ({
              ...post,
              id: post.post_id || post.id,
              username: post.username || post.author,
              avatar: post.avatar || '/assets/avatar.png',
              time: this.formatTime(post.time || post.created_at),
              title: post.title,
              content: post.content || post.post_content,
              images: post.images || [],
              zone: post.zone || ['未知专区'],
              likeCount: post.likeCount || post.like_count || 0,
              collectCount: post.collectCount || post.collect_count || 0,
              commentCount: post.commentCount || post.comment_count || 0,
              isLiked: post.isLiked || post.is_liked || false,
              isCollected: post.isCollected || post.is_collected || false
            }));

            const isEnd = newPosts.length < 10 || (page * 10) >= res.data.total;
            this.setData({
              posts: page === 1 ? newPosts : [...this.data.posts, ...newPosts],
              currentPage: page,
              isEnd,
              'zoneData.postCount': res.data.total || 0
            });
          }
        },
        complete: () => {
          this.setData({
            isLoading: false,
            isLoadingMore: false
          });
        }
      });
    },

    // 切换排序
    switchTab(e) {
      const tab = e.currentTarget.dataset.tab;
      if (tab === this.data.activeTab) return;

      this.setData({
        activeTab: tab,
        posts: [],
        currentPage: 1,
        isEnd: false
      });
      this.loadPopularPosts(tab, 1);
    },

    // 加载更多
    loadMore() {
      if (this.data.isLoadingMore || this.data.isEnd) return;
      this.loadPopularPosts(this.data.activeTab, this.data.currentPage + 1);
    },

    // 预览图片
    previewImage(e) {
      const currentUrl = e.currentTarget.dataset.url;
      const index = e.currentTarget.dataset.index;

      wx.previewImage({
        current: currentUrl,
        urls: this.data.posts.find(p => p.images.includes(currentUrl)).images
      });
    },

    // 跳转到帖子详情
    navigateToPostDetail(e) {
      const postId = e.currentTarget.dataset.id;
      wx.navigateTo({
        url: `/pages/post-detail/post-detail?id=${postId}`
      });
    },

    // 点赞处理
    handleLike(e) {
      const postId = e.currentTarget.dataset.id;
      const index = this.data.posts.findIndex(p => p.id === postId);
      if (index === -1) return;

      const post = this.data.posts[index];

      if (!this.data.userId) {
        wx.showToast({ title: '请先登录', icon: 'none', duration: 2000 });
        return;
      }

      const isLiked = !post.isLiked;
      const actionType = isLiked ? 'like' : 'unlike';

      // 更新UI
      const newPosts = [...this.data.posts];
      newPosts[index] = {
        ...post,
        isLiked,
        likeCount: isLiked ? post.likeCount + 1 : Math.max(0, post.likeCount - 1)
      };
      this.setData({ posts: newPosts });

      // 发送请求
      wx.request({
        url: apiConfig.getFullURL(`/posts/${postId}/interact`),
        method: 'POST',
        data: { userId: this.data.userId, actionType },
        success: (res) => {
          if (res.data.code !== 200) {
            // 回滚
            const rollbackPosts = [...this.data.posts];
            rollbackPosts[index] = post;
            this.setData({ posts: rollbackPosts });
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        },
        fail: () => {
          // 回滚
          const rollbackPosts = [...this.data.posts];
          rollbackPosts[index] = post;
          this.setData({ posts: rollbackPosts });
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      });
    },

    // 添加收藏处理函数（与zones.js保持一致）
    handleCollect(e) {
        const postId = e.currentTarget.dataset.id;
        const index = this.data.posts.findIndex(p => p.id === postId);
        if (index === -1) return;

        const post = this.data.posts[index];

        if (!this.data.userId) {
          wx.showToast({ title: '请先登录', icon: 'none', duration: 2000 });
          return;
        }

        const isCollected = !post.isCollected;
        const actionType = isCollected ? 'collect' : 'uncollect';

        // 更新UI
        const newPosts = [...this.data.posts];
        newPosts[index] = {
          ...post,
          isCollected,
          collectCount: isCollected ? post.collectCount + 1 : Math.max(0, post.collectCount - 1)
        };
        this.setData({ posts: newPosts });

        // 发送请求
        wx.request({
          url: apiConfig.getFullURL(`/posts/${postId}/interact`),
          method: 'POST',
          data: { userId: this.data.userId, actionType },
          success: (res) => {
            if (res.data.code !== 200) {
              // 回滚
              const rollbackPosts = [...this.data.posts];
              rollbackPosts[index] = post;
              this.setData({ posts: rollbackPosts });
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          },
          fail: () => {
            // 回滚
            const rollbackPosts = [...this.data.posts];
            rollbackPosts[index] = post;
            this.setData({ posts: rollbackPosts });
            wx.showToast({ title: '网络错误', icon: 'none' });
          }
        });
      }

  });