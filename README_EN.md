# CrossShot — Cross-platform UI screenshot capture and pixel-level comparison

CrossShot helps mobile QA teams capture screenshots from Android devices (via a foreground service) and send them to a desktop Electron application for pixel-level diffing, annotation, and bulk management. The mobile app discovers desktop services via mDNS and uploads screenshots over HTTP.

## Quick start

### Desktop (Electron)

```bash
cd electron_app
npm install
npm run dev    # starts Electron + Express + mDNS
```

### Mobile (Flutter)

```bash
cd flutter_app
flutter pub get
flutter run     # use a real Android device to capture system screenshots
```

Notes

- Keep both devices on the same local network (Wi‑Fi).
- Allow required permissions on Android (local network, storage, overlay, notifications).

## HTTP API (short)

- `POST /api/upload` — upload a screenshot (multipart file), `deviceInfo`, and `timestamp`. The server stores the file under the Electron `userData/screenshots` folder and returns metadata `{ id, filename, path, deviceInfo, timestamp, size }`.
- `GET /api/screenshots` — list stored screenshot metadata.
- `DELETE /api/screenshots/:id` — delete a screenshot and its metadata.

## Recent updates (summary)

- Discovery: mDNS (`_crossshot._tcp`) is used for service discovery.
- Announce / stop: Mobile posts `POST /api/announce` when monitoring starts so the desktop shows the device immediately; posts `POST /api/announce/stop` when stopping.
- Heartbeat: Mobile posts `POST /api/heartbeat` periodically (e.g. every 5s) while monitoring; the desktop tracks last-heartbeat timestamps and marks sessions offline after a short timeout (e.g. ~15s) without heartbeats.

## Contributing

Please open issues and pull requests. For detailed architecture, debugging tips, and Chinese-language documentation, see the repository root `README.md`.

---
