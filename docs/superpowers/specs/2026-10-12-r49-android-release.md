# R49 — the Android release build

**Date:** 2026-10-12 · **Status:** the user's request ("android dozvole i release build"). · **Release:** none; the web app does not change. The APK's `versionName` is now the real version.

## Permissions (checked, unchanged)

The merged manifest of the built APK (`aapt2 dump permissions`) lists:
- `INTERNET`;
- `POST_NOTIFICATIONS`;
- `SCHEDULE_EXACT_ALARM`;
- `WRITE_EXTERNAL_STORAGE` with `maxSdkVersion` 29;
- `READ_EXTERNAL_STORAGE` with `maxSdkVersion` 32;
- `VIBRATE`;
- `RECEIVE_BOOT_COMPLETED`;
- `WAKE_LOCK`;
- `USE_BIOMETRIC` and `USE_FINGERPRINT`;
- the AndroidX dynamic-receiver permission.

The storage permissions were already limited to old Android versions (R27). The exact-alarm setting was already optional:
- `DailoPlatform.notifications.exactAlarms` and `allowExactAlarms` exist since M6, with the Settings action `allow-exact-alarms`;
- reminders fall back to inexact alarms without the setting.

Nothing needed to change. The release guide explains each permission for Google Play.

## Version (`android/app/build.gradle`)

- **`versionName`:** `package.json`'s `version`, read with `JsonSlurper`.
- **`versionCode`:** `dailoVersionCode`, which keeps every later version higher. The formula is `major × 10,000,000 + minor × 100,000 + patch × 1,000 + step`.
  - **Step:** `alpha.N` gives N, `beta.N` gives 300 + N, `rc.N` gives 600 + N, and a release gives 999.
  - **Limits:** N below 300, minor and patch below 100; any other version stops the build with a message.
  - **Examples:** `2.0.0-alpha.76` → 20000076, and `2.0.0` → 20000999.
- **Debug builds:** they go from 1 to 20000076, so they still install over older debug builds.

## Signing

- **The `upload` signing config:** it reads `DAILO_UPLOAD_STORE_FILE`, `DAILO_UPLOAD_STORE_PASSWORD`, `DAILO_UPLOAD_KEY_ALIAS` and `DAILO_UPLOAD_KEY_PASSWORD` from the environment or from Gradle properties (`dailoSecret`).
- **The release build type:** it uses that config only when all four are set.
- **Without the key:** `bundleRelease` and `assembleRelease` stop with a message naming the variables and the guide. The exception is Android Studio's "Generate Signed Bundle", which injects its own key.
- **Debug builds:** they keep the shared `debug.keystore`.
- **`.gitignore`:** it now ignores `*.jks` and `*.keystore`, except `android/app/debug.keystore`.

## Workflow

`.github/workflows/android-release.yml` runs by hand or on a `v*` tag:
1. `npm ci`, `verify`, `cap:sync`;
2. decodes the `DAILO_UPLOAD_KEYSTORE_BASE64` secret into the runner's temp folder (with a clear error when the secrets are missing);
3. runs `./gradlew bundleRelease assembleRelease`;
4. deletes the key file;
5. uploads `app-release.aab` and `app-release.apk` as the 30-day artifact `dailo-release`.

## Guide

`docs/v2/android-izdanje.md` (Serbian) covers:
- the upload key (`keytool -genkeypair`) and Play App Signing;
- the four GitHub secrets;
- building on GitHub or locally;
- the version rule;
- the Play Console steps (internal testing, store listing, privacy policy, Data safety answers, content rating);
- what each permission is for.

## Checks

- **Node:** `tests/android-release-r49.test.js`, written first; it failed 4/4. It covers:
  - the version;
  - the signing;
  - the workflow;
  - the guide.
- **Updated older tests:** `tests/android-debug-signing.test.js` (a release build never uses the debug key) and `tests/native-m8.test.js` (the version now comes from `package.json`).
- **Builds in the cloud:**
  - with no key, `bundleRelease` stopped with the message;
  - with a throwaway key (made in the scratchpad and deleted afterwards), `bundleRelease assembleRelease assembleDebug` built;
  - `apksigner verify` showed that key, and `aapt2` showed `versionCode='20000076' versionName='2.0.0-alpha.76'` for release and debug.
- **The user's part:** the real upload key, the secrets and Google Play.
