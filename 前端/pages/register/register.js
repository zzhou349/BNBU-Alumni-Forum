const apiConfig = require('../../config/api.js');

Page({
    data: {
        emailPrefix: '',
        password: '',
        confirmPassword: '',
        nickname: '',
        avatar: '',
        bio: '',
        isUploading: false
    },

    // 账号输入 - 只处理前缀部分
    onAccountInput(e) {
        this.setData({ emailPrefix: e.detail.value });
    },

    // 密码输入
    onPasswordInput(e) {
        this.setData({ password: e.detail.value });
    },

    // 确认密码输入
    onConfirmPasswordInput(e) {
        this.setData({ confirmPassword: e.detail.value });
    },

    // 昵称输入
    onNicknameInput(e) {
        this.setData({ nickname: e.detail.value });
    },

    // 介绍输入
    onBioInput(e) {
        this.setData({ bio: e.detail.value });
    },

    // 头像选择方法
    chooseAvatar() {
        if (this.data.isUploading) return;
        wx.chooseImage({
            count: 1,
            sizeType: ['compressed'],
            sourceType: ['album', 'camera'],
            success: (res) => {
                const tempFilePath = res.tempFilePaths[0];
                this.uploadAvatar(tempFilePath);
            },
        });
    },

    // 头像上传方法
    uploadAvatar(filePath) {
        const that = this;
        that.setData({ isUploading: true });
        wx.showLoading({ title: '上传中...', mask: true });

        wx.uploadFile({
            url: apiConfig.getFullURL('/upload'),
            filePath: filePath,
            name: 'file',
            formData: {
                type: 'avatar'
            },
            success: (res) => {
                try {
                    const data = JSON.parse(res.data);
                    if (data.code === 200) {
                        that.setData({
                            avatar: data.imageUrl  // 使用完整的图片URL
                        });
                    } else {
                        wx.showToast({
                            title: '上传失败: ' + (data.message || '未知错误'),
                            icon: 'none'
                        });
                    }
                } catch (e) {
                    console.error('解析响应失败', e);
                    wx.showToast({
                        title: '上传失败: 解析响应失败',
                        icon: 'none'
                    });
                }
            },
            fail: (err) => {
                wx.showToast({
                    title: '上传失败: 网络错误',
                    icon: 'none'
                });
            },
            complete: () => {
                wx.hideLoading();
                that.setData({ isUploading: false });
            }
        });
    },

    // 注册函数（已修正错误并优化校验）
    register() {
        const { emailPrefix, password, confirmPassword, nickname, avatar, bio } = this.data;
        // 拼接完整邮箱（核心变量修正：使用email替代未定义的account）
        const email = `${emailPrefix}@alumni.uic.edu.cn`;

        // 1. 验证邮箱前缀不能为空
        if (!emailPrefix.trim()) {
            wx.showToast({
                title: '请输入邮箱前缀',
                icon: 'none',
                duration: 2000
            });
            return;
        }

        // 2. 验证邮箱前缀格式（字母、数字、下划线、减号）
        if (!/^[a-zA-Z0-9_-]+$/.test(emailPrefix)) {
            wx.showToast({
                title: '邮箱前缀仅支持字母、数字、下划线和减号',
                icon: 'none',
                duration: 2000
            });
            return;
        }

        // 3. 验证完整邮箱格式（补充校验）
        if (!/^[a-zA-Z0-9_-]+@alumni\.uic\.edu\.cn$/.test(email)) {
            wx.showToast({
                title: '邮箱格式错误',
                icon: 'none',
                duration: 2000
            });
            return;
        }

        // 4. 验证密码不能为空（修正：使用email替代account）
        if (!email || !password || !confirmPassword) {
            wx.showToast({
                title: '请输入完整信息',
                icon: 'none',
                duration: 2000
            });
            return;
        }

        // 5. 验证密码长度（新增：至少6位）
        if (password.length < 6) {
            wx.showToast({
                title: '密码长度至少6位',
                icon: 'none',
                duration: 2000
            });
            return;
        }

        // 6. 验证两次密码一致性
        if (password !== confirmPassword) {
            wx.showToast({
                title: '两次密码不一致',
                icon: 'none',
                duration: 2000
            });
            return;
        }

        // 处理默认头像
        const finalAvatar = avatar || '/assets/avatar.png';

        // 调用注册接口
        wx.request({
            url: apiConfig.getFullURL('/register'),
            method: 'POST',
            data: {
                account: email,  // 接口参数使用account，值为拼接的email
                password,
                nickname: nickname || emailPrefix,  // 昵称为空时用邮箱前缀
                avatar: finalAvatar,
                bio
            },
            success: (res) => {
                if (res.data.code === 200) {
                    wx.showToast({
                        title: '注册成功',
                        icon: 'success',
                        duration: 2000
                    });
                    setTimeout(() => {
                        wx.navigateBack();  // 注册成功后返回上一页
                    }, 2000);
                } else {
                    wx.showToast({
                        title: res.data.message || '注册失败',
                        icon: 'none',
                        duration: 2000
                    });
                }
            },
            fail: (err) => {
                console.error('注册请求失败', err);
                wx.showToast({
                    title: '网络请求失败，请重试',
                    icon: 'none',
                    duration: 2000
                });
            }
        });
    }
});