Page({
    // 点击分区卡片事件
    selectZone(e) {
      const id = e.currentTarget.dataset.id;
      // 分区ID与名称映射表
      const zoneMap = {
        1: '活动攒局',
        2: '岗位内推',
        3: '职场咨询',
        4: '创业合作',
        5: '留学准备',
        6: '申请经验',
        7: '签证申请',
        8: '租房交流',
        9: '物品转售'
      };
      
      // 获取当前页面栈
      const pages = getCurrentPages();
      if (pages.length > 1) {
        // 获取上一个页面（发帖页面）
        const prevPage = pages[pages.length - 2];
        // 调用发帖页面的方法传递选择的分区信息
        prevPage.onZoneSelected(id, zoneMap[id] || '未知分区');
        // 返回上一个页面
        wx.navigateBack({
          delta: 1
        });
      } else {
        wx.showToast({
          title: '无法返回上一页',
          icon: 'none'
        });
      }
    },
    
    // 设置tabBar选中状态
    onShow: function () {
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        this.getTabBar().setData({
          selected: 2 // 与发帖页面保持一致的选中状态
        });
      }
    }
  });
      