const apiConfig = require('../../config/api.js');

Page({
  data: {
    postId: null,
    userId: null,
    title: '',
    content: '',
    images: [],
    selectedZoneId: null,
    selectedZoneName: '',
    isLoading: true,
    isSubmitting: false
  },

  onLoad(options) {
    const app = getApp();
    const userId = app.getValidUserId ? app.getValidUserId() : app.globalData.userInfo?.user_id;
    const postId = Number(options.id || options.postId);
    if (!userId || !postId) {
      wx.showToast({ title: !userId ? '请先登录' : '帖子参数无效', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    this.setData({ userId, postId });
    this.loadPost();
  },

  normalizeImage(path) {
    if (/^https?:\/\//i.test(path) || /^wxfile:\/\//i.test(path)) return path;
    return apiConfig.getFullURL(`/images/${String(path).replace(/^\/+/, '')}`);
  },

  loadPost() {
    wx.request({
      url: apiConfig.getFullURL(`/post/${this.data.postId}`),
      method: 'GET',
      data: { userId: this.data.userId },
      success: res => {
        if (res.data.code !== 200) {
          wx.showToast({ title: res.data.message || '帖子加载失败', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 1200);
          return;
        }
        const post = res.data.data;
        if (Number(post.author_id) !== Number(this.data.userId)) {
          wx.showToast({ title: '只能编辑自己的帖子', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 1200);
          return;
        }
        this.setData({
          title: post.title || '',
          content: post.content || '',
          selectedZoneId: post.zone_id,
          selectedZoneName: post.zone || '',
          images: (post.images || []).map(path => ({ path: this.normalizeImage(path), isLocal: false })),
          isLoading: false
        });
      },
      fail: () => {
        wx.showToast({ title: '网络请求失败', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1200);
      }
    });
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  goToZoneSelectPage() {
    wx.navigateTo({ url: '/pages/zone_select/zone_select' });
  },

  onZoneSelected(zoneId, zoneName) {
    this.setData({ selectedZoneId: Number(zoneId), selectedZoneName: zoneName });
  },

  chooseImage() {
    wx.chooseImage({
      count: Math.max(1, 9 - this.data.images.length),
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        const added = res.tempFilePaths
          .filter(path => /\.(jpe?g|png)$/i.test(path))
          .map(path => ({ path, isLocal: true }));
        this.setData({ images: [...this.data.images, ...added].slice(0, 9) });
      }
    });
  },

  removeImage(e) {
    const images = [...this.data.images];
    images.splice(Number(e.currentTarget.dataset.index), 1);
    this.setData({ images });
  },

  uploadLocalImages(callback) {
    const images = this.data.images;
    const result = new Array(images.length);
    let completed = 0;
    let failed = false;
    if (!images.length) return callback(null, []);

    const finishOne = () => {
      completed += 1;
      if (completed === images.length) callback(failed ? new Error('图片上传失败') : null, result);
    };

    images.forEach((image, index) => {
      if (!image.isLocal) {
        result[index] = image.path;
        finishOne();
        return;
      }
      wx.uploadFile({
        url: apiConfig.getFullURL('/upload'),
        filePath: image.path,
        name: 'file',
        formData: { user_id: this.data.userId, type: 'post_image' },
        success: response => {
          try {
            const payload = JSON.parse(response.data);
            if (payload.code !== 200 || !payload.filePath) throw new Error('上传失败');
            result[index] = apiConfig.getFullURL(`/images/${payload.filePath}`);
          } catch (_error) {
            failed = true;
          }
        },
        fail: () => { failed = true; },
        complete: finishOne
      });
    });
  },

  submitEdit() {
    if (this.data.isSubmitting) return;
    const title = this.data.title.trim();
    const content = this.data.content.trim();
    if (!title || !content) return wx.showToast({ title: '标题和内容不能为空', icon: 'none' });
    if (!this.data.selectedZoneId) return wx.showToast({ title: '请选择专区', icon: 'none' });

    this.setData({ isSubmitting: true });
    wx.showLoading({ title: '保存中...', mask: true });
    this.uploadLocalImages((uploadError, picturePaths) => {
      if (uploadError) {
        wx.hideLoading();
        this.setData({ isSubmitting: false });
        wx.showToast({ title: uploadError.message, icon: 'none' });
        return;
      }
      wx.request({
        url: apiConfig.getFullURL(`/posts/${this.data.postId}`),
        method: 'PUT',
        data: {
          userId: this.data.userId,
          zone_id: this.data.selectedZoneId,
          title,
          content,
          picturePaths
        },
        success: res => {
          if (res.data.code !== 200) {
            wx.showToast({ title: res.data.message || '保存失败', icon: 'none' });
            return;
          }
          wx.showToast({ title: '修改成功', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 1000);
        },
        fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' }),
        complete: () => {
          wx.hideLoading();
          this.setData({ isSubmitting: false });
        }
      });
    });
  }
});
