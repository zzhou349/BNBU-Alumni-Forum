const apiConfig = require('../../config/api.js');

Page({
    data: {
        isLoggedIn: false,
        user: {
            avatar: "/assets/avatar.png",
            user_nickname: "",
            id: 0,
            bio: "",
        },
    },

    onLoad() {
        const app = getApp();

        // 添加登录状态变化监听
        this.loginStateChangeListener = (data) => {
            this.handleLoginStateChange(data.isLoggedIn, data.userInfo);
        };
        app.globalData.eventBus.on('loginStateChange', this.loginStateChangeListener);

        // 添加用户资料更新监听
        this.userProfileUpdatedListener = (userInfo) => {
        this.handleUserInfoUpdate(userInfo);
      };
      app.globalData.eventBus.on('userProfileUpdated', this.userProfileUpdatedListener);

        // 初始化页面数据
        this.initProfileData();

        // 初始化页面状态
        if (app.globalData.isLoggedIn && app.globalData.userInfo) {
            this.handleLoginStateChange(true, app.globalData.userInfo);
        }
    },

    onUnload() {
        const app = getApp();
        // 移除监听
        getApp().globalData.eventBus.off('userProfileUpdated', this.userProfileUpdatedListener);
        app.globalData.eventBus.off('loginStateChange', this.loginStateChangeListener);
    },

    // 初始化数据
    initProfileData() {
        const app = getApp();
        if (app.globalData.isLoggedIn && app.globalData.userInfo) {
        this.handleUserInfoUpdate(app.globalData.userInfo);
        }
    },

    // 处理用户信息更新
    handleUserInfoUpdate(userInfo) {
        this.setData({
        isLoggedIn: true,
        user: {
            avatar: userInfo.avatar || "/assets/avatar.png",
            user_nickname: userInfo.user_nickname || "未命名用户",
            id: userInfo.user_id || userInfo.id || 0,
            bio: userInfo.bio || ""
        }
        });

        // 如果需要完整信息，可以再调用API
        const userId = userInfo.user_id || userInfo.id;
        if (userId) {
        this.fetchUserInfo(userId);
        }
    },

    handleLoginStateChange(isLoggedIn, userInfo) {
        console.log('登录状态变化:', isLoggedIn, userInfo);
        this.setData({ isLoggedIn });

        if (isLoggedIn && userInfo) {
            this.setData({
                user: {
                    avatar: userInfo.avatar || this.data.user.avatar,
                    user_nickname: userInfo.user_nickname || this.data.user.user_nickname,
                    id: userInfo.user_id || userInfo.id || this.data.user.id,
                    bio: userInfo.bio || this.data.user.bio
                }
            });

            const userId = userInfo.user_id || userInfo.id;
            if (userId) {
                this.fetchUserInfo(userId);
            }
        } else {
            this.setData({
                user: {
                    avatar: "/assets/avatar.png",
                    user_nickname: "",
                    id: 0,
                    bio: ""
                }
            });
        }
    },

    onShow() {
        // 新增：设置tabBar选中状态（"我的"页面索引为4）
        if (typeof this.getTabBar === 'function' && this.getTabBar()) {
            this.getTabBar().setData({
                selected: 4
            });
        }

        // 保留原有的onShow逻辑
        const app = getApp();
        if (app.globalData.isLoggedIn && app.globalData.userInfo) {
            const userId = app.getValidUserId();
            if (userId) {
                this.fetchUserInfo(userId);
            }
        }
    },

    // 获取用户信息
    fetchUserInfo(userId) {
      // 确保userId是数字
      if (typeof userId !== 'number' || userId <= 0) {
        console.error('用户ID不是int，或是非正数:', userId);
        return;
      }

      wx.request({
        url: apiConfig.getFullURL(`/user/${userId}`),
        method: 'GET',
        success: (res) => {
          console.log('API响应:', res);
          console.log('响应数据:', res.data);

          if (res.data.code === 200) {
            console.log('获取到用户数据:', res.data.data);

            // 确保数据结构正确
            const userData = res.data.data || {};

            this.setData({
              'user.avatar': userData.avatar || this.data.user.avatar,
              'user.user_nickname': userData.user_nickname || this.data.user.user_nickname,
              'user.bio': userData.bio || this.data.user.bio,
              'user.id': userData.id || userId
            });
          } else {
            wx.showToast({
              title: res.data.message || '获取用户信息失败',
              icon: 'none',
            });
          }
        },
        fail: (err) => {
          console.error('请求失败:', err);
          wx.showToast({
            title: '网络请求失败',
            icon: 'none',
          });
        },
        complete: () => {
          console.log('当前用户数据:', this.data.user);
        }
      });
    },

    // 跳转到登录页面
    navigateToLogin() {
      wx.navigateTo({
        url: '/pages/login/login',
      });
    },

    // 退出登录
    logout() {
        getApp().logout();
        wx.showToast({
          title: '已退出登录',
          icon: 'success'
        });
    },
});
