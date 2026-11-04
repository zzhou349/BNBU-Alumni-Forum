const apiConfig = require('../../config/api.js');

Page({
    data: {
        account: '', // 账号
        password: '', // 密码
    },

    // 账号输入
    onAccountInput(e) {
        this.setData({ account: e.detail.value });
    },

    // 密码输入
    onPasswordInput(e) {
        this.setData({ password: e.detail.value });
    },

    // 登录
    login() {
        const { account, password } = this.data;

        // 检查输入是否完整
        if (!account || !password) {
            wx.showToast({
                title: '请输入账号和密码',
                icon: 'none',
            });
            return;
        }

        // 调用后端登录接口
        wx.request({
            url: apiConfig.getFullURL('/login'), // 后端登录接口地址
            method: 'POST',
            data: {
                account,
                password,
            },
            success: (res) => {
                if (res.data.code === 200) {
                    const app = getApp();
                    const userData = res.data.data; // 获取后端返回的用户数据

                    // 验证并修复用户ID
                    const validatedUserInfo = app.validateUserInfo(userData);

                    // 调用全局登录状态设置方法
                    app.setLoginStatus(true, validatedUserInfo);

                    wx.showToast({
                        title: '登录成功',
                        icon: 'success',
                    });
                    setTimeout(() => {
                        wx.switchTab({
                            url: '/pages/home/home', // 跳转到首页
                        });
                    }, 2000);
                } else {
                    wx.showToast({
                        title: res.data.message || '登录失败',
                        icon: 'none',
                    });
                }
            },
            fail: (err) => {
                wx.showToast({
                    title: '网络请求失败',
                    icon: 'none',
                });
            },
        });
    },

    // 跳转到注册页面
    navigateToRegister() {
        wx.navigateTo({
            url: '/pages/register/register',
        });
    },

    navigateToResetPassword() {
        wx.navigateTo({
            url: '/pages/password/password?mode=reset',
        });
    },
});
