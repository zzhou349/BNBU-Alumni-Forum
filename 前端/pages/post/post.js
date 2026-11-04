const apiConfig = require('../../config/api.js');

Page({
    data: {
      title: "",
      content: "",
      files: [],
      selectedZoneId: null,
      selectedZoneName: '',
      isSubmitting: false
    },

    onLoad: function(options) {
      this.initForm();
    },

    onShow: function () {
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        this.getTabBar().setData({
          selected: 2
        });
      }
    },

    onUnload: function() {
      this.clearFormData();
    },

    // 初始化表单数据
    initForm: function() {
      this.setData({
        title: "",
        content: "",
        files: [],
        selectedZoneId: null,
        selectedZoneName: '',
        isSubmitting: false
      });
    },

    // 清空表单数据的专用方法 - 重点确保输入框内容被清除
    clearFormData: function() {
      // 强制清空所有数据，包括标题和正文
      this.setData({
        title: "",
        content: "",
        files: [],
        selectedZoneId: null,
        selectedZoneName: ''
      }, () => {
        // 回调函数中确认数据已清空
        console.log('标题已清空:', this.data.title);
        console.log('内容已清空:', this.data.content);
      });
    },

    onTitleInput: function(e) {
      this.setData({ title: e.detail.value });
    },

    onContentInput: function(e) {
      this.setData({ content: e.detail.value });
    },

    goToZoneSelectPage: function() {
      wx.navigateTo({
        url: '/pages/zone_select/zone_select'
      });
    },

    onZoneSelected: function(zoneId, zoneName) {
      this.setData({
        selectedZoneId: zoneId,
        selectedZoneName: zoneName
      });
    },

    chooseImage: function() {
      const that = this;
      wx.chooseImage({
        count: 9,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: function(res) {
            const validFiles = res.tempFilePaths.filter(filePath =>
                /\.(jpe?g|png)$/i.test(filePath)
              );
          that.setData({
            files: that.data.files.concat(validFiles).slice(0, 9)
          });
        }
      });
    },

    removeImage: function(e) {
      const index = e.currentTarget.dataset.index;
      const files = [...this.data.files];
      files.splice(index, 1);
      this.setData({ files });
    },

    // 发送帖子请求的核心方法
    sendPostRequest: function(postData, header) {
      const that = this;
      wx.request({
        url: apiConfig.getFullURL('/create-post'),
        method: 'POST',
        header: header,
        data: postData,
        success: function(res) {
          wx.hideLoading();
          that.setData({ isSubmitting: false });

          if (res.statusCode === 200 && res.data.code === 200) {
            // 发布成功后立即清空所有内容
            that.clearFormData();

            wx.showToast({
              title: "发布成功",
              icon: "success",
              duration: 1500
            });

            // 等待清空完成后再跳转
            setTimeout(() => {
              wx.switchTab({
                url: '/pages/home/home'
              });
            }, 1500);
          } else {
            const errMsg = res.data?.message || `请求失败: ${res.statusCode}`;
            wx.showToast({
              title: `发布失败: ${errMsg}`,
              icon: 'none',
              duration: 3000
            });
          }
        },
        fail: function(err) {
          wx.hideLoading();
          that.setData({ isSubmitting: false });
          wx.showToast({
            title: `网络错误: ${err.errMsg}`,
            icon: 'none',
            duration: 3000
          });
        }
      });
    },

    uploadImages: function(files, callback) {
      const app = getApp();
      let completed = 0;
      const total = files.length;
      const imageUrls = [];

      if (total === 0) {
        callback([]);
        return;
      }

      const updateProgress = () => {
        const progress = Math.round((completed / total) * 100);
        wx.showLoading({
          title: `图片上传中 ${progress}%`,
          mask: true
        });
      };

      updateProgress();

      files.forEach(filePath => {
        wx.uploadFile({
          url: apiConfig.getFullURL('/upload'),
          filePath: filePath,
          name: 'file',
          formData: {
            user_id: app.globalData.userId,
            type: 'post_image'
          },
          header: {
            'Authorization': `Bearer ${app.globalData.token}`
          },
          success: (res) => {
            try {
              const data = JSON.parse(res.data);
              if (data.code === 200 && data.filePath) {
                imageUrls.push(data.filePath);
              }
            } catch (e) {
              console.error('图片上传响应解析失败', e);
            }
          },
          complete: () => {
            completed++;
            updateProgress();

            if (completed === total) {
              wx.hideLoading();
              callback(imageUrls);
            }
          }
        });
      });
    },

    submitPost: function() {
      if (this.data.isSubmitting) return;
      this.setData({ isSubmitting: true });

      const { title, content, files, selectedZoneId } = this.data;
      const app = getApp();

      const userId = parseInt(app.globalData.userId);
      if (!userId) {
        wx.showToast({ title: "请先登录", icon: "none" });
        this.setData({ isSubmitting: false });
        return;
      }

      if (!title || !content) {
        wx.showToast({ title: "标题和内容不能为空", icon: "none" });
        this.setData({ isSubmitting: false });
        return;
      }

      const zoneId = parseInt(selectedZoneId);
      if (!zoneId) {
        wx.showToast({ title: "请选择专区", icon: "none" });
        this.setData({ isSubmitting: false });
        return;
      }

      const header = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${app.globalData.token}`
      };

      wx.showLoading({ title: '发布中...', mask: true });

      const submitWithImages = (imageUrls) => {
        const fullImageUrls = imageUrls.map(url => apiConfig.getFullURL(`/images/${url}`));

        const postData = {
          user_id: userId,
          title: title.trim(),
          content: content.trim(),
          zone_id: zoneId,
          picturePaths: fullImageUrls
        };

        this.sendPostRequest(postData, header);
      };

      const submitWithoutImages = () => {
        const postData = {
          user_id: userId,
          title: title.trim(),
          content: content.trim(),
          zone_id: zoneId,
          picturePaths: []
        };

        this.sendPostRequest(postData, header);
      };

      if (files.length > 0) {
        this.uploadImages(files, submitWithImages);
      } else {
        submitWithoutImages();
      }
    },

    cancelSubmit: function() {
      this.setData({ isSubmitting: false });
      wx.hideLoading();
      wx.showToast({ title: "已取消发布", icon: "none" });
    }
});
