# CrossShot Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2023-11-26

### Added

#### 移动端应用 (Flutter)
- ✨ 支持 Android 和 iOS 双平台
- 📸 一键截图捕获功能
- 🔍 mDNS 自动服务发现
- 📤 截图自动上传到 PC 端
- 📱 实时显示设备信息
- 🎨 Material Design UI 设计

#### 桌面端应用 (Electron)
- 💻 跨平台支持 (Windows, macOS, Linux)
- 📡 mDNS 服务广播
- 🌐 HTTP 服务器接收截图
- 🔬 像素级图片对比功能
- 📊 可视化差异分析界面
- 🗂️ 截图管理功能 (查看、删除)
- 📈 实时统计信息显示

#### 通信协议
- 🔗 mDNS 自动服务发现
- 📡 HTTP RESTful API
- 📦 Multipart 文件上传
- 🔄 实时数据同步

#### 文档
- 📖 完整的 README 文档
- 📋 详细的通信协议规范
- 🛠️ 开发指南文档
- 💡 使用说明和示例

### Technical Details

#### 移动端技术栈
- Flutter 3.x
- Provider 状态管理
- Dio HTTP 客户端
- NSD mDNS 服务发现
- Device Info Plus 设备信息

#### 桌面端技术栈
- Electron 28.x
- React 18.x
- Express.js HTTP 服务
- Bonjour mDNS 服务
- Pixelmatch 图像对比
- Multer 文件上传

### Known Issues
- iOS 截图功能需要配合原生代码实现
- 图片对比仅支持 PNG 格式
- 需要在同一局域网环境

### Future Plans
- [ ] 支持批量截图对比
- [ ] 添加截图历史记录
- [ ] 支持多种图片格式
- [ ] 添加用户认证
- [ ] 云端存储支持
- [ ] 自动化测试集成

---

## [Unreleased]

### Planned Features
- 📊 测试报告生成
- 🔐 安全认证机制
- ☁️ 云端同步功能
- 🤖 AI 辅助对比
- 📱 更多平台支持

---

[1.0.0]: https://github.com/yourusername/crossshot/releases/tag/v1.0.0
