const apiConfig = require('../../config/api.js');

// zones.js
Page({
    data: {
      activeTab: 'hot',
      zoneData: {
        id: '',
        title: '',
        postCount: 0,
        description: '无'
      },
      posts: [],
      currentPage: 1,
      isLoading: false,
      isEnd: false,
      currentZoneId: '',
      totalPosts: 0,
      userId: null
    },

    // 改进：更智能的更新方法
    updatePostStatus: function(data) {
      const { postId } = data;

      this.setData({
        posts: this.data.posts.map(post => {
          if (post.id === postId) {
            // 只更新提供的字段
            return {
              ...post,
              ...(data.likeCount !== undefined && {likeCount: data.likeCount}),
              ...(data.isLiked !== undefined && {isLiked: data.isLiked}),
              ...(data.collectCount !== undefined && {collectCount: data.collectCount}),
              ...(data.isCollected !== undefined && {isCollected: data.isCollected}),
              ...(data.commentCount !== undefined && {commentCount: data.commentCount})
            };
          }
          return post;
        })
      });
    },

    onLoad(options) {
      const { id, name } = options;

      // 获取用户ID
      const app = getApp();
      const userId = app.globalData.userInfo ? app.globalData.userInfo.user_id : null;

      this.setData({
        currentZoneId: id,
        userId
      });

      this.loadZoneData(id);
      this.loadPosts(id, 'hot', 1);

      // 保存绑定函数的引用
      this.boundUpdatePostStatus = this.updatePostStatus.bind(this);
      app.globalData.eventBus.on('postInteraction', this.boundUpdatePostStatus);
    },

    onUnload() {
      const app = getApp();
      // 移除监听
      app.globalData.eventBus.off('postInteraction', this.boundUpdatePostStatus);
    },

    // 加载专区数据
    loadZoneData(zoneId) {

        // 设置不同专区的数据
        const zoneDataMap = {
          '1': {
              id: '1',
              title: '活动攒局',
              postCount: 356842,
              description: 'manbo~'
          },
          '2': {
            id: '2',
            title: '岗位内推',
            postCount: 423589,
            description: '内推与岗位推荐专区，提供最新的招聘信息、内推机会和求职经验分享。帮助求职者找到心仪的工作，助力职场发展。'
          },
          '3': {
            id: '3',
            title: '职场咨询',
            postCount: 315672,
            description: '职场咨询与行业洞察专区，分享职场经验、行业动态和职业规划建议。帮助职场人士解决困惑，提升职业竞争力。'
          },
          '4': {
              id: '4',
              title: '创业合作',
              postCount: 142567,
              description: '创业者交流、项目合作、资源对接的专属平台。分享创业经验、寻找合作伙伴、获取投资机会，共同探索创业之路。'
          },
          '5': {
            id: '5',
            title: '留学准备',
            postCount: 728726,
            description: '在留学准备专区，大家可以分享和提问留学申请相关问题，互相帮助，解决困惑。无论是时间线规划、文书写作，还是推荐信建议，都可以在这里获取经验和建议，帮助你更清晰地了解申请步骤。'
          },
          '6': {
              id: '6',
              title: '申请经验',
              postCount: 285394,
              description: '分享各类申请经验，包括学校申请、奖学金申请、实习申请等。了解成功案例，避开常见陷阱，提高申请成功率。'
            },
            '7': {
              id: '7',
              title: '签证申请',
              postCount: 176532,
              description: '签证申请经验交流平台，分享各国签证政策、材料准备、面签技巧等实用信息。帮助大家顺利通过签证申请流程。'
            },
          '8': {
            id: '8',
            title: '租房交流',
            postCount: 189345,
            description: '房源互通、租房经验交流专区，分享租房信息、避坑指南和居住体验。帮助大家找到合适的住所，解决租房难题。'
          },
          '9': {
              id: '9',
              title: '物品转售',
              postCount: 324178,
              description: '二手物品交易平台，提供书籍、家具、电子产品等物品转售信息。诚信交易，物尽其用，让闲置物品找到新主人。'
          }
        };

        const zoneData = zoneDataMap[zoneId] || {
          title: '专区错误',
          description: '发生错误',
        };

        this.setData({
          zoneData: {
            ...this.data.zoneData,
            ...zoneData,
            id: zoneId
          }
        });
      },

  // 加载帖子
  loadPosts(zoneId, sortType, page = 1) {
    if (this.data.isLoading || this.data.isEnd) return;

    this.setData({ isLoading: true });

    wx.request({
      url: apiConfig.getFullURL(`/zone-posts/${zoneId}`),
      method: 'GET',
      data: {
        page: page,
        pageSize: 10,
        userId: this.data.userId
      },
      success: (res) => {
        if (res.data.code === 200) {
          const newPosts = res.data.data.map(post => ({
            ...post,
            // 确保所有必需字段都存在
            id: post.post_id || post.id,
            username: post.username || post.author,
            avatar: post.avatar || '/assets/avatar.png',
            time: this.formatTime(post.time || post.created_at),
            title: post.title,
            content: post.content || post.post_content,
            images: post.images || [],
            zone: post.zone ? [post.zone] : (post.zone_name ? [post.zone_name] : ['未知专区']),
            likeCount: post.likeCount || post.like_count || 0,
            collectCount: post.collectCount || post.collect_count || 0,
            commentCount: post.commentCount || post.comment_count || 0,
            isLiked: post.isLiked || post.is_liked || false,
            isCollected: post.isCollected || post.is_collected || false
          }));

          const total = res.data.total || 0;
          const isEnd = newPosts.length < 10 || (page * 10) >= total;

          this.setData({
            posts: page === 1 ? newPosts : [...this.data.posts, ...newPosts],
            currentPage: page,
            isEnd,
            totalPosts: total,
            ['zoneData.postCount']: total
          });
        }
      },
      complete: () => {
        this.setData({ isLoading: false });
      }
    });
  },

    // 时间格式化
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}`;
    },

    // 切换排序
    switchTab(e) {
        const tab = e.currentTarget.dataset.tab;
        this.setData({ activeTab: tab });
        this.loadPosts(this.data.currentZoneId, tab, 1);
    },

    // 预览图片
    previewImage(e) {
        const currentUrl = e.currentTarget.dataset.url;
        const index = e.currentTarget.dataset.index;
        const postId = e.currentTarget.dataset.id;

        const post = this.data.posts.find(p => p.id === postId);
        if (!post || !post.images) return;

        wx.previewImage({
        current: currentUrl,
        urls: post.images
        });

        e.stopPropagation();
    },

    // 跳转到帖子详情
    navigateToPostDetail(e) {
        const postId = e.currentTarget.dataset.id;
        wx.navigateTo({
        url: `/pages/post-detail/post-detail?id=${postId}`
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
    console.log("举报帖子:", postId);

    wx.showModal({
      title: '举报帖子',
      content: '确定要举报此帖子吗？',
      success: (res) => {
        if (res.confirm) {
          wx.request({
            url: apiConfig.getFullURL(`/posts/${postId}/report`),
            method: 'POST',
            data: {
              userId: this.data.userId
            },
            success: (res) => {
              if (res.data.code === 200) {
                wx.showToast({
                  title: '举报成功',
                  icon: 'success'
                });
              } else {
                wx.showToast({
                  title: '举报失败',
                  icon: 'none'
                });
              }
            }
          });
        }
        this.hideReportDialog();
      }
    });
  },

  onPageTap(e) {
    if (this.data.showReportDialog && !e.target.dataset.isMenu) {
      this.hideReportDialog();
    }
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
            if (res.data.code === 200) {
              // 通知全局
              const app = getApp();
              app.globalData.eventBus.emit('postInteraction', {
                postId,
                likeCount: newPosts[index].likeCount,
                isLiked
              });
            } else {
              // 回滚
              const rollbackPosts = [...this.data.posts];
              rollbackPosts[index] = post;
              this.setData({ posts: rollbackPosts });
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          },
          fail: () => {
            const rollbackPosts = [...this.data.posts];
            rollbackPosts[index] = post;
            this.setData({ posts: rollbackPosts });
            wx.showToast({ title: '网络错误', icon: 'none' });
          }
        });
      },

      // 收藏处理
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
            if (res.data.code === 200) {
              // 通知全局
              const app = getApp();
              app.globalData.eventBus.emit('postInteraction', {
                postId,
                collectCount: newPosts[index].collectCount,
                isCollected
              });
            } else {
              // 回滚
              const rollbackPosts = [...this.data.posts];
              rollbackPosts[index] = post;
              this.setData({ posts: rollbackPosts });
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          },
          fail: () => {
            const rollbackPosts = [...this.data.posts];
            rollbackPosts[index] = post;
            this.setData({ posts: rollbackPosts });
            wx.showToast({ title: '网络错误', icon: 'none' });
          }
        });
      },
});
