# Building ReGrind

Pick your platform, then a method within it. Everything below the platform sections applies to both.

- [Building ReGrind](#building-regrind)
    - [Android](#android)
        - [Build apk with Nix in Docker (easiest)](#build-apk-with-nix-in-docker-easiest)
        - [Build apk with Nix only (faster)](#build-apk-with-nix-only-faster)
        - [Build apk manually (advanced)](#build-apk-manually-advanced)
        - [Sign Android build](#sign-android-build)
        - [Verify Android release](#verify-android-release)
        - [Publish to Google Play](#publish-to-google-play)
    - [iOS (macOS only)](#ios-macos-only)
        - [iOS build configuration](#ios-build-configuration)
        - [Build the app](#build-the-app)
        - [Deploy to a connected iPhone](#deploy-to-a-connected-iphone)
        - [Develop on device / simulator](#develop-on-device--simulator)
        - [Distributing via SideStore](#distributing-via-sidestore)
    - [Linux](#linux)
        - [Build Linux deb, AppImage (Docker/Podman)](#build-linux-deb-appimage-dockerpodman)
        - [Sign Linux build](#sign-linux-build)
        - [Verify Linux release](#verify-linux-release)
    - [Windows](#windows)
        - [Build Windows installer](#build-windows-installer)
        - [Sign Windows build](#sign-windows-build)
        - [Verify Windows release](#verify-windows-release)
    - [macOS](#macos)
        - [Build macOS app](#build-macos-app)
        - [Build for the App Store](#build-for-the-app-store)
        - [Sign and notarize macOS build](#sign-and-notarize-macos-build)
        - [Verify macOS release](#verify-macos-release)
    - [Credential storage](#credential-storage)
    - [Reproducibility](#reproducibility)
    - [Verify minisign signature](#verify-minisign-signature)

## Android

### Build apk with Nix in Docker (easiest)

This method does not require installing Nix to your machine, but requires more disk space. It essentially automates [native Nix build method](#build-apk-with-nix-only-faster) for you with zero setup needed.

> [!IMPORTANT]
> **The image is pinned to `linux/amd64`.** The Android NDK ships only an x86_64 host cross-compiler — also the canonical reproducible target — so the build always runs in an `x86_64-linux` environment.
>
> **Apple Silicon:** the build runs under Docker Desktop's amd64 emulation and takes about 3-4 hours on an M1 Pro. The 4-ABI build OOMs at Docker Desktop's default ~8 GB, so raise the memory limit to **at least 12 GB** (Settings &rarr; Resources &rarr; Memory). To check your Mac first, build one ABI with `-e OPEN_GRIND_ANDROID_ABI=aarch64`.

Prerequisites:

- [Docker](https://docs.docker.com/get-started/get-docker/) with Compose installed
- ~30 GB of free disk space (the ~12 GB toolchain plus build caches; the first run needs ~15 GB transient)
- \>= 12 GB of RAM allocated to Docker

1. Install Docker on your host system
2. Build the thin image: `docker compose build`
3. Build the apk: `docker compose run --rm build`
4. Retrieve `regrind-v<version>-android[-<abi>]-unsigned.apk` from `src-tauri/gen/android/app/build/outputs/apk/*/release/` on your host system
5. Follow [Sign Android build](#sign-android-build) steps to make the build installable on your Android device

To clean-up Docker after that:

```bash
docker compose down -v   # removes the toolchain + all cache volumes (~25 GB)
docker image rm regrind-build   # removes the thin image
```

### Build apk with Nix only (faster)

Open Grind ships a [Nix flake](./flake.nix) that pins the entire Android toolchain — Rust, the JDK, the Android SDK, the NDK, Gradle, Bun, and Node.js — so a native build on x86_64 Linux reproduces the release. On Apple Silicon, only the [Docker build](#build-apk-with-nix-in-docker-easiest) does.

- [Nix](https://nixos.org/download) >= 2.18
- ~30 GB of disk space

1. Install and configure Nix on your host system
2. Run `nix run .#build-android`
3. Retrieve `regrind-v<version>-android[-<abi>]-unsigned.apk` from `src-tauri/gen/android/app/build/outputs/apk/*/release/` on your host system

> [!NOTE]
> First time you run `nix develop` or `nix run` in Open Grind's repository, Nix will download and setup about 3 GB environment, which might take some time, depending on your internet connection speed.

> [!NOTE]
> If you use [direnv](https://direnv.net/), the bundled [.envrc](./.envrc) activates the dev shell automatically when you `cd` into the repository. `nix run .#build-*` started from a dev shell drops its environment and keeps only `HOME`, `USER`, `LOGNAME`, `TERM`, locale, proxy and CA certificate variables, `CARGO_HOME`, `XWIN_CACHE_DIR`, `NODE_OPTIONS`, `OPEN_GRIND_*`, `MACOS_*` and the `PATH` entries outside the Nix store.

### Build apk manually (advanced)

If you already have an Android toolchain (e.g. via Android Studio) and Rust installed, you can build against those directly. This reuses what is already on your machine instead of downloading the pinned ~12 GB toolchain, so it saves a lot of disk, but the artifact is not reproducible.

Prerequisites:

- **Rust** via [rustup](https://rustup.rs) — [rust-toolchain.toml](./rust-toolchain.toml) pins 1.95.0 and lists the Android targets, which rustup installs automatically the first time you build in the repo
- **JDK 21** (e.g. [Temurin](https://adoptium.net), or Android Studio's bundled JDK) — 17+ will likely build but won't match a release
- **Android SDK** via Android Studio's SDK Manager (or the command-line `sdkmanager`): SDK Platform 36, Build-Tools 35.0.0, NDK 29.0.14206865, CMake 3.22.1
- **[Bun](https://bun.sh)**

1. Point Tauri at your SDK / NDK / JDK:

```bash
export JAVA_HOME="$(/usr/libexec/java_home -v 21)" # or your JDK 21 path
export ANDROID_HOME="$HOME/Android/sdk" # or your Android SDK path
export NDK_HOME="$ANDROID_HOME/ndk/29.0.14206865"
```

2. Build:

```bash
bun install
bun run tauri android build --apk
```

3. Retrieve the apk from `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk` on your host system
4. Follow [Sign Android build](#sign-android-build) to make the build installable on your Android device

### Sign Android build

You need to follow these instructions in order to install the APK on an Android device, otherwise attempts to install it will throw "App not installed as package appears to be invalid." error. Not required for reproducibility verification. Never commit or otherwise publish anything about your keystore.

1. Create a JKS once:

```bash
keytool -genkey -v \
  -keystore ~/.config/regrind/release.jks \
  -alias regrind \
  -keyalg EC \
  -groupname secp256r1 \
  -sigalg SHA256withECDSA \
  -validity 20000
```

2. Create keystore.properties:

```bash
cp /path/to/regrind/contrib/keystore.properties.example ~/.config/regrind/keystore.properties
# Edit ~/.config/regrind/keystore.properties, note the password
```

3. Sign the apk:

```bash
OPEN_GRIND_KEYSTORE_PROPERTIES=~/.config/regrind/keystore.properties \
  bun /path/to/regrind/ci/sign.ts /path/to/regrind.apk /out/path/to/regrind-signed.apk
```

When `keystore.properties` is copied into `src-tauri/gen/android` before the
build, gradle signs the release itself. Then only the minisign step is left, and
`sign.ts` runs it alone with no keystore in the environment:

```bash
bun /path/to/regrind/ci/sign.ts /path/to/regrind-v<version>-android.apk
```

A release must carry that `.minisig` beside the APK, or the in-app updater
refuses it. `bun scripts/minisign.ts keygen` creates the release key once, at
`~/.config/regrind/minisign.key`; its public half belongs in [KEYS.md](./KEYS.md).

### Verify Android release

- [Verify minisign signature](#verify-minisign-signature) to prove the APK was built by Open Grind developers
- [Reproduce the release](./REPRODUCIBILITY.md#android) to prove the APK was built from the open source code

### Verify Google Play install

Google signs the APKs it delivers with its own key, so their signature says nothing about who built the code. The code transparency file inside them does: it lists the hash of every DEX file and native library, signed with a key only Open Grind developers hold.

1. Connect the device with the app installed from Google Play and check it with [bundletool](https://github.com/google/bundletool/releases):

```bash
bundletool check-transparency --mode=connected_device --package-name=org.regrind
```

2. Compare the printed fingerprint of the code transparency key certificate with the one in [KEYS.md](./KEYS.md#platforms-signing).

Code transparency covers code only. Resources, assets and the manifest are not part of it.

### Publish to Google Play

The Play bundle removes the in-app updater, so it is built separately from the APK. Every release runs `play.yml`, which builds the bundle on several providers and publishes the verified `regrind-unsigned-play` artifact.

1. Download the artifact from the `play` workflow run.

2. Add [code transparency](https://developer.android.com/guide/app-bundle/code-transparency) and sign it with the Play upload key. Each properties file has the same fields as [contrib/keystore.properties.example](./contrib/keystore.properties.example) and points at its own RSA keystore; the code transparency key needs at least 3072 bits. Signing fails unless the code transparency key is the one [KEYS.md](./KEYS.md) publishes:

```bash
OPEN_GRIND_PLAY_KEYSTORE_PROPERTIES=~/.config/regrind/play-upload.properties \
OPEN_GRIND_PLAY_TRANSPARENCY_KEYSTORE_PROPERTIES=~/.config/regrind/play-transparency.properties \
  nix develop .#play --command bun ci/sign.ts /path/to/regrind-v<version>-android-unsigned.aab
```

3. Upload the bundle, its release notes and the store listing to the internal track from a checkout of the release tag, so the listing matches the bundle. Use `SUPPLY_RELEASE_STATUS=draft` until the app's first release leaves draft in the Play Console. fastlane cancels a review that is already running, so wait for it to finish first.

```bash
SUPPLY_JSON_KEY=~/.config/regrind/play-service-account.json \
  nix develop .#play --command ci/play-upload.sh /path/to/regrind-v<version>-android.aab
```

## iOS (macOS only)

iOS builds are **not** reproducible or governance-signed the way the Android
release is — they are for local development and testing on your own device.
Building for iOS requires a Mac with Xcode and an Apple Developer account
(a free personal team is enough for on-device debug installs).

Prerequisites:

- **macOS** with **Xcode** (full install, not just the Command Line Tools) and its iOS platform
- **Rust** via [rustup](https://rustup.rs) with the iOS targets:
    ```bash
    rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
    ```
- **[CocoaPods](https://cocoapods.org)** (`brew install cocoapods`) — Tauri uses it to link plugin pods
- **[Bun](https://bun.sh)** and `bun install`
- An **Apple Developer team**; the device you install onto must be registered with that team

### iOS build configuration

Everything needed to reproduce an iOS build is committed:

| Setting                   | Value                      | Where it's pinned                                                                 |
| ------------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| Apple development team    | `APPLE_DEVELOPMENT_TEAM`   | your environment, see below (config holds a placeholder)                          |
| Bundle identifier         | `org.regrind.ios`          | `src-tauri/tauri.ios.conf.json` &rarr; `identifier` (and `gen/apple/project.yml`) |
| Marketing / build version | from `version`             | `src-tauri/tauri.conf.json` &rarr; `version`                                      |
| iOS usage descriptions    | location permission string | `src-tauri/Info.ios.plist`                                                        |
| Export method             | `debugging`                | `src-tauri/gen/apple/ExportOptions.plist`                                         |
| Xcode project             | committed                  | `src-tauri/gen/apple/` (regenerate with `bun tauri ios init`)                     |

The team ID is **not** committed. `bundle.iOS.developmentTeam` in
[`src-tauri/tauri.conf.json`](./src-tauri/tauri.conf.json) holds the placeholder
`YOUR_TEAM_ID`, and the Xcode project reads `$(APPLE_DEVELOPMENT_TEAM)` from the
environment. Export your own team ID before building (Xcode &rarr; Settings &rarr;
Accounts, or `Membership` on the developer portal):

```bash
export APPLE_DEVELOPMENT_TEAM=XXXXXXXXXX
```

Tauri uses that variable in preference to the value in the config, so the
placeholder is never used for a real build. To keep it out of your shell profile,
put the line in `.envrc.local`, which is git-ignored and sourced by `.envrc` if
direnv is set up.

You'll also want an `identifier` in the config that is unique to you. The
`debugging` export method in
`ExportOptions.plist` produces a development-signed IPA installable on registered
devices; switch it to `app-store-connect`, `release-testing`, or `enterprise` for
other distribution channels.

### Build the app

```bash
bun install
bun run tauri ios build
```

This runs the frontend build (`bun run build`) and produces a development-signed
IPA at:

```
src-tauri/gen/apple/build/arm64/ReGrind.ipa
```

Add `--debug` for a debug build, or `--open` to open the project in Xcode instead
of building headless.

### Deploy to a connected iPhone

With the iPhone plugged in (and trusted / registered with the development team),
install the freshly built IPA using Apple's device tooling:

```bash
# Confirm the device is visible and paired
xcrun devicectl list devices

# Install the IPA (grab the identifier from the command above)
xcrun devicectl device install app \
  --device <DEVICE_IDENTIFIER> \
  "src-tauri/gen/apple/build/arm64/ReGrind.ipa"
```

The app then launches from the Home Screen. The first launch of a build signed
with a free personal team also needs a one-time trust step on the phone:
Settings &rarr; General &rarr; VPN & Device Management &rarr; trust your developer certificate.

### Develop on device / simulator

For an iterative dev loop with hot reload instead of a standalone install:

```bash
bun dev:ios                          # pick a target when prompted
bun run tauri ios dev --open         # or drive it from Xcode
```

`dev:ios` mirrors `dev:desktop`, enabling the `devtools` feature so the web
inspector is available. Frontend edits hot-reload; only Rust changes need a
rebuild.

Prefer a **simulator** target unless the thing you are testing is the hardware —
haptics, real gestures, geolocation, camera, performance. A simulator needs no
signing, so it sidesteps the free-tier certificate and its seven-day expiry
entirely. Only a device target reads `APPLE_DEVELOPMENT_TEAM`.

### Distributing via SideStore

There is no free way to put an iOS app in front of other people the way the
Android APK does it. TestFlight, the App Store, and the EU alternative
marketplaces (AltStore PAL, Epic, Aptoide) all require a paid Apple Developer
Program membership plus Apple notarization. ReGrind is instead distributed
for iOS as an **unsigned** IPA that users sideload and re-sign with **their own**
free Apple ID, using [SideStore](https://sidestore.io).

This works because the app needs no restricted capabilities:
[`regrind_iOS.entitlements`](./src-tauri/gen/apple/regrind_iOS/regrind_iOS.entitlements)
is empty, and location and photo-library access are Info.plist usage strings
rather than entitlements. `tauri-plugin-notification` uses local notifications
only, so no `aps-environment` entitlement is required — a free personal team
cannot issue one.

The free-team limits apply to whoever installs it, not to whoever builds it:
three sideloaded apps at a time and a seven-day signing certificate. SideStore
refreshes on-device so the seven-day cycle is invisible after setup; AltStore
needs a computer on the same network to refresh.

Sideloading clients re-sign the IPA under the installing user's team and append
that team ID to the bundle identifier, so `org.regrind.ios` does not collide
between users.

#### Why the release IPA is unsigned

`tauri ios build` can only emit a signed IPA, and that signature is not inert
metadata — it is a disclosure. `embedded.mobileprovision` holds the team ID and
the UDID of **every device registered to that team**, and the code signature's
entitlements blob, baked into the Mach-O itself, repeats the team ID and carries
`get-task-allow: true`, marking the binary debuggable. Deleting
`_CodeSignature/` clears none of that.

Sideloading clients discard the signature and re-sign under the installing
user's own team, so publishing the signed build leaks a device list to buy
nothing. `scripts/ios-release-ipa.sh` therefore runs
`codesign --remove-signature` over the app and every nested bundle, drops the
profile, and asserts the result reports `not signed at all` before packing it.

#### Publishing a release

CI cannot do this: every runner in [`.forgejo/workflows`](./.forgejo/workflows)
is Linux, and an iOS build needs macOS with Xcode. It is a local release step.

```bash
scripts/ios-release-ipa.sh
```

That builds, strips the signature, writes
`src-tauri/gen/apple/build/arm64/regrind-v<version>.ipa`, and regenerates the
source manifest against that exact file. Then attach the IPA to the
`v<version>` release on
[the fork's releases](https://github.com/codexrunnerregrind/regrind/releases)
and commit `ci/altstore/source.json`.

Pass `--skip-build` to repack an existing build, or `--date YYYY-MM-DD` to pin
the manifest date. The script refuses to run if
[`ci/check-release-version.sh`](./ci/check-release-version.sh) finds the versions
out of sync, or if the built bundle identifier does not match `identifier` in
`tauri.conf.json`. Sideloading clients key updates off the bundle ID, so
releasing a build whose identifier was patched locally would publish an app the
manifest can never update.

Note that the bundle ID is the app's identity on iOS: installing the release
build next to a locally-built one with a different identifier gives two icons,
two data containers, and — since
[`regrind_iOS.entitlements`](./src-tauri/gen/apple/regrind_iOS/regrind_iOS.entitlements)
declares no keychain access group — two separate credential stores, so the
second app starts logged out.

[`ci/altstore/source.ts`](./ci/altstore/source.ts) reads the version and bundle
identifier from `tauri.conf.json`, reuses the store listing in
[`fastlane/metadata`](./fastlane/metadata) that F-Droid already uses, and hashes
the IPA so `size` and `sha256` match the published artifact byte-for-byte. It
writes `ci/altstore/source.json`. The URLs point at this fork, since upstream
publishes no IPA; set `OPEN_GRIND_REPO` to another GitHub `owner/repo` to retarget.

#### Why the release IPA advertises `0.1.0.5`

`version` in the manifest has to equal the bundle's
`CFBundleShortVersionString`, or SideStore refuses the install with
VerificationError 4. Tauri drops the prerelease suffix when it derives that
string, so every beta of `0.1.0` would ship as plain `0.1.0` — and SideStore's
`InstalledApp.hasUpdate` compares `version` alone, parsed as semver, reading
`buildVersion` only when that parse fails. Two betas that both say `0.1.0` are
therefore indistinguishable and no update is ever offered.

So `scripts/ios-release-ipa.sh` copies `CFBundleVersion` over the short version
in the unsigned payload before packing: the release IPA declares `0.1.0.5`, four
components, which cannot parse as semver — so SideStore falls back to comparing
`version` _and_ `buildVersion`, the rule AltStore's own documentation states.
Editing `Info.plist` would invalidate a signature; it is safe here only because
the same script strips the signature immediately afterwards. Nothing else reads
the rewritten value: device builds keep whatever Tauri generated.

#### Installing from the source

Users add the raw URL of that JSON as a source in SideStore:

```
https://raw.githubusercontent.com/codexrunnerregrind/regrind/main/ci/altstore/source.json
```

SideStore itself needs a one-time setup: an iOS device **with a passcode set**,
on Wi-Fi rather than cellular, plus a computer to run
[iloader](https://docs.sidestore.io/docs/installation/prerequisites) once to
generate the pairing file. Refreshes then happen on-device, but only while a
loopback VPN is active — `LocalDevVPN` is the current recommendation; `StosVPN`
still works if already installed, but Apple pulled it from the App Store.

The same AltStore-format manifest is also read by AltStore, Feather, and
TrollApps — so one file covers every sideloading client. TrollStore itself only
works on iOS 14.0&ndash;17.0, whose CoreTrust bug Apple has since patched; treat
it as a footnote rather than a supported channel.

## Linux

- `.rpm` — tauri-bundler passes the version through unsanitised and RPM's `Version` cannot contain `-`, so every prerelease is rejected; there is no `rpm.version` override

### Build Linux deb, AppImage (Docker/Podman)

Built in a pinned Debian 12 container ([ci/linux/](./ci/linux)), linked against Debian 12's system libraries. The glibc floor is 2.34, (Debian 12+, Ubuntu 22.04+).

```bash
podman build -t regrind-linux ci/linux
podman run --rm -v "$PWD:/work" regrind-linux sh ci/linux/build.sh
```

`bun run package:linux` runs both. Docker takes the same two commands with `docker` in place of `podman`.

The result is `src-tauri/target/release/bundle/deb/regrind-v<version>-linux-<arch>.deb` and `src-tauri/target/release/bundle/appimage/regrind-v<version>-linux-<arch>.AppImage`. Each run empties both directories first, so they only ever hold the latest build.

The script repacks what `tauri build` generated with `dpkg-deb` under `SOURCE_DATE_EPOCH`, because tauri-bundler writes clock mtimes and unsorted entries ([tauri#13612](https://github.com/tauri-apps/tauri/issues/13612)).

AppImage is generated from `.deb`. The script writes the AppDir, runs `mksquashfs` under `SOURCE_DATE_EPOCH` and prepends the runtime pinned by `APPIMAGE_RUNTIME_TAG` in [ci/linux/Dockerfile](./ci/linux/Dockerfile).

- Don't use Nix shell for releases, its glibc is newer than any shipping distribution.
- Don't use `tauri build --bundles appimage`, it runs linuxdeploy, which downloads tooling at build time and over-bundles until the result fails to start against Mesa 25+ ([tauri#15665](https://github.com/tauri-apps/tauri/issues/15665)).

### Sign Linux build

Linux builds ship unsigned.

### Verify Linux release

- [Verify minisign signature](#verify-minisign-signature) to prove the .deb and .AppImage were built by Open Grind developers
- [Reproduce the release](./REPRODUCIBILITY.md#linux) to prove they were built from the open source code

## Windows

Windows is cross-compiled from Linux with [cargo-xwin](https://github.com/rust-cross/cargo-xwin). Two clean Linux builds of one commit write a reproducible exe and NSIS installer.

### Build Windows installer

Nix runs the full `tauri build --bundles nsis`. On first use cargo-xwin downloads Microsoft's CRT and Windows SDK (about 1 GB) into `~/.cache/cargo-xwin`.

```bash
# x86_64:
nix run .#build-windows-x64

# arm64:
nix run .#build-windows-arm64
```

The result is `src-tauri/target/<triple>/release/bundle/nsis/*-setup.exe`. Releases carry the published name instead, because [ci/windows/build.sh](./ci/windows/build.sh) renames it to `open-grind-v<version>-windows-<arch>.exe`.

To type-check the Rust library without bundling an installer:

```bash
nix develop .#windows-x64
cargo xwin check --manifest-path src-tauri/Cargo.toml --lib --target x86_64-pc-windows-msvc
```

### Sign Windows build

Windows builds ship unsigned.

### Verify Windows release

- [Verify minisign signature](#verify-minisign-signature) to prove the .exe was built by Open Grind developers
- [Reproduce the release](./REPRODUCIBILITY.md#windows) to prove the .exe was built from the open source code

## macOS

A macOS build needs a Mac. Nix pins the toolchain and remaps the build paths the compilers would otherwise bake into the binary, so the release build runs through the flake.

### Build macOS app

```bash
nix run .#build-macos
```

This builds a universal app, signs it ad-hoc unless `MACOS_SIGN_IDENTITY` is set, and writes the release zip to `src-tauri/target/release/artifacts/`. The ad-hoc zip [reproduces](./REPRODUCIBILITY.md#macos) byte for byte. The build always enables the `keychain` feature, ad-hoc builds therefore cannot read back credentials an earlier build wrote. A release build refuses to run from anywhere but `/Applications` or `~/Applications`. Debug builds do not reproduce; the release profile is the default, `nix run .#build-macos -- --debug` to opt out.

### Build for the App Store

```bash
nix run .#build-macos -- --app-store
```

The default build uses two private macOS APIs: WebKit's `_setUseSystemAppearance:` for `-apple-visual-effect`, and `drawsBackground`.

### Sign and notarize macOS build

| Variable              | Default | Description                                                                     |
| --------------------- | ------- | ------------------------------------------------------------------------------- |
| `MACOS_SIGN_IDENTITY` | `-`     | `-` is ad-hoc                                                                   |
| `MACOS_NOTARY_KEY_ID` | unset   | App Store Connect API key ID; with `MACOS_NOTARY_ISSUER`, notarizes and staples |
| `MACOS_NOTARY_ISSUER` | unset   | App Store Connect API key issuer ID                                             |

Ad-hoc builds are signed by the pinned `rcodesign`. Developer ID builds are signed by macOS `codesign` and notarized by the Command Line Tools' `notarytool` with the key at `~/.appstoreconnect/private_keys/AuthKey_<key ID>.p8`. A Developer ID build also writes the ad-hoc zip to `src-tauri/target/release/ad-hoc/` and fails unless the shipped app, re-signed ad-hoc, matches it byte for byte.

```bash
MACOS_SIGN_IDENTITY="Developer ID Application: Name (TEAMID)" \
MACOS_NOTARY_KEY_ID=KEYID \
MACOS_NOTARY_ISSUER=issuer-uuid \
  nix run .#build-macos
```

### Verify macOS release

- [Verify minisign signature](#verify-minisign-signature) to prove the .zip was built by Open Grind developers
- [Reproduce the release](./REPRODUCIBILITY.md#macos) to prove the .app was built from the open source code
- Run `spctl -a -vv "/Applications/Open Grind.app"` to see that Apple notarized it: `source=Notarized Developer ID`

## Credential storage

Open Grind keeps the session, device identity, and media signing key in the platform's own credential store: Keychain on iOS, Keystore on Android, Credential Manager on Windows, and the Secret Service (GNOME Keyring, KWallet, etc) over D-Bus on Linux.

Two targets fall back to a file store: `credentials/` in the app data directory, each file `0600` inside a `0700` directory.

- macOS, by default. Keychain entries are tied to the code-signing identity, so an unsigned build cannot read back what an earlier build wrote, which breaks local development ([`ac38b2c`](https://git.opengrind.org/open-grind/open-grind/commit/ac38b2c)).
- Linux, only when no Secret Service is reachable, such as a headless box with no D-Bus session bus.

> [!IMPORTANT]
> A macOS build that is distributed must be code-signed and built with the `keychain` feature, which swaps the file store for the Keychain. [`nix run .#build-macos`](#build-macos-app) does both.

## Reproducibility

What is pinned, which builds reproduce, and how CI proves it: [REPRODUCIBILITY.md](./REPRODUCIBILITY.md).

## Verify minisign signature

Published artifacts are signed with [minisign](https://jedisct1.github.io/minisign/) signature. You can confirm the key and its provenance in [KEYS.md](./KEYS.md).

Without the minisign binary, `bun scripts/minisign.ts verify /path/to/file` checks the same signature against the key published in KEYS.md.

[Install minisign](https://github.com/jedisct1/minisign#installation), then check the .minisig signature of downloaded artifact at `/path/to/file`:

```bash
PUBLISHED=/path/to/file

if minisign -Vm "$PUBLISHED" -P RWRVQTYl8FTUIBqdh0prTdptQKwYDu5Wfvt9FSqq6YJ+948MiiRsIv6u; then
  echo "✓ signature valid and verified"
else
  echo "✗ signature invalid, do not install this" >&2
  exit 1
fi
```
