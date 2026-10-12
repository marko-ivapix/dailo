---
name: android-apk
description: Build the Dailo Android debug APK in a cloud session, verify its version and signing key, and send it to the user. Use when the user asks for an APK ("napravi apk") or a new build to install on Android.
---

# Debug APK for the user's phone

Every debug build is signed with the shared key `android/app/debug.keystore`. A new APK therefore installs over the old one and keeps the user's data.

1. **SDK.** Use `~/android-sdk` if it exists (`ANDROID_HOME=$HOME/android-sdk`; `android/local.properties` holds `sdk.dir`, gitignored). Otherwise follow "Android APK in a cloud session" in `docs/claude/TESTING_AND_RELEASE.md`, which needs `dl.google.com` in the allowed domains. If Maven Central answers 429, use the init-script mirror described there.
2. **Build** from the branch that holds what the user should get (usually the work branch or `main`):

   ```bash
   export ANDROID_HOME=$HOME/android-sdk
   npm ci            # only if node_modules is missing
   npm run cap:sync
   (cd android && ./gradlew assembleDebug --no-daemon -q)
   ```

3. **Verify before sending.**
   - **Version and code:** `android/app/build/outputs/apk/debug/output-metadata.json` must show `versionName` = `js/release.js` `APP_VERSION`, with `versionCode` from `dailoVersionCode`.
   - **The web part:** `unzip -p <apk> assets/public/js/release.js | grep APP_VERSION`.
   - **The signing key:** `$ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs <apk>` must show the same SHA-256 as `keytool -list -v -keystore android/app/debug.keystore -storepass android`.
4. **Send.** Copy the APK to the scratchpad as `Dailo-<version>-debug.apk` and send it with `SendUserFile` (display `attach`).
5. **Tell the user** in Serbian:
   - the version;
   - that it installs over the previous one and keeps the data;
   - that the phone checks are theirs.

   Record their report in the ledger only as they give it.

CI also builds the same APK on every push, as the artifact `dailo-debug-apk` of the `CI` workflow. That is an alternative when the session cannot reach Google's servers.
