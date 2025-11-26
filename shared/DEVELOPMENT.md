# CrossShot 开发指南

## 目录

1. [开发环境搭建](#开发环境搭建)
2. [项目架构](#项目架构)
3. [代码规范](#代码规范)
4. [调试技巧](#调试技巧)
5. [常见开发任务](#常见开发任务)
6. [性能优化](#性能优化)

---

## 开发环境搭建

### Flutter 移动端

#### macOS

```bash
# 安装 Flutter
brew install --cask flutter

# 配置环境变量
export PATH="$PATH:/path/to/flutter/bin"

# 检查环境
flutter doctor

# 安装 Android Studio
brew install --cask android-studio

# 安装 Xcode (从 App Store)
```

#### Windows

```bash
# 1. 下载 Flutter SDK
# https://docs.flutter.dev/get-started/install/windows

# 2. 解压到目录
# 3. 添加到 PATH

# 4. 安装 Android Studio
```

#### Linux

```bash
# 下载并解压 Flutter
wget https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_xxx.tar.xz
tar xf flutter_linux_xxx.tar.xz

# 添加到 PATH
export PATH="$PATH:`pwd`/flutter/bin"

# 检查环境
flutter doctor
```

### Electron 桌面端

```bash
# 安装 Node.js (推荐使用 nvm)
# macOS/Linux
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 16
nvm use 16

# Windows
# 从官网下载安装: https://nodejs.org/

# 验证安装
node --version
npm --version
```

---

## 项目架构

### Flutter 移动端架构

```
lib/
├── main.dart              # 应用入口
├── screens/               # 页面
│   └── home_screen.dart
├── services/              # 业务逻辑
│   ├── mdns_service.dart   # mDNS 服务发现
│   └── screenshot_service.dart  # 截图服务
├── providers/             # 状态管理
│   └── device_provider.dart
└── widgets/               # UI 组件
    ├── device_info_card.dart
    ├── screenshot_button.dart
    └── server_list.dart
```

**架构模式**: Provider 状态管理

**数据流:**
```
UI (Widgets) → Provider → Service → API
     ↑                                 ↓
     └─────────── State Update ────────┘
```

### Electron 桌面端架构

```
src/
├── main/                  # Electron 主进程
│   ├── index.js          # 主进程入口
│   └── services/         # 后端服务
│       ├── mdnsService.js      # mDNS 广播
│       ├── httpServer.js       # HTTP 服务器
│       └── compareService.js   # 图片对比
├── components/           # React 组件
│   ├── Header.js
│   ├── ScreenshotList.js
│   └── CompareView.js
├── App.js               # React 应用入口
└── index.js             # 渲染进程入口
```

**架构模式**: Electron + React

**进程通信:**
```
Renderer Process (React)
       ↓ IPC
Main Process (Node.js)
       ↓
Services (mDNS, HTTP)
```

---

## 代码规范

### Flutter (Dart)

```dart
// 1. 使用 const 构造函数
const SizedBox(height: 10)

// 2. 命名规范
class MyWidget extends StatelessWidget { }  // UpperCamelCase
final myVariable = '';                       // lowerCamelCase
const MY_CONSTANT = '';                      // SCREAMING_SNAKE_CASE

// 3. 异步处理
Future<void> loadData() async {
  try {
    final data = await fetchData();
    // 处理数据
  } catch (e) {
    print('Error: $e');
  }
}

// 4. 空安全
String? nullableString;
String nonNullableString = '';

// 5. 格式化
flutter format lib/
```

### JavaScript (ES6+)

```javascript
// 1. 使用 const/let
const API_URL = 'http://localhost:8080';
let counter = 0;

// 2. 箭头函数
const add = (a, b) => a + b;

// 3. 解构赋值
const { name, age } = user;
const [first, second] = array;

// 4. 模板字符串
const message = `Hello, ${name}!`;

// 5. async/await
async function fetchData() {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error:', error);
  }
}

// 6. 格式化 (使用 Prettier)
npm run format
```

---

## 调试技巧

### Flutter 调试

```bash
# 1. 热重载
# 在运行时按 'r' 键

# 2. 完全重启
# 在运行时按 'R' 键

# 3. 查看日志
flutter logs

# 4. 打印调试信息
print('Debug: $variable');
debugPrint('Debug message');

# 5. 断点调试
# 在 VSCode/Android Studio 中设置断点

# 6. 性能分析
flutter run --profile
# 打开 DevTools
flutter pub global activate devtools
flutter pub global run devtools
```

### Electron 调试

```javascript
// 1. 主进程日志
console.log('Main process:', data);

// 2. 渲染进程调试
// 打开 DevTools: Cmd/Ctrl + Shift + I

// 3. React DevTools
npm install -g react-devtools
react-devtools

// 4. 网络请求调试
// 在 DevTools Network 标签中查看

// 5. 断点调试
// 使用 debugger 语句
debugger;

// 6. IPC 通信调试
ipcMain.handle('event', (event, args) => {
  console.log('Received:', args);
  return result;
});
```

---

## 常见开发任务

### 添加新的 Flutter 页面

```dart
// 1. 创建页面文件
// lib/screens/new_screen.dart
class NewScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('New Screen')),
      body: Container(),
    );
  }
}

// 2. 添加路由
Navigator.push(
  context,
  MaterialPageRoute(builder: (context) => NewScreen()),
);
```

### 添加新的 React 组件

```javascript
// 1. 创建组件文件
// src/components/NewComponent.js
import React from 'react';
import './NewComponent.css';

function NewComponent({ props }) {
  return (
    <div className="new-component">
      {/* Component content */}
    </div>
  );
}

export default NewComponent;

// 2. 在父组件中使用
import NewComponent from './components/NewComponent';

<NewComponent props={value} />
```

### 添加新的 API 接口

```javascript
// desktop_app/src/main/services/httpServer.js

setupRoutes() {
  // 添加新接口
  this.expressApp.get('/api/new-endpoint', (req, res) => {
    try {
      // 处理逻辑
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
```

### 修改图片对比阈值

```javascript
// desktop_app/src/main/services/compareService.js

const numDiffPixels = pixelmatch(
  img1.data,
  img2.data,
  diff.data,
  width,
  height,
  { 
    threshold: 0.1  // 修改此值 (0-1)
    // 0.1 = 10% 容差
    // 值越小越严格
  }
);
```

---

## 性能优化

### Flutter 性能优化

```dart
// 1. 使用 const 构造函数
const Text('Hello')  // ✅ 好
Text('Hello')        // ❌ 避免

// 2. 避免在 build 中创建对象
class MyWidget extends StatelessWidget {
  static const textStyle = TextStyle(fontSize: 16);  // ✅
  
  @override
  Widget build(BuildContext context) {
    // final textStyle = TextStyle(fontSize: 16);  // ❌
    return Text('Hello', style: textStyle);
  }
}

// 3. 使用 ListView.builder
ListView.builder(
  itemCount: items.length,
  itemBuilder: (context, index) => ItemWidget(items[index]),
)

// 4. 图片优化
Image.network(
  url,
  cacheWidth: 300,  // 限制缓存尺寸
  cacheHeight: 300,
)
```

### Electron 性能优化

```javascript
// 1. 避免同步操作
// ❌ 避免
const data = fs.readFileSync(path);

// ✅ 使用异步
const data = await fs.promises.readFile(path);

// 2. 图片懒加载
<img 
  src={thumbnail} 
  data-src={fullImage}
  loading="lazy"
/>

// 3. 虚拟滚动
// 使用 react-window 或 react-virtualized

// 4. React 性能优化
// 使用 React.memo
const MyComponent = React.memo(function MyComponent(props) {
  return <div>{props.value}</div>;
});

// 使用 useMemo
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(a, b);
}, [a, b]);

// 5. IPC 优化
// 避免频繁 IPC 调用
// 使用防抖/节流
const debouncedUpdate = debounce(() => {
  ipcRenderer.invoke('update', data);
}, 300);
```

---

## 测试

### Flutter 单元测试

```dart
// test/services/mdns_service_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:crossshot_mobile/services/mdns_service.dart';

void main() {
  group('MDNSService', () {
    test('should discover services', () async {
      final service = MDNSService();
      await service.startDiscovery();
      
      expect(service.discoveredServers, isNotEmpty);
    });
  });
}

// 运行测试
flutter test
```

### Electron 测试

```javascript
// test/compareService.test.js
const CompareService = require('../src/main/services/compareService');

describe('CompareService', () => {
  it('should compare images', async () => {
    const service = new CompareService();
    const result = await service.compareImages(img1, img2);
    
    expect(result.success).toBe(true);
    expect(result.diffPercentage).toBeGreaterThanOrEqual(0);
  });
});

// 运行测试
npm test
```

---

## 发布清单

### 移动端发布

- [ ] 更新版本号 (pubspec.yaml)
- [ ] 更新 Changelog
- [ ] 运行测试
- [ ] 构建 Release 版本
- [ ] 签名应用 (Android/iOS)
- [ ] 上传到应用商店

### 桌面端发布

- [ ] 更新版本号 (package.json)
- [ ] 更新 Changelog
- [ ] 运行测试
- [ ] 构建各平台安装包
- [ ] 代码签名 (可选)
- [ ] 发布到 GitHub Releases

---

## 参考资源

### Flutter
- [Flutter 官方文档](https://flutter.dev/docs)
- [Dart 语言指南](https://dart.dev/guides)
- [Flutter Package](https://pub.dev/)

### Electron
- [Electron 官方文档](https://www.electronjs.org/docs)
- [React 文档](https://react.dev/)
- [Node.js 文档](https://nodejs.org/docs)

### mDNS
- [Bonjour Service](https://github.com/watson/bonjour-service)
- [Flutter NSD](https://pub.dev/packages/nsd)

---

## 贡献代码

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

---

## 许可证

MIT License
