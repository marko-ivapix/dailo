---
paths:
  - "android/**"
  - "ios/**"
  - "capacitor.config.json"
  - "package.json"
---
# Native projects (android/, ios/)

- Capacitor and plugin versions are pinned exactly in `package.json`. After a change, run `npm run cap:sync`; on iOS the plugin must support Swift Package Manager.
- Android XML comments must not contain `--` (`tests/android-resources.test.js`).
- **Signing:**
  - Debug builds use the shared key `android/app/debug.keystore`.
  - The release upload key comes only from `DAILO_UPLOAD_*` (environment or Gradle properties, GitHub secrets) and never enters git.
  - `versionName` and `versionCode` come from `package.json`.
- Native builds, emulators and devices cannot run in the cloud session except the Android debug APK (the `android-apk` skill). Everything else is manual-pending until the user reports it.
