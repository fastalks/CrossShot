# CrossShot · Cross-platform UI screenshot capture and pixel-level comparison

📱 **Mobile screenshot capture** + 💻 **Desktop pixel-level diffing** + 🔗 **Zero-config network discovery**

---

## Table of contents

1. [Project overview](#project-overview)
2. [Key features](#key-features)
3. [Repository structure](#repository-structure)
4. [Quick start](#quick-start)
5. [Run flow](#run-flow)
6. [Architecture](#architecture)
7. [HTTP API](#http-api)
8. [Debugging & packaging](#debugging--packaging)
9. [FAQ](#faq)
10. [Contributing & License](#contributing--license)

## Project overview

CrossShot targets mobile UI automation scenarios: an Android foreground service listens for system screenshots, the Flutter app discovers a desktop Electron application via mDNS, uploads original images, and the desktop performs pixel-level diffing, annotations, and batch management to help QA teams quickly detect UI regressions.

## Key features

- Mobile (Flutter)
  - Android foreground service listens to MediaStore screenshots and provides a floating button for manual capture
  - mDNS (NSD) for automatic discovery of desktop services on the same LAN
  - Robust re-encoding & retry logic to ensure screenshots are fully written before upload
  - Uploads performed with Dio and automatic handling of permissions and network conditions

- Desktop (Electron + React)
  - Bonjour advertisement + Express HTTP server (default port historically used: 18733)
  - Multer-based storage under `userData/screenshots`
  - Pixelmatch + pngjs for diff generation and per-pixel statistics
  - Renderer reads screenshots via IPC (avoids `file://` restrictions)
  - Batch select, delete, and timeline views

- Communication
  - mDNS service name: `_crossshot._tcp`
  - HTTP REST endpoints for upload / list / delete
  - Zero-config: devices on same subnet can communicate without manual setup

## Repository structure

```
CrossShot/
├── electron_app/          # Electron + React desktop app
│   ├── src/
│   │   ├── index.ts      # Main process: HTTP, mDNS, IPC, file management
│   │   ├── preload.ts    # Renderer bridge
│   │   └── renderer/     # React UI (screenshot list, diff viewer)
│   └── package.json
├── flutter_app/           # Flutter mobile app
│   ├── lib/
│   │   ├── services/     # mDNS, screenshot monitor, upload logic
│   │   ├── screens/      # Connection, devices, upload UI
│   │   └── widgets/
│   ├── android/          # Foreground service + overlay (Kotlin)
│   └── pubspec.yaml
├── shared/                # Protocols, types, docs
└── README.md
```

## Quick start

### 1. Requirements

| Target | Requirements |
| --- | --- |
| Desktop | Node.js ≥ 18, npm or pnpm, Electron Forge |
| Mobile | Flutter ≥ 3.16, Android Studio, (optional) iOS/macOS |

### 2. Install & Run

```bash
# Desktop
cd electron_app
npm install
npm run dev           # starts Electron + Express + mDNS

# Mobile
cd ../flutter_app
flutter pub get
flutter run           # Android real device required for system screenshots
```

> Keep both devices on the same Wi-Fi and grant required permissions (local network, notifications, overlay, media access).

## Run flow

1. Start the desktop app: the main process launches an HTTP server, registers mDNS, and listens for IPC.
2. Start the mobile app: it uses nsd to discover `CrossShot Desktop` and shows available services.
3. Grant permissions and enable monitoring: Android requests screenshot/storage/overlay/foreground-service permissions and then listens for MediaStore changes or floating-button triggers.
4. Upload: when a new screenshot is detected it is re-encoded as PNG to ensure integrity and uploaded via `POST /api/upload`.
5. Display & diff: the Electron app stores the screenshot under `userData/screenshots`, the renderer fetches metadata via IPC, and pixelmatch is used to generate diffs and statistics.

## Architecture

```
┌─────────────┐ mDNS  ┌─────────────┐
│ Flutter App │◄──────►│ Electron   │
│ Foreground  │ HTTP   │ + Express  │
│ Service     │───────►│ + React    │
└─────────────┘        └─────────────┘
        ▲                     ▼
 MediaStore listener      IPC streaming & pixel diffing
```

- Mobile stack: Flutter · Dio · nsd · permission_handler · Kotlin foreground service + ContentObserver
- Desktop stack: Electron Forge · React 18 · TypeScript · Express · Multer · Pixelmatch · pngjs
- Data flow: PNG/Base64 → HTTP upload → local file → IPC → React Data URL

## HTTP API

### `POST /api/upload`

| field | type | description |
| --- | --- | --- |
| `screenshot` | File | Image (PNG/JPEG; stored as PNG) |
| `deviceInfo` | String | device information |
| `timestamp` | String | ISO timestamp |

Response example:

```json
{
  "success": true,
  "data": {
    "id": "1700892345123",
    "filename": "screenshot_20231125_101500.png",
    "path": "/Users/.../screenshots/...png",
    "deviceInfo": "Pixel 7 Pro / Android 14",
    "timestamp": "2023-11-25T10:15:00.123Z",
    "size": 1048576
  }
}
```

### `GET /api/screenshots`

Returns an array of stored screenshot metadata.

### `DELETE /api/screenshots/:id`

Deletes the corresponding file and metadata; returns `{ "success": true }`.

## Debugging & packaging

- Flutter: `flutter run` for hot reload, `flutter logs` for service logs, `flutter clean` to clear caches.
- Electron: `npm run dev` launches with dev tools; renderer logs in DevTools; main process logs in terminal.
- Packaging:
  - Mobile: `flutter build apk` / `flutter build appbundle`
  - Desktop: `npm run make` or `npm run package` (Forge)

## FAQ

- Cannot discover service: ensure both devices are on same subnet, desktop app is running, macOS allows local network access, and Android has local network permission.
- Upload 0-byte or corrupted: ensure Android has file read permission and wait until system `IS_PENDING=0` before uploading (retries are built-in). Check mobile logs if issues persist.
- Electron not showing images: renderer reads screenshots via IPC; if images are missing check that `userData/screenshots` contains files and IPC bridge is working.
- Unexpected diff results: ensure screenshot resolutions are equal; adjust Pixelmatch threshold in settings if needed.

## Contributing & License

- Welcome issues and pull requests.
- This project is licensed under the MIT License (see `LICENSE`).

---

Made with ❤️ for mobile QA teams.
