Page({
    // 点击内容卡片跳转
    goToZoneDetail(e) {
      const id = e.currentTarget.dataset.id;
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
      
      // 执行跳转
      wx.navigateTo({
        url: `/pages/zones/zones?id=${id}&name=${encodeURIComponent(zoneMap[id] || '未知合集')}`
      });
    },
    
    // 添加tabBar选中状态设置
    onShow: function () {
      // 设置"专区"选项为选中状态（索引为1）
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        this.getTabBar().setData({
          selected: 1
        });
      }
    }
  });