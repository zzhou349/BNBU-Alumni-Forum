const apiConfig = require('../../config/api.js');

Page({
      data: {
    user: {
      id: '',
      avatar: "/assets/avatar.png",
      nickname: "",
      bio: ""
    },
    bioLength: 0,
    isUploading: false
  },

    onLoad(options) {
      const app = getApp();

      // 检查登录状态
      if (!app.globalData.isLoggedIn || !app.globalData.userInfo) {
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        });
        wx.navigateBack();
        return;
      }

          // 直接从全局数据初始化用户信息
    const userInfo = app.globalData.userInfo;
    const bio = userInfo.bio || "";
    this.setData({
      'user.id': userInfo.user_id || userInfo.id,
      'user.avatar': userInfo.avatar || "/assets/avatar.png",
      'user.nickname': userInfo.user_nickname || "",
      'user.bio': bio,
      bioLength: bio.length
    });

      // 仍然从服务器获取最新信息以确保数据最新
      this.fetchUserProfile(userInfo.user_id || userInfo.id);
    },

    // 从服务器获取用户信息
    fetchUserProfile(userId) {
      wx.showLoading({ title: '加载中...' });

      wx.request({
        url: apiConfig.getFullURL(`/user/${userId}`),
        method: 'GET',
        success: (res) => {
          wx.hideLoading();
          console.log('用户信息响应:', res);

          if (res.data && res.data.code === 200 && res.data.data) {
            const userData = res.data.data.user; // 注意后端返回的数据结构
            const bio = userData.bio || '';

            this.setData({
              'user.avatar': userData.avatar || this.data.user.avatar,
              'user.nickname': userData.username || userData.user_nickname || '',
              'user.bio': bio,
              bioLength: bio.length
            });
          } else {
            wx.showToast({
              title: res.data?.message || '获取用户信息失败',
              icon: 'none'
            });
          }
        },
        fail: (err) => {
          wx.hideLoading();
          wx.showToast({
            title: '网络请求失败',
            icon: 'none'
          });
          console.error('获取用户信息失败:', err);
        }
      });
    },

    // 更换头像
    changeAvatar() {
      if (this.data.isUploading) return;

      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          this.uploadAvatar(res.tempFilePaths[0]);
        }
      });
    },

    // 上传头像
    uploadAvatar(filePath) {
      this.setData({ isUploading: true });
      wx.showLoading({ title: '上传中...', mask: true });

      wx.uploadFile({
        url: apiConfig.getFullURL('/upload'),
        filePath: filePath,
        name: 'file',
        formData: { type: 'avatar' },
        success: (res) => {
          try {
            const data = JSON.parse(res.data);
            if (data.code === 200 && data.imageUrl) {
              this.setData({
                'user.avatar': data.imageUrl
              });
              wx.showToast({
                title: '头像更新成功',
                icon: 'success'
              });
            } else {
              throw new Error(data.message || '上传失败');
            }
          } catch (e) {
            wx.showToast({
              title: e.message || '上传失败',
              icon: 'none'
            });
            console.error('头像上传失败:', e);
          }
        },
        fail: (err) => {
          wx.showToast({
            title: '网络错误: ' + err.errMsg,
            icon: 'none'
          });
        },
        complete: () => {
          wx.hideLoading();
          this.setData({ isUploading: false });
        }
      });
    },

    // 表单输入处理
    onNameChange(e) {
      this.setData({
        'user.nickname': e.detail.value.trim()
      });
    },

      onBioChange(e) {
    const bio = e.detail.value.trim();
    this.setData({
      'user.bio': bio,
      bioLength: bio.length
    });
  },

    // 保存资料
    saveProfile() {
      const { user } = this.data;
      const app = getApp();

      // 验证
      if (!user.id) {
        wx.showToast({ title: '无效的用户ID', icon: 'none' });
        return;
      }

      if (!user.nickname) {
        wx.showToast({ title: '昵称不能为空', icon: 'none' });
        return;
      }

      wx.showLoading({ title: '保存中...', mask: true });

      wx.request({
        url: apiConfig.getFullURL('/update-profile'),
        method: 'POST',
        data: {
          id: user.id,
          nickname: user.nickname,
          avatar: user.avatar,
          bio: user.bio
        },
        success: (res) => {
          if (res.data && res.data.code === 200) {
            // 1. 更新全局用户信息
            const updatedUserInfo = {
              ...app.globalData.userInfo,
              user_nickname: user.nickname,
              avatar: user.avatar,
              bio: user.bio
            };

            // 2. 使用App的setLoginStatus方法确保状态同步
            app.setLoginStatus(true, updatedUserInfo);

            // 3. 通过事件总线通知所有页面
            app.globalData.eventBus.emit('userProfileUpdated', updatedUserInfo);

            wx.showToast({
              title: '保存成功',
              icon: 'success',
              complete: () => {
                setTimeout(() => wx.navigateBack(), 1500);
              }
            });
          }
        },
        fail: (err) => {
          wx.hideLoading();
          wx.showToast({
            title: '网络错误: ' + err.errMsg,
            icon: 'none'
          });
        }
      });
    }
  });