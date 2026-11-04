Component({
    data: {
      selected: 0, // 默认选中首页
      color: "#999999",
      selectedColor: "#0166A4",
      list: [
        {
          pagePath: "/pages/home/home", // 路径前必须加 '/'
          text: "首页",
          iconPath: "/assets/home.png",
          selectedIconPath: "/assets/home_active.png"
        },
        {
          pagePath: "/pages/zone/zone",
          text: "专区",
          iconPath: "/assets/zone.png",
          selectedIconPath: "/assets/zone_active.png"
        },
        {
          pagePath: "/pages/post/post",
          text: "发帖",
          iconPath: "/assets/post.png",
          selectedIconPath: "/assets/post_active.png"
        },
        {
          pagePath: "/pages/message/message",
          text: "消息",
          iconPath: "/assets/message.png",
          selectedIconPath: "/assets/message_active.png"
        },
        {
          pagePath: "/pages/profile/profile",
          text: "我的",
          iconPath: "/assets/profile.png",
          selectedIconPath: "/assets/profile_active.png"
        }
      ]
    },
    methods: {
      switchTab(e) {
        const data = e.currentTarget.dataset;
        const url = data.path;
        
        // 关键修复：确保调用 wx.switchTab 跳转
        wx.switchTab({
          url: url,
          success: () => {
            // 跳转成功后更新选中状态
            this.setData({
              selected: data.index
            });
          },
          fail: (err) => {
            console.error("tabBar跳转失败：", err);
            wx.showToast({
              title: "跳转失败，请重试",
              icon: "none"
            });
          }
        });
      }
    }
  });