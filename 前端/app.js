App({
    onLaunch() {
        console.log("小程序启动");
        // 从存储恢复登录状态
        const isLoggedIn = wx.getStorageSync('isLoggedIn');
        const userInfo = wx.getStorageSync('userInfo');
        
        if (isLoggedIn && userInfo) {
            // 验证并修复用户ID
            const validatedUserInfo = this.validateUserInfo(userInfo);
            this.setLoginStatus(true, validatedUserInfo);
        }
    },

    // 验证用户信息中的ID
    validateUserInfo(userInfo) {
        // 深拷贝避免修改原对象
        const validated = JSON.parse(JSON.stringify(userInfo));
        
        // 确保user_id存在且为数字
        if (!validated.user_id) {
            // 尝试从其他字段获取
            validated.user_id = validated.id || 0;
        }
        
        // 转换为数字类型
        if (typeof validated.user_id === 'string') {
            validated.user_id = parseInt(validated.user_id, 10);
        }
        
        // 确保ID是数字且大于0
        if (isNaN(validated.user_id) || validated.user_id <= 0) {
            validated.user_id = 0;
        }
        
        return validated;
    },

    // 获取经过验证的用户ID
    getValidUserId() {
        const userInfo = this.globalData.userInfo;
        
        // 验证并修复用户ID
        if (userInfo) {
            const validated = this.validateUserInfo(userInfo);
            
            // 如果修复后的ID有效，更新全局数据
            if (validated.user_id > 0) {
                this.globalData.userInfo = validated;
                this.globalData.userId = validated.user_id;
                return validated.user_id;
            }
        }
        
        // 无效ID返回0
        return 0;
    },

    globalData: {
        isLoggedIn: false,
        userInfo: null,
        userId: 0,

        // 登录状态监听器
        loginListeners: new Set(),
        
        onLoginChange(callback) {
            if (typeof callback === 'function') {
                this.loginListeners.add(callback);
            }
        },
        
        offLoginChange(callback) {
            this.loginListeners.delete(callback);
        },
        
        // 事件总线
        eventBus: {
            listeners: {},
            on(event, callback) {
                if (!this.listeners[event]) this.listeners[event] = [];
                this.listeners[event].push(callback);
            },
            emit(event, data) {
                const callbacks = this.listeners[event] || [];
                callbacks.slice().forEach(cb => {
                    try {
                        cb(data);
                    } catch (e) {
                        console.error(`Event ${event} handler error:`, e);
                    }
                });
            },
            off(event, callback) {
                const callbacks = this.listeners[event];
                if (!callbacks) return;
                if (!callback) {
                    delete this.listeners[event];
                    return;
                }
                const index = callbacks.indexOf(callback);
                if (index !== -1) callbacks.splice(index, 1);
            }
        }
    },
    
    setLoginStatus(isLoggedIn, userInfo) {
        // 验证用户信息
        const validatedUserInfo = isLoggedIn ? this.validateUserInfo(userInfo) : null;
        
        // 更新全局数据
        this.globalData.isLoggedIn = isLoggedIn;
        this.globalData.userInfo = validatedUserInfo;
        this.globalData.userId = validatedUserInfo?.user_id || 0;
        
        // 持久化存储
        wx.setStorageSync('isLoggedIn', isLoggedIn);
        wx.setStorageSync('userInfo', validatedUserInfo);
        
        // 触发两种通知机制
        // 事件总线（供需要详细数据的页面使用）
        this.globalData.eventBus.emit('loginStateChange', {
            isLoggedIn,
            userInfo: validatedUserInfo
        });
        
        // 简化监听器（供只需要布尔状态的页面使用）
        this.globalData.loginListeners.forEach(cb => {
            try {
                cb(isLoggedIn);
            } catch (e) {
                console.error('Login listener error:', e);
            }
        });
    },
    
    logout() {
        this.setLoginStatus(false, null);
    }
});