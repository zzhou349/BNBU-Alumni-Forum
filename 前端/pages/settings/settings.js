const apiConfig = require('../../config/api.js');

Page({
    data: {
        isLoggedIn: false,
        isAdmin: false,
        isUploading: false,
        isSaving: false,
        user: {
            id: 0,
            nickname: '',
            avatar: '/assets/avatar.png',
            bio: ''
        }
    },

    onLoad() {
        const app = getApp();
        this.syncUser(app.globalData.userInfo);

        // 添加登录状态监听
        this.loginStateChangeListener = (data) => {
            this.syncUser(data.userInfo);
        };
        app.globalData.eventBus.on('loginStateChange', this.loginStateChangeListener);
    },

    onShow() {
        this.syncUser(getApp().globalData.userInfo);
    },

    syncUser(userInfo) {
        const isLoggedIn = !!(getApp().globalData.isLoggedIn && userInfo);
        this.setData({
            isLoggedIn,
            isAdmin: Boolean(isLoggedIn && (userInfo.isAdmin || userInfo.role === 'admin')),
            user: isLoggedIn ? {
                id: userInfo.user_id || userInfo.id || 0,
                nickname: userInfo.user_nickname || userInfo.nickname || '',
                avatar: userInfo.avatar || '/assets/avatar.png',
                bio: userInfo.bio || ''
            } : {
                id: 0,
                nickname: '',
                avatar: '/assets/avatar.png',
                bio: ''
            }
        });
    },

    onNameChange(e) {
        this.setData({ 'user.nickname': e.detail.value });
    },

    onBioChange(e) {
        this.setData({ 'user.bio': e.detail.value });
    },

    changeAvatar() {
        if (!this.data.isLoggedIn || this.data.isUploading) return;
        wx.chooseImage({
            count: 1,
            sizeType: ['compressed'],
            sourceType: ['album', 'camera'],
            success: ({ tempFilePaths }) => this.uploadAvatar(tempFilePaths[0])
        });
    },

    uploadAvatar(filePath) {
        this.setData({ isUploading: true });
        wx.showLoading({ title: '上传中...', mask: true });
        wx.uploadFile({
            url: apiConfig.uploadURL,
            filePath,
            name: 'file',
            formData: { type: 'avatar' },
            success: (res) => {
                try {
                    const payload = JSON.parse(res.data);
                    if (payload.code !== 200) throw new Error(payload.message || '上传失败');
                    const avatar = payload.data?.imageUrl || payload.imageUrl;
                    if (!avatar) throw new Error('服务器未返回头像地址');
                    this.setData({ 'user.avatar': avatar });
                } catch (error) {
                    wx.showToast({ title: error.message || '上传失败', icon: 'none' });
                }
            },
            fail: () => wx.showToast({ title: '头像上传失败', icon: 'none' }),
            complete: () => {
                wx.hideLoading();
                this.setData({ isUploading: false });
            }
        });
    },

    saveProfile() {
        const { user, isLoggedIn, isSaving } = this.data;
        if (!isLoggedIn) return wx.showToast({ title: '请先登录', icon: 'none' });
        if (isSaving) return;
        if (!user.nickname.trim()) return wx.showToast({ title: '昵称不能为空', icon: 'none' });

        this.setData({ isSaving: true });
        wx.showLoading({ title: '保存中...', mask: true });
        wx.request({
            url: apiConfig.getFullURL('/update-profile'),
            method: 'POST',
            data: {
                id: user.id,
                nickname: user.nickname.trim(),
                avatar: user.avatar,
                bio: user.bio.trim()
            },
            success: (res) => {
                if (res.data.code !== 200) {
                    wx.showToast({ title: res.data.message || '保存失败', icon: 'none' });
                    return;
                }
                const app = getApp();
                const updated = {
                    ...app.globalData.userInfo,
                    user_id: user.id,
                    id: user.id,
                    user_nickname: user.nickname.trim(),
                    avatar: user.avatar,
                    bio: user.bio.trim()
                };
                app.setLoginStatus(true, updated);
                app.globalData.eventBus.emit('userProfileUpdated', updated);
                wx.showToast({ title: '保存成功', icon: 'success' });
            },
            fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' }),
            complete: () => {
                wx.hideLoading();
                this.setData({ isSaving: false });
            }
        });
    },

    onUnload() {
        const app = getApp();
        app.globalData.eventBus.off('loginStateChange', this.loginStateChangeListener);
    },

    logout() {
        wx.showModal({
            title: '确认退出',
            content: '确定要退出登录吗？',
            success: (res) => {
                if (res.confirm) {
                    getApp().logout();
                    wx.showToast({
                        title: '已退出登录',
                        icon: 'success'
                    });
                }
            }
        });
    },

  // 跳转到编辑个人信息页面
  navigateToEditProfile() {
    const app = getApp();
    if (!app.globalData.isLoggedIn) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }
    wx.navigateTo({
      url: '/pages/edit-profile/edit-profile'
    });
  },

  // 跳转到登录页面
  navigateToLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    });
  },

  navigateToPassword() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/password/password?mode=change'
    });
  },

  navigateToAdmin() {
    if (!this.data.isAdmin) return;
    wx.navigateTo({ url: '/pages/admin/admin' });
  }
});
