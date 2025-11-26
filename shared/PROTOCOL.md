# CrossShot 通信协议规范

## 概述

CrossShot 使用 mDNS (多播 DNS) 进行服务发现，使用 HTTP RESTful API 进行数据传输。

## mDNS 服务发现

### 服务类型
```
服务名称: _crossshot._tcp
```

### 桌面端 (服务提供方)

**发布服务:**
```javascript
{
  name: 'CrossShot Desktop',
  type: 'crossshot',
  port: 8080,
  protocol: 'tcp'
}
```

### 移动端 (服务消费方)

**发现服务:**
```dart
// 监听服务类型
_discovery.discoverServices('_crossshot._tcp')
```

**服务信息:**
```dart
{
  'name': 'CrossShot Desktop',
  'host': '192.168.1.100',  // 动态获取
  'port': '8080'
}
```

## HTTP API 规范

### 基础信息

- **Base URL**: `http://{host}:{port}`
- **默认端口**: 8080
- **数据格式**: JSON / Multipart Form Data
- **字符编码**: UTF-8

---

## API 端点

### 1. 健康检查

检查服务是否正常运行。

**请求:**
```http
GET /health
```

**响应:**
```json
{
  "status": "ok",
  "service": "CrossShot Desktop"
}
```

---

### 2. 上传截图

上传移动端截图到桌面端。

**请求:**
```http
POST /api/upload
Content-Type: multipart/form-data
```

**参数:**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| screenshot | File | 是 | 截图文件 (PNG格式) |
| deviceInfo | String | 否 | 设备信息 JSON 字符串 |
| timestamp | String | 否 | ISO 8601 时间戳 |

**设备信息示例 (Android):**
```json
{
  "platform": "Android",
  "model": "Galaxy S21",
  "manufacturer": "Samsung",
  "version": "13",
  "sdkInt": 33,
  "brand": "Samsung",
  "device": "SM-G991B"
}
```

**设备信息示例 (iOS):**
```json
{
  "platform": "iOS",
  "model": "iPhone 14 Pro",
  "name": "My iPhone",
  "systemVersion": "16.5",
  "identifierForVendor": "xxx-xxx-xxx"
}
```

**成功响应:**
```json
{
  "success": true,
  "data": {
    "id": "1700990400000",
    "filename": "screenshot_1700990400000_xxx.png",
    "path": "/path/to/file.png",
    "deviceInfo": "{...}",
    "timestamp": "2023-11-26T12:00:00.000Z",
    "size": 1024000
  }
}
```

**失败响应:**
```json
{
  "error": "未接收到截图文件"
}
```

---

### 3. 获取截图列表

获取所有已上传的截图。

**请求:**
```http
GET /api/screenshots
```

**响应:**
```json
{
  "success": true,
  "data": [
    {
      "id": "1700990400000",
      "filename": "screenshot_xxx.png",
      "path": "/path/to/file.png",
      "deviceInfo": "{...}",
      "timestamp": "2023-11-26T12:00:00.000Z",
      "size": 1024000
    }
  ]
}
```

---

### 4. 删除截图

删除指定的截图。

**请求:**
```http
DELETE /api/screenshots/:id
```

**参数:**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 截图 ID |

**成功响应:**
```json
{
  "success": true
}
```

**失败响应 (404):**
```json
{
  "error": "截图不存在"
}
```

---

## 错误代码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## 数据流程

### 完整上传流程

```
┌──────────┐                                    ┌──────────┐
│  Mobile  │                                    │ Desktop  │
│   App    │                                    │   App    │
└─────┬────┘                                    └────┬─────┘
      │                                              │
      │ 1. mDNS Discovery (_crossshot._tcp)         │
      │────────────────────────────────────────────►│
      │                                              │
      │ 2. Service Info (host, port)                │
      │◄────────────────────────────────────────────│
      │                                              │
      │ 3. Capture Screenshot                        │
      │─────────┐                                    │
      │         │                                    │
      │◄────────┘                                    │
      │                                              │
      │ 4. POST /api/upload                          │
      │    (screenshot + deviceInfo)                 │
      │─────────────────────────────────────────────►│
      │                                              │
      │                                              │ 5. Save File
      │                                              │─────────┐
      │                                              │         │
      │                                              │◄────────┘
      │                                              │
      │ 6. Response (success)                        │
      │◄─────────────────────────────────────────────│
      │                                              │
      │                                              │ 7. Notify UI
      │                                              │─────────┐
      │                                              │         │
      │                                              │◄────────┘
      │                                              │
```

---

## 安全考虑

1. **局域网限制**: 服务仅在局域网内可用
2. **无认证机制**: 当前版本不包含身份验证
3. **明文传输**: HTTP 传输，未加密
4. **CORS**: 允许所有来源 (开发环境)

**生产环境建议:**
- 添加 Token 认证
- 使用 HTTPS
- 限制 CORS 来源
- 添加速率限制

---

## 移动端实现示例

### Flutter (Dart)

```dart
// 上传截图
Future<bool> uploadScreenshot(
  File screenshot,
  String host,
  int port,
  Map<String, dynamic> deviceInfo,
) async {
  final formData = FormData.fromMap({
    'screenshot': await MultipartFile.fromFile(
      screenshot.path,
      filename: 'screenshot_${DateTime.now().millisecondsSinceEpoch}.png',
    ),
    'deviceInfo': jsonEncode(deviceInfo),
    'timestamp': DateTime.now().toIso8601String(),
  });

  final response = await dio.post(
    'http://$host:$port/api/upload',
    data: formData,
  );

  return response.statusCode == 200;
}
```

---

## 测试工具

### cURL 测试上传

```bash
curl -X POST http://localhost:8080/api/upload \
  -F "screenshot=@test.png" \
  -F "deviceInfo={\"platform\":\"Test\",\"model\":\"Test Device\"}" \
  -F "timestamp=2023-11-26T12:00:00.000Z"
```

### cURL 测试获取列表

```bash
curl http://localhost:8080/api/screenshots
```

### cURL 测试删除

```bash
curl -X DELETE http://localhost:8080/api/screenshots/1700990400000
```

---

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2023-11-26 | 初始版本 |
