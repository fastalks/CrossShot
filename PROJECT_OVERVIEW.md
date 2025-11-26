# CrossShot 项目概览

## 🎉 项目已创建完成！

CrossShot 是一个完整的跨平台UI自动化测试工具，包含移动端和桌面端两个应用。

## 📦 项目结构

```
CrossShot/
│
├── mobile_app/                 # Flutter 移动端应用
│   ├── lib/                   # 源代码
│   │   ├── main.dart         # 应用入口
│   │   ├── screens/          # 页面
│   │   ├── services/         # 服务层
│   │   ├── providers/        # 状态管理
│   │   └── widgets/          # UI组件
│   ├── android/              # Android 配置
│   ├── ios/                  # iOS 配置
│   └── pubspec.yaml          # 依赖配置
│
├── desktop_app/               # Electron 桌面端应用
│   ├── src/
│   │   ├── main/             # Electron 主进程
│   │   │   ├── index.js     # 主进程入口
│   │   │   └── services/    # 后端服务
│   │   ├── components/       # React 组件
│   │   ├── App.js           # React 应用
│   │   └── index.js         # 渲染进程入口
│   ├── public/               # 静态资源
│   └── package.json          # 依赖配置
│
├── shared/                    # 共享资源
│   ├── PROTOCOL.md           # 通信协议文档
│   └── DEVELOPMENT.md        # 开发指南
│
├── README.md                  # 项目说明
├── CHANGELOG.md              # 更新日志
├── LICENSE                   # 许可证
└── .gitignore               # Git 忽略配置
```

## 🚀 下一步操作

### 1️⃣ 启动移动端应用

```bash
cd mobile_app

# 安装依赖
flutter pub get

# 连接设备或启动模拟器
flutter devices

# 运行应用
flutter run
```

### 2️⃣ 启动桌面端应用

```bash
cd desktop_app

# 安装依赖
npm install

# 启动开发模式
npm run dev
```

## 🔧 核心功能

### 移动端 (Flutter)
✅ Android 和 iOS 双平台支持
✅ 一键截图捕获
✅ mDNS 自动服务发现
✅ 自动上传截图到 PC
✅ 设备信息显示

### 桌面端 (Electron + React)
✅ 跨平台支持 (Windows/macOS/Linux)
✅ mDNS 服务广播
✅ HTTP 服务器接收截图
✅ 像素级图片对比
✅ 可视化差异分析
✅ 截图管理功能

### 通信机制
✅ mDNS 自动服务发现
✅ HTTP RESTful API
✅ 无需手动配置

## 📋 技术栈

### 移动端
- **框架**: Flutter 3.x
- **语言**: Dart
- **状态管理**: Provider
- **网络**: Dio + NSD (mDNS)
- **权限**: Permission Handler
- **设备信息**: Device Info Plus

### 桌面端
- **框架**: Electron 28.x
- **UI**: React 18.x
- **服务器**: Express.js
- **mDNS**: Bonjour Service
- **图像对比**: Pixelmatch + PNGjs
- **文件上传**: Multer

## 🔗 工作流程

```
┌─────────────────────────────────────────────────────────┐
│                      工作流程                             │
└─────────────────────────────────────────────────────────┘

1. 启动桌面端应用
   ↓
2. 桌面端广播 mDNS 服务 (_crossshot._tcp)
   ↓
3. 启动移动端应用
   ↓
4. 移动端自动发现桌面端服务
   ↓
5. 移动端捕获截图
   ↓
6. 截图通过 HTTP 上传到桌面端
   ↓
7. 桌面端接收并存储截图
   ↓
8. 在桌面端选择两张截图进行对比
   ↓
9. 查看详细的对比结果和差异分析
```

## 📖 重要文档

- **README.md** - 项目说明和快速开始指南
- **PROTOCOL.md** - 详细的通信协议规范
- **DEVELOPMENT.md** - 开发指南和最佳实践
- **CHANGELOG.md** - 版本更新日志

## ⚙️ 配置说明

### 移动端配置

#### Android 权限
在 `android/app/src/main/AndroidManifest.xml` 中已配置:
- 网络访问权限
- WiFi 状态权限
- 存储权限
- mDNS 多播权限

#### iOS 权限
在 `ios/Runner/Info.plist` 中已配置:
- 本地网络使用权限
- Bonjour 服务权限
- 相册访问权限

### 桌面端配置

#### 端口设置
- React Dev Server: 3000
- HTTP API Server: 8080

可在代码中修改端口:
- `src/main/services/httpServer.js` - HTTP 端口
- `src/main/services/mdnsService.js` - mDNS 端口

## 🐛 常见问题

### Q: 移动端找不到桌面端服务？
**A**: 
1. 确保在同一局域网
2. 检查防火墙设置
3. 确认桌面端服务已启动

### Q: Flutter 依赖安装失败？
**A**: 
```bash
flutter clean
flutter pub get
```

### Q: Electron 无法启动？
**A**: 
```bash
rm -rf node_modules
npm install
```

### Q: 图片对比不准确？
**A**: 
在 `compareService.js` 中调整 `threshold` 值

## 🔐 安全说明

⚠️ **当前版本适用于开发和测试环境**

生产环境建议:
- 添加用户认证机制
- 使用 HTTPS 加密传输
- 实现访问控制
- 添加日志审计

## 📦 打包发布

### 移动端
```bash
# Android APK
flutter build apk --release

# iOS IPA (需要 macOS)
flutter build ios --release
```

### 桌面端
```bash
# 打包当前平台
npm run dist

# 生成的安装包在 dist/ 目录
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License - 详见 LICENSE 文件

## 🎯 未来规划

- [ ] 批量截图对比
- [ ] 测试报告生成
- [ ] 云端存储支持
- [ ] AI 辅助对比
- [ ] 更多图片格式支持
- [ ] 自动化测试集成
- [ ] 团队协作功能

---

## 💡 使用提示

1. **首次运行**: 先启动桌面端，再启动移动端
2. **网络环境**: 确保在同一局域网内
3. **权限授予**: 首次使用需授予必要权限
4. **截图质量**: 建议使用 PNG 格式以获得最佳对比效果
5. **性能优化**: 大量截图时建议定期清理

## 📞 技术支持

如有问题或建议，请通过以下方式联系:
- 提交 GitHub Issue
- 查看文档和 FAQ
- 参考 DEVELOPMENT.md 开发指南

---

<div align="center">

**🎉 祝你使用愉快！**

Made with ❤️ for Mobile Testing Teams

</div>
