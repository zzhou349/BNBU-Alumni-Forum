const apiConfig = require('../../config/api.js');

Page({
    data: {
      hotEvents: [
        { id: 1, title: "学校D校校庆典", image: "/assets/event1.png" },
        { id: 2, title: "学校中黑活动", image: "/assets/event2.png" }
      ],
      zones: [
        "岗位内推", "职场咨询", "创业合作", "留学准备",
        "签证申请", "租住交流", "活动攒局", "高赞合集"
      ],
      posts: [],
      isLoading: false,
      isLoadingMore: false,
      page: 1,
      pageSize: 20,
      hasMore: true,
      searchKeyword: "",
      userId: null,
      showReportDialog: false,
      menuTop: 0,
      menuLeft: 0,
      currentReportPostId: null,
      lastTapTime: 0
    },

    onLoad: function() {
        const app = getApp();
        const userId = app.globalData.userInfo ? app.globalData.userInfo.user_id : null;
        this.setData({ userId });
        this.loadPosts();

        // 保存绑定函数的引用
        this.boundUpdatePostStatus = this.updatePostStatus.bind(this);

        app.globalData.eventBus.on('postInteraction', this.boundUpdatePostStatus);
      },

      onUnload: function() {
        const app = getApp();
        // 使用保存的引用移除监听
        app.globalData.eventBus.off('postInteraction', this.boundUpdatePostStatus);
      },

      updatePostStatus: function(data) {
        const { postId, likeCount, isLiked, collectCount, isCollected, commentCount } = data;

        this.setData({
          posts: this.data.posts.map(post => {
            if (post.id === postId) {
              return {
                ...post,
                likeCount,
                isLiked,
                collectCount,
                isCollected,
                commentCount
              };
            }
            return post;
          })
        });
      },

    // 时间格式化
    formatTime: function(timestamp) {
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');

      return `${year}-${month}-${day} ${hours}:${minutes}`;
    },

    // 加载帖子数据
    loadPosts: function(options = {}) {
        const reset = options.reset !== false;
        if (this.data.isLoading || this.data.isLoadingMore || (!reset && !this.data.hasMore)) {
          if (reset) wx.stopPullDownRefresh();
          return;
        }

        const page = reset ? 1 : this.data.page;
        const that = this;
        this.setData(reset ? { isLoading: true, hasMore: true } : { isLoadingMore: true });

        // 添加userId参数
        const params = { page, pageSize: this.data.pageSize };
        if (this.data.userId) {
          params.userId = this.data.userId;
        }

        wx.request({
          url: apiConfig.getFullURL('/posts'),
          method: 'GET',
          data: params, // 传递userId参数
          success: function(res) {
            if (res.data.code === 200) {
              const posts = res.data.data.map(post => {
                return {
                  id: post.post_id,
                  user_id: post.user_id, // 新增
                  username: post.username || '未知用户',
                  avatar: post.avatar || '/assets/avatar.png',
                  time: that.formatTime(post.created_at),
                  title: post.title,
                  content: post.post_content,
                  images: post.images,
                  zone: post.zone_name ? [post.zone_name] : ['未知专区'],
                  likeCount: post.like_count || 0,
                  collectCount: post.collect_count || 0,
                  commentCount: post.comment_count || 0,
                  isLiked: post.is_liked || false,
                  isCollected: post.is_collected || false
                };
              });

              that.setData({
                posts: reset ? posts : [...that.data.posts, ...posts],
                page: page + 1,
                hasMore: Boolean(res.data.hasMore),
                isLoading: false,
                isLoadingMore: false
              });
            } else {
              wx.showToast({ title: res.data.message || '加载失败', icon: 'none' });
            }
          },
          fail: function() {
            wx.showToast({ title: '网络错误', icon: 'none' });
          },
          complete: function() {
            that.setData({ isLoading: false, isLoadingMore: false });
            wx.stopPullDownRefresh();
          }
        });
      },

  onReachBottom() {
    this.loadPosts({ reset: false });
  },

  onPullDownRefresh() {
    this.loadPosts({ reset: true });
  },

  // 预览图片
  previewImage: function(e) {
    const currentUrl = e.currentTarget.dataset.url;
    const postId = e.currentTarget.dataset.id;

    // 找到对应的帖子对象
    const post = this.data.posts.find(p => p.id === postId);
    if (!post || !post.images) return;

    wx.previewImage({
      current: currentUrl, // 当前显示图片的http链接
      urls: post.images   // 需要预览的图片http链接列表
    });

  },

  onPageScroll: function() {
    if (this.data.showReportDialog) {
      this.hideReportDialog();
    }
  },

// 修改showReportDialog方法，使菜单精准显示在more-icon下方
showReportDialog(e) {
    const now = Date.now();
    // 防抖处理
    if (now - this.data.lastTapTime < 300) {
      return;
    }
    this.setData({ lastTapTime: now });

    const id = e.currentTarget.dataset.id;
    const query = wx.createSelectorQuery();

    // 关闭当前已打开的菜单
    if (this.data.showReportDialog) {
      this.hideReportDialog();
      return;
    }

    // 获取"更多"按钮的位置信息（关键：相对于页面的位置）
    query.select(`#more-button-${id}`).boundingClientRect();
    // 获取页面滚动距离
    query.selectViewport().scrollOffset();

    query.exec((res) => {
      try {
        if (res && res[0]) {
          const buttonRect = res[0]; // 按钮位置信息
          const scrollOffset = res[1] || { scrollTop: 0 }; // 页面滚动距离

          // 计算菜单位置（核心修改）
          // 菜单顶部 = 按钮底部 + 页面滚动距离（确保在按钮正下方）
          const menuTop = buttonRect.bottom + scrollOffset.scrollTop;
          // 菜单左侧 = 按钮左侧 + 按钮宽度的一半 - 菜单宽度的一半（水平居中对齐）
          const menuLeft = buttonRect.left + (buttonRect.width / 2) - 90; // 90是菜单宽度的一半(180/2)

          this.setData({
            showReportDialog: true,
            menuTop: menuTop,
            menuLeft: menuLeft,
            currentReportPostId: id
          });
        } else {
          console.error('获取元素位置失败，结果为空');
        }
      } catch (err) {
        console.error('获取元素位置失败:', err);
        wx.showToast({
          title: '操作失败，请重试',
          icon: 'none'
        });
      }
    });
  },

  hideReportDialog() {
    this.setData({
      showReportDialog: false
    });
  },

  handleReport() {
    const postId = this.data.currentReportPostId;
    if (!this.data.userId) {
      this.hideReportDialog();
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    const reasons = ['垃圾广告', '不友善或骚扰', '虚假信息', '违法违规', '其他'];
    this.hideReportDialog();
    wx.showActionSheet({
      itemList: reasons,
      success: action => {
        const reason = reasons[action.tapIndex];
        wx.request({
          url: apiConfig.getFullURL(`/posts/${postId}/report`),
          method: 'POST',
          data: { userId: this.data.userId, reason },
          success: res => wx.showToast({
            title: res.data.code === 200 ? '举报已提交' : (res.data.message || '举报失败'),
            icon: res.data.code === 200 ? 'success' : 'none'
          }),
          fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' })
        });
      }
    });
  },

  onPageTap(e) {
    if (this.data.showReportDialog && !e.target.dataset.isMenu) {
      this.hideReportDialog();
    }
  },

  // 跳转到帖子详情
  navigateToPostDetail: function(e) {
    const postId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/post-detail/post-detail?id=${postId}`
    });
  },

    // 点赞处理
    handleLike: function(e) {
      const postId = e.currentTarget.dataset.id;
      const index = this.data.posts.findIndex(p => p.id === postId);
      if (index === -1) return;

      const post = this.data.posts[index];

      // 检查是否登录
      if (!this.data.userId) {
        wx.showToast({
          title: '请先登录',
          icon: 'none',
          duration: 2000
        });
        return;
      }

      const isLiked = !post.isLiked;
      const actionType = isLiked ? 'like' : 'unlike';

      // 更新UI（即时）
      const newPosts = [...this.data.posts];
      newPosts[index] = {
        ...post,
        isLiked: isLiked,
        likeCount: isLiked ? post.likeCount + 1 : Math.max(0, post.likeCount - 1)
      };
      this.setData({ posts: newPosts });

      // 发送请求到后端
      wx.request({
        url: apiConfig.getFullURL(`/posts/${postId}/interact`),
        method: 'POST',
        data: {
          userId: this.data.userId,
          actionType: actionType
        },
        success: (res) => {
          if (res.data.code !== 200) {
            // 操作失败，回滚状态
            const rollbackPosts = [...this.data.posts];
            rollbackPosts[index] = post;
            this.setData({ posts: rollbackPosts });
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        },
        fail: () => {
          // 网络错误，回滚状态
          const rollbackPosts = [...this.data.posts];
          rollbackPosts[index] = post;
          this.setData({ posts: rollbackPosts });
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      });
    },

    // 收藏处理（类似点赞）
    handleCollect: function(e) {
      const postId = e.currentTarget.dataset.id;
      const index = this.data.posts.findIndex(p => p.id === postId);
      if (index === -1) return;

      const post = this.data.posts[index];

      // 检查是否登录
      if (!this.data.userId) {
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
      const newPosts = [...this.data.posts];
      newPosts[index] = {
        ...post,
        isCollected: isCollected,
        collectCount: isCollected ? post.collectCount + 1 : Math.max(0, post.collectCount - 1)
      };
      this.setData({ posts: newPosts });

      // 发送请求到后端
      wx.request({
        url: apiConfig.getFullURL(`/posts/${postId}/interact`),
        method: 'POST',
        data: {
          userId: this.data.userId,
          actionType: actionType
        },
        success: (res) => {
          if (res.data.code !== 200) {
            // 操作失败，回滚状态
            const rollbackPosts = [...this.data.posts];
            rollbackPosts[index] = post;
            this.setData({ posts: rollbackPosts });
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        },
        fail: () => {
          // 网络错误，回滚状态
          const rollbackPosts = [...this.data.posts];
          rollbackPosts[index] = post;
          this.setData({ posts: rollbackPosts });
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      });
    },

    // 搜索输入
    onSearchInput: function(e) {
      this.setData({
        searchKeyword: e.detail.value
      });
    },

    // 执行搜索
    performSearch: function() {
      const keyword = this.data.searchKeyword.trim();
      if (keyword) {
        wx.navigateTo({
          url: `/pages/search/search?keyword=${encodeURIComponent(keyword)}`
        });
      }
    },

    // 分类点击
    onZoneTap: function(e) {
      const zone = e.currentTarget.dataset.zone;
      wx.navigateTo({
        url: `/pages/zone/zone?name=${encodeURIComponent(zone)}`
      });
    },

    // 悬浮搜索按钮点击事件
    onFloatingSearchTap: function() {
      wx.navigateTo({
        url: '/pages/search/search'
      });
    },

    // 返回顶部功能
    scrollToTop: function() {
      wx.pageScrollTo({
        scrollTop: 0,
        duration: 300
      });
    },

  // 头像点击事件
  onAvatarTap: function(e) {
    const userId = e.currentTarget.dataset.userid;
    const username = e.currentTarget.dataset.username;
    const avatar = e.currentTarget.dataset.avatar;

    // 跳转到用户信息页面
    wx.navigateTo({
      url: `/pages/user-info/user-info?userId=${userId}&username=${username}&avatar=${avatar}`,
      success: () => {
        console.log('跳转到用户信息页面成功');
      },
      fail: (err) => {
        console.log('跳转到用户信息页面失败:', err);
        wx.showToast({
          title: '跳转失败',
          icon: 'none'
        });
      }
    });
  },
  // 设置tabBar选中状态
  onShow: function () {
    const userId = getApp().getValidUserId();
    if (userId !== this.data.userId) {
      this.setData({ userId });
      this.loadPosts();
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0
      });
    }
  }
});
