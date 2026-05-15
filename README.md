# JLU LibSeat PC Wide Layout

吉林大学 图书馆预约 页面桌面端增强脚本。脚本主要面向 `https://libseat.jlu.edu.cn/`，用于改善 PC 浏览器里的座位地图、时间选择和座位预约体验。

## 功能

- 扩展 H5 页面宽度，优化 PC 浏览器下的座位地图显示。
- 修复/增强座位地图里的设施图标显示，减少墙、门、书架等元素遮挡座位交互。
- 根据座位当天可预约时长标色：
  - 橙色：30 分钟到 1 小时
  - 黄色：1 到 2 小时
  - 绿色：2 小时以上
  - 红色：占用或不可预约
- 替换原始时间选择器，支持直接输入开始和结束时间。
- 在顶部工具栏输入座位号后按日期读取可预约时间段。
- 支持一键预约今天的座位，提交结果会显示楼层/阅览室、座位、日期和时间段。
- 支持按钮式 21:00 自动预约次日座位，可填写多个候选座位，直到其中一个预约成功。

## 安装

1. 安装浏览器 userscript 扩展，例如 Tampermonkey 或 Violentmonkey。
2. 打开仓库中的 `libseat_pc_wide.user.js`。
3. 将脚本内容安装到 userscript 扩展中。
4. 访问 `https://libseat.jlu.edu.cn/`。

## 使用

进入选座页面后，页面顶部会出现三行增强预约区域：

- “查时间段”：选择今天或明天，并输入座位号读取可预约时间段。
- “预约今天”：输入或选择开始/结束时间，点击“预约今天”提交当天预约。
- “自动预约”：点击按钮开启或关闭 21:00 自动预约次日座位。

座位号可以填写多个候选，例如 `62, 63, 64`。选择“可预约时间段”会自动填充开始和结束时间，之后仍可手动修改。

## 调试

在浏览器控制台执行：

```js
localStorage.setItem("libseatPcWideDebug", "1")
```

刷新页面后可以使用这些辅助接口：

```js
libseatPcWideDebug()
libseatPcWideSeats()
libseatPcWideResolveSeat("62")
libseatPcWideResolveSeats("62,63")
libseatPcWideSeatReservations(44, "2026-05-15")
```

关闭调试：

```js
localStorage.removeItem("libseatPcWideDebug")
```

## 开发

语法检查：

```bash
node --check libseat_pc_wide.user.js
```

## 说明

这是个人使用的页面增强脚本，不是吉林大学或 LibSeat 官方项目。脚本依赖当前网页结构和接口返回，站点更新后可能需要同步调整。
