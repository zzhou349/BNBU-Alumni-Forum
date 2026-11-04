const apiConfig = require('../../config/api.js');

Page({
    data: {
      post: {
        id: '',
        title: '',
        author: '', // user
        authorId: '', // userId
        avatar: '',
        time: '',
        content: '',
        images: [],
        zone: '',
        likeCount: 0,
        collectCount: 0,
        commentCount: 0,
        isLiked: false,
        isCollected: false
      },
      comments: [],
      commentContent: '',
      replyingTo: null, // 正在回复的评论ID
      inputFocus: false,
      showCommentInput: false,
      userId: null,
      showUserPopup: false, // 是否显示用户弹窗
      popupUser: {}, // 弹窗用户信息
      popupPosition: { top: 0, left: 0 } // 弹窗位置
    },

    editPost() {
      if (Number(this.data.post.authorId) !== Number(this.data.userId)) return;
      wx.navigateTo({
        url: `/pages/post-edit/post-edit?id=${this.data.post.id}`
      });
    },

    onShow() {
      if (this.hasShown && this.data.post.id) {
        this.loadPostDetail(String(this.data.post.id));
      }
      this.hasShown = true;
    },

    // 修改 onLoad 方法
    onLoad(options) {
        // 确保options.id存在且有效
        const postId = options.id || options.postId; // 兼容不同参数名
        if (!postId) {
          wx.showToast({
            title: '帖子不存在或参数错误',
            icon: 'error'
          });
          setTimeout(() => wx.navigateBack(), 1500);
          return;
        }

        const app = getApp();
        const userId = app.globalData.userInfo ? app.globalData.userInfo.user_id : null;

        this.setData({
          userId,
          'post.id': postId  // 确保data中有初始值
        });

        console.log('Loading post detail for ID:', postId); // 调试日志

        this.loadPostDetail(postId);
        this.loadComments(postId);
      },

    // 加载帖子详情
    loadPostDetail(postId) {
      wx.showLoading({ title: '加载中...' });

      // 新增的部分
      if (!postId || typeof postId !== 'string') {
        console.error('Invalid postId:', postId);
        wx.showToast({ title: '帖子ID无效', icon: 'none' });
        return;
      }

      const params = {};
      if (this.data.userId) {
        params.userId = this.data.userId;
      }

      wx.request({
        url: apiConfig.getFullURL(`/post/${postId}`),
        method: 'GET',
        data: params,
        success: (res) => {
          wx.hideLoading();
          if (res.data.code === 200) {
            const postData = res.data.data;

            this.setData({
              post: {
                id: postData.id,
                title: postData.title,
                author: postData.author,
                authorId: postData.author_id,
                avatar: postData.avatar,
                time: this.formatTime(postData.time),
                content: postData.content,
                images: postData.images,
                zone: postData.zone,
                likeCount: postData.like_count,
                collectCount: postData.collect_count,
                commentCount: postData.comment_count,
                isLiked: postData.isLiked,
                isCollected: postData.isCollected,
              }
            }, () => {
              if (this.data.userId) this.recordHistory(postData.id);
            });
          } else {
            wx.showToast({ title: '加载失败', icon: 'none' });
            setTimeout(() => wx.navigateBack(), 1500);
          }
        },
        fail: () => {
          wx.hideLoading();
          wx.showToast({ title: '网络错误', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 1500);
        }
      });
    },

    // 预览图片
  previewImage: function(e) {
    const currentUrl = e.currentTarget.dataset.url;
    const index = e.currentTarget.dataset.index;
    const images = this.data.post.images;

    wx.previewImage({
      current: currentUrl, // 当前显示图片的http链接
      urls: images        // 需要预览的图片http链接列表
    });
  },

  // 加载评论与回复
  loadComments(postId) {

    if (!postId || isNaN(postId)) {
        console.error('Invalid postId for comments:', postId);
        return;
    }

    const that = this;
    const app = getApp();
    const userId = app.globalData.userInfo ? app.globalData.userInfo.user_id : null;

    wx.request({
      url: apiConfig.getFullURL(`/posts/${postId}/comments`),
      method: 'GET',
      data: { userId },
      success: function(res) {
        if (res.data.code === 200) {
          // 递归格式化评论树
          const formatComment = (comment) => {
            return {
              ...comment,
              time: that.formatTime(comment.created_at),
              // 递归处理子评论
              replies: comment.replies && comment.replies.length > 0
                ? comment.replies.map(formatComment)
                : []
            };
          };

          // 格式化整个评论树
          const commentTree = res.data.data.map(formatComment);

          that.setData({
            comments: commentTree
          });
        } else {
          console.error('加载评论失败:', res.data.message);
        }
      },
      fail: function(err) {
        console.error('网络请求失败:', err);
      }
    });
  },

    // 时间格式化方法
    formatTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const now = new Date();
      const diff = Math.floor((now - date) / 1000); // 秒差

      if (diff < 60) return '刚刚';
      if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;

      // 超过一天显示具体日期
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');

      return `${year}-${month}-${day} ${hours}:${minutes}`;
    },

    // 点赞处理
    handleLike: function(e) {
      const postId = this.data.post.id;
      const post = this.data.post;

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

      // 立即更新UI
      this.setData({
        'post.isLiked': isLiked,
        'post.likeCount': isLiked ? post.likeCount + 1 : Math.max(0, post.likeCount - 1)
      });

      // 发送请求到后端
      wx.request({
        url: apiConfig.getFullURL(`/posts/${postId}/interact`),
        method: 'POST',
        data: { userId: this.data.userId, actionType },
        success: (res) => {
          if (res.data.code === 200) {
            // 操作成功时才触发事件
            const app = getApp();
            app.globalData.eventBus.emit('postInteraction', {
              postId,
              likeCount: this.data.post.likeCount,
              isLiked: this.data.post.isLiked,
              collectCount: this.data.post.collectCount,
              isCollected: this.data.post.isCollected
            });
          } else {
            // 操作失败，回滚状态
            this.setData({
              'post.isLiked': !isLiked,
              'post.likeCount': isLiked ? post.likeCount : post.likeCount + 1
            });
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        },
        fail: () => {
          // 网络错误，回滚状态
          this.setData({
            'post.isLiked': !isLiked,
            'post.likeCount': isLiked ? post.likeCount : post.likeCount + 1
          });
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      });
    },

    // 收藏处理
    handleCollect: function(e) {
      const postId = this.data.post.id;
      const post = this.data.post;

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

      // 立即更新UI
      this.setData({
        'post.isCollected': isCollected,
        'post.collectCount': isCollected ? post.collectCount + 1 : Math.max(0, post.collectCount - 1)
      });

      // 发送请求到后端
      wx.request({
        url: apiConfig.getFullURL(`/posts/${postId}/interact`),
        method: 'POST',
        data: { userId: this.data.userId, actionType },
        success: (res) => {
          if (res.data.code === 200) {
            // 操作成功时才触发事件
            const app = getApp();
            app.globalData.eventBus.emit('postInteraction', {
              postId,
              likeCount: this.data.post.likeCount,
              isLiked: this.data.post.isLiked,
              collectCount: this.data.post.collectCount,
              isCollected: this.data.post.isCollected
            });
          } else {
            this.setData({
              'post.isCollected': !isCollected,
              'post.collectCount': isCollected ? post.collectCount : post.collectCount + 1
            });
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        },
        fail: () => {
          // 网络错误，回滚状态
          this.setData({
            'post.isCollected': !isCollected,
            'post.collectCount': isCollected ? post.collectCount : post.collectCount + 1
          });
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      });
    },

  // 处理评论输入
  onCommentInput(e) {
    this.setData({ commentContent: e.detail.value });
  },

  // 打开评论输入框
  openCommentInput(e) {
    const parentId = e.currentTarget.dataset.id || null;
    this.setData({
      showCommentInput: true,
      parentId,
      inputFocus: true
    });
  },

  //提交评论
  submitComment() {
    const { commentContent, parentId, post } = this.data;
    const app = getApp();
    const userId = app.globalData.userInfo?.user_id;

    if (!commentContent.trim()) {
      wx.showToast({ title: '评论内容不能为空', icon: 'none' });
      return;
    }

    if (!userId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...' });

    wx.request({
      url: apiConfig.getFullURL(`/posts/${post.id}/comments`),
      method: 'POST',
      data: {
        userId,
        content: commentContent,
        parentId
      },
      success: (res) => {
        if (res.data.code === 200) {

          const response = res.data.data;

          if (response.shouldUpdate) {
            this.loadComments(post.id);
          } else {
            const newComment = {
              ...response.comment,
              time: this.formatTime(response.comment.created_at),
              replies: []
            };

            if (newComment.parent_id) {
              this.updateReplyComment(newComment);
            } else {
              this.setData({
                comments: [newComment, ...this.data.comments]
              });
            }
          }

          // 更新评论数
          const newCommentCount = this.data.post.commentCount + 1;
          this.setData({
            commentContent: '',
            'post.commentCount': newCommentCount
          });

          // 发出事件通知其他页面
          app.globalData.eventBus.emit('postInteraction', {
            postId: post.id,
            commentCount: newCommentCount,
            likeCount: this.data.post.likeCount,
            isLiked: this.data.post.isLiked,
            collectCount: this.data.post.collectCount,
            isCollected: this.data.post.isCollected
          });
        } else {
          wx.showToast({ title: `评论失败: ${res.data.message}`, icon: 'none' });
        }
      },
      fail: (err) => {
        wx.showToast({ title: '网络错误', icon: 'none' });
        console.error('评论请求失败:', err);
      },
      complete: () => wx.hideLoading()
    });
  },

  updateReplyComment(newReply) {
    const { comments } = this.data;
    const updatedComments = [...comments];

    const findAndUpdate = (commentList, targetParentId) => {
      for (let i = 0; i < commentList.length; i++) {
        if (commentList[i].id === targetParentId) {
          commentList[i].replies = [...(commentList[i].replies || []), newReply];
          return true;
        }
        if (commentList[i].replies?.length) {
          if (findAndUpdate(commentList[i].replies, targetParentId)) return true;
        }
      }
      return false;
    };

    if (findAndUpdate(updatedComments, newReply.parent_id)) {
      this.setData({ comments: updatedComments });
    } else {
      this.loadComments(this.data.post.id);
    }
  },

    // 评论点赞处理
  handleCommentLike(e) {
    const index = e.currentTarget.dataset.index;
    const replyIndex = e.currentTarget.dataset.replyindex;
    const app = getApp();
    const userId = app.globalData.userInfo ? app.globalData.userInfo.user_id : null;

    if (!userId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    let comments = this.data.comments;
    let comment;

    if (replyIndex !== undefined) {
      comment = comments[index].replies[replyIndex];
    } else {
      comment = comments[index];
    }

    const isLiked = !comment.isLiked;

    const updatePath = replyIndex !== undefined ?
      `comments[${index}].replies[${replyIndex}]` :
      `comments[${index}]`;

    this.setData({
      [updatePath]: {
        ...comment,
        isLiked,
        likeCount: isLiked ? comment.likeCount + 1 : Math.max(0, comment.likeCount - 1)
      }
    });

    wx.request({
      url: apiConfig.getFullURL(`/comments/${comment.id}/like`),
      method: 'POST',
      data: {
        userId: userId,
        like: isLiked
      },
      success: (res) => {
        if (res.data.code !== 200) {
          this.setData({
            [updatePath]: comment
          });
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({
          [updatePath]: comment
        });
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // 回复评论
  handleReply(e) {
    const commentId = e.currentTarget.dataset.id;
    this.setData({
      replyingTo: commentId,
      parentId: commentId,
      showCommentInput: true,
      inputFocus: true
    });
  },

    onAvatarTap(e) {
      this.showUserCard(e);
    },

    onCommentAvatarTap(e) {
      this.showUserCard(e);
    },

    showUserCard(e) {
      const userId = Number(e.currentTarget.dataset.userid);
      if (!userId) return;
      const fallback = {
        userId,
        username: e.currentTarget.dataset.username || '未知用户',
        avatar: e.currentTarget.dataset.avatar || '/assets/avatar.png',
        signature: ''
      };
      this.setData({
        showUserPopup: true,
        popupUser: fallback,
        popupPosition: { top: 120, left: 30 }
      });
      wx.request({
        url: apiConfig.getFullURL(`/user/${userId}`),
        method: 'GET',
        data: { currentUserId: this.data.userId || 0 },
        success: (res) => {
          if (res.data.code !== 200) return;
          const data = res.data.data || {};
          const user = data.user || data;
          this.setData({
            popupUser: {
              userId: user.userId || user.user_id || user.id || userId,
              username: user.username || user.user_nickname || fallback.username,
              avatar: user.avatar || fallback.avatar,
              signature: user.bio || ''
            }
          });
        }
      });
    },

    hideUserPopup() {
      this.setData({ showUserPopup: false });
    },

    sendPrivateMessage() {
      const user = this.data.popupUser;
      if (!this.data.userId) {
        wx.showToast({ title: '请先登录', icon: 'none' });
        return;
      }
      if (Number(user.userId) === Number(this.data.userId)) {
        wx.showToast({ title: '不能给自己发私聊', icon: 'none' });
        return;
      }
      this.hideUserPopup();
      wx.navigateTo({
        url: `/pages/chat/chat?partnerId=${user.userId}&partnerName=${encodeURIComponent(user.username || '')}&partnerAvatar=${encodeURIComponent(user.avatar || '')}`
      });
    },

    // 空函数，用于阻止事件冒泡
    noop: function() {},

    // 记录浏览足迹
    recordHistory: function(postId) {
      const { userId } = this.data;
      // 双重验证确保参数有效
      if (!userId || !postId || isNaN(postId)) {
        console.log('用户未登录或帖子ID无效，不记录足迹');
        return;
      }

      // 本地存储逻辑
      const postInfo = {
        history_id: Date.now(),
        post_id: Number(postId),
        id: this.data.post.id,
        author_id: this.data.post.authorId,
        author: this.data.post.author,
        avatar: this.data.post.avatar,
        title: this.data.post.title,
        content: this.data.post.content,
        images: this.data.post.images,
        zone: this.data.post.zone,
        likeCount: this.data.post.likeCount,
        collectCount: this.data.post.collectCount,
        commentCount: this.data.post.commentCount,
        isLiked: this.data.post.isLiked,
        isCollected: this.data.post.isCollected,
        browsed_at: new Date().toISOString()
      };

      try {
        const existingHistory = wx.getStorageSync('user_history') || [];
        const existingIndex = existingHistory.findIndex(item => item.post_id === postInfo.post_id);

        if (existingIndex !== -1) {
          existingHistory[existingIndex] = postInfo;
        } else {
          existingHistory.unshift(postInfo);
        }

        if (existingHistory.length > 50) existingHistory.splice(50);
        wx.setStorageSync('user_history', existingHistory);
        console.log('足迹已保存到本地');
      } catch (error) {
        console.error('本地存储足迹失败:', error);
      }

      wx.request({
        url: apiConfig.getFullURL('/track-browsing'),
        method: 'POST',
        data: {
          userId: userId,
          postId: postId
        },
        success: (res) => {
          if (res.data.code === 200) {
            console.log('足迹已同步到数据库');
          } else {
            console.error('数据库同步失败:', res.data.message);
          }
        },
        fail: (err) => {
          console.error('网络错误，数据库同步失败:', err);
        }
      });
    },

  handleDeleteComment(e) {
    const commentId = e.currentTarget.dataset.id;
    const app = getApp();
    const userId = app.globalData.userInfo?.user_id;
    const currentPostId = this.data.post.id; // 获取当前帖子的ID

    if (!userId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '删除评论',
      content: '确定要删除这条评论吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });

          wx.request({
            url: apiConfig.getFullURL(`/comments/${commentId}`),
            method: 'DELETE',
            data: { userId },
            success: (res) => {
              wx.hideLoading();
              if (res.data.code === 200) {
                wx.showToast({ title: '删除成功' });

                // 更新本地数据
                const deletedCount = Number(res.data.data?.deletedCount) || 1;
                const newCommentCount = Math.max(0, this.data.post.commentCount - deletedCount);

                // 从评论树中移除目标评论；删除回复时保留其父评论。
                const removeComment = comments => comments
                  .filter(comment => comment.id !== commentId)
                  .map(comment => ({
                    ...comment,
                    replies: comment.replies ? removeComment(comment.replies) : []
                  }));
                const updatedComments = removeComment(this.data.comments);

                this.setData({
                  'post.commentCount': newCommentCount,
                  comments: updatedComments
                });

                // 通知其他页面
                app.globalData.eventBus.emit('postInteraction', {
                  postId: currentPostId,  // 使用当前帖子ID
                  commentCount: newCommentCount,
                  // 保持其他状态不变
                  likeCount: this.data.post.likeCount,
                  isLiked: this.data.post.isLiked,
                  collectCount: this.data.post.collectCount,
                  isCollected: this.data.post.isCollected
                });

              } else {
                wx.showToast({ title: res.data.message || '删除失败', icon: 'none' });
              }
            },
            fail: (err) => {
              wx.hideLoading();
              wx.showToast({ title: '网络错误', icon: 'none' });
              console.error('删除评论失败:', err);
            }
          });
        }
      }
    });
  }
});
