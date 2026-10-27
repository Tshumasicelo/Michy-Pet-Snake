# Building the Android APK

The game in `web/` is packaged into a small Android app (in `android/`) that shows it
full-screen in a WebView. You build the APK on your own computer with Android Studio.

> **Honest status:** the Android project was written and reviewed, but it could **not** be
> compiled where it was written. That environment has no Android SDK, and Google's SDK
> download servers were blocked. The first build on your machine is the real test. If
> something fails, the [Troubleshooting](#troubleshooting) section covers the likely causes.

| What | Value |
|---|---|
| App name | Michy's Pet Snake |
| Package (application ID) | `com.michy.petsnake` |
| Min Android version | 8.0 (API 26) |
| Target / compile SDK | 36 / 37 |
| Android Gradle Plugin | 9.4.0 |
| Gradle | 9.6.0 (downloaded automatically by `gradlew`) |
| Libraries | `androidx.activity:activity-ktx:1.13.0`, `androidx.webkit:webkit:1.18.0` |
| Permissions | **none** |

---

## 1. Install Android Studio

Download the latest stable Android Studio from <https://developer.android.com/studio> and
install it with the default options. It includes its own Java (JDK), so you don't need a separate one.

## 2. Get the project

Either clone it:

```bash
git clone https://github.com/Tshumasicelo/Michy-Pet-Snake.git
```

or on GitHub click **Code → Download ZIP** and unzip it.

## 3. Open the `android` folder

In Android Studio choose **File → Open** and select the **`android`** folder inside the
project (not the top-level folder). Click **Trust Project** if asked.

Android Studio now runs a *Gradle sync*. The first sync downloads Gradle, the Android
Gradle Plugin and the libraries, so it can take several minutes. If it asks to install
**Android SDK Platform 37** or build tools, accept.

The app's `build.gradle.kts` includes `../../web` as the app's assets, so the game files
are packaged straight from `web/`. There is nothing to copy by hand.

## 4. Run it on a phone or emulator

**On your own phone (recommended):**

1. On the phone, open **Settings → About phone** and tap **Build number** 7 times to turn on Developer options.
2. In **Settings → System → Developer options**, turn on **USB debugging**.
3. Connect the phone with a USB cable and accept the "Allow USB debugging?" prompt.
4. In Android Studio pick your phone in the device list at the top and press the green ▶ **Run** button.

**On an emulator:** open **Device Manager** (right-hand side), create a virtual device
(any recent Pixel), start it, then press ▶ **Run**.

## 5. Build a debug APK file

**Menu:** **Build → Generate App Bundles or APKs → Generate APKs**. When it finishes, click
**locate** in the pop-up. The file is:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

**Command line** (from the `android` folder):

```bash
./gradlew assembleDebug        # macOS / Linux
gradlew.bat assembleDebug      # Windows
```

### Install the APK on a phone

- Copy `app-debug.apk` to the phone and tap it. Android will ask you to allow installs
  from that app (for example Files or Chrome) the first time.
- Or, with USB debugging on: `adb install -r app/build/outputs/apk/debug/app-debug.apk`

A debug APK is signed with a temporary debug key. It is fine for testing and sharing
with friends, but not for the Play Store.

## 6. Build a release version (for sharing widely or the Play Store)

### 6a. Create your signing key, once

**Menu:** **Build → Generate Signed App Bundle or APK → APK → Next → Create new...**
Save the key store somewhere safe **outside** the project folder, for example
`~/keys/michys-pet-snake.jks`.

**Or the command line:**

```bash
keytool -genkeypair -v -keystore ~/keys/michys-pet-snake.jks -alias michy \
  -keyalg RSA -keysize 2048 -validity 10000
```

> ⚠️ **Back up this file and its passwords.** If you lose them you can never publish an
> update to the same app on the Play Store.

### 6b. Tell Gradle where the key is

Create `android/keystore.properties` (it is already in `.gitignore`, so it won't be uploaded):

```properties
storeFile=/full/path/to/michys-pet-snake.jks
storePassword=your-store-password
keyAlias=michy
keyPassword=your-key-password
```

### 6c. Build

```bash
./gradlew assembleRelease   # APK  -> app/build/outputs/apk/release/app-release.apk
./gradlew bundleRelease     # AAB  -> app/build/outputs/bundle/release/app-release.aab (for the Play Store)
```

The release build is shrunk and optimised with R8 (`isMinifyEnabled = true`). Before
uploading it, install the release APK on a phone and play a level, just to be sure.

### Publishing an update

1. Change the game files in `web/` (and test them in a browser, see the README).
2. In `android/app/build.gradle.kts` increase `versionCode` (for example 1 → 2) and update `versionName`.
3. Build again. Saved progress is kept on phones that update.

---

## How the app works (short version)

- `MainActivity.kt` creates a full-screen WebView and loads
  `https://appassets.androidplatform.net/assets/index.html`. **WebViewAssetLoader** answers
  that address from the files inside the APK, so nothing goes to the internet. This is the
  approach Android's documentation recommends instead of `file://` URLs, and it gives the
  page a stable https origin, so `localStorage` saves keep working across app updates.
- File and content access are switched off, and JavaScript is on only for the app's own files.
  There is **no JavaScript bridge** (`addJavascriptInterface`).
- **Back button:** the app asks the game (`MPS.handleBack()`), which pauses, resumes or
  closes a menu. Only on the main menu does Back close the app.
- **Leaving the app** (Home button, phone call): the game pauses itself and sound is suspended.
- **Rotation:** the activity handles rotation itself, so the game keeps running and simply re-lays out.
- **Screen:** full-screen (immersive). Swipe from the edge to see the system bars. The
  game area is padded away from camera cutouts.
- **Volume buttons** control the game's sound.
- If Android kills the WebView's renderer to free memory, the app rebuilds the screen
  instead of crashing. Progress is saved, so nothing is lost.

## Saved data

Progress, stars, trophies and settings are saved in the WebView's `localStorage`:

- kept when the app is **updated**
- removed when the app is **uninstalled** or you use **Settings → Apps → Michy's Pet Snake → Storage → Clear data**
- **not** shared with the browser version of the game (they are different origins)
- `android:allowBackup="true"`, so Android's normal app backup can include it

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Sync says **"Plugin com.android.application version 9.4.0 not found"** | Your Android Studio is older than AGP 9.4. Update Android Studio, or open **Tools → AGP Upgrade Assistant** and let it pick the newest version your Studio supports. |
| **"Dependency ... requires compileSdk X"** | Install that SDK platform (Studio offers a link) and set `compileSdk = X` in `android/app/build.gradle.kts`. |
| **"SDK Platform 37 not installed"** | Click the install link, or open **Tools → SDK Manager** and tick Android API 37. |
| **"Gradle requires JVM 17 or later"** | **Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK**: choose the bundled JetBrains Runtime (17 or newer). |
| Error mentioning **`org.jetbrains.kotlin.android`** | Do not add that plugin: AGP 9 has Kotlin built in. |
| The app opens to a **blank screen or `net::ERR_CACHE_MISS`** | This should not happen, because the files are served from inside the app. If your device shows it anyway, add `<uses-permission android:name="android.permission.INTERNET" />` above `<application>` in `AndroidManifest.xml`. The game still never contacts the internet. |
| Blank screen, anything else | With the phone connected, open `chrome://inspect` in desktop Chrome. Debug builds allow WebView inspection, so you can see the game's console errors. |
| No sound | Sound only starts after your first tap (an Android and browser rule). Check the in-game Settings and your media volume. |
