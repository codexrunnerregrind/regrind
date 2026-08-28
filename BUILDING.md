# Building Open Grind

Pick your platform, then a method within it. Everything below the platform sections applies to both.

> [!NOTE]
> Android, macOS, Linux, Windows release builds are supported as of August 2026.

- [Building Open Grind](#building-open-grind)
    - [Android](#android)
        - [Build with Docker (easiest)](#build-with-docker-easiest)
            - [Clean-up Docker](#clean-up-docker)
        - [Build with Nix (builds everywhere)](#build-with-nix-builds-everywhere)
        - [Build manually (advanced)](#build-manually-advanced)
        - [Signing](#signing)
            - [Sign \& build with Docker](#sign--build-with-docker)
            - [Sign \& build with Nix](#sign--build-with-nix)
            - [Sign \& build manually](#sign--build-manually)
        - [Verifying a published Android release](#verifying-a-published-android-release)
    - [iOS (macOS only)](#ios-macos-only)
        - [iOS build configuration](#ios-build-configuration)
        - [Build the app](#build-the-app)
        - [Deploy to a connected iPhone](#deploy-to-a-connected-iphone)
        - [Develop on device / simulator](#develop-on-device--simulator)
        - [Distributing via SideStore](#distributing-via-sidestore)
    - [macOS](#macos)
        - [Signing and notarization](#signing-and-notarization)
        - [Verifying a published macOS release](#verifying-a-published-macos-release)
    - [Linux](#linux)
        - [Build the release .deb](#build-the-release-deb)
        - [Develop with Nix](#develop-with-nix)
        - [Verifying a published Linux release](#verifying-a-published-linux-release)
        - [Rejected Linux formats](#rejected-linux-formats)
    - [Windows](#windows)
        - [Verifying a published Windows release](#verifying-a-published-windows-release)
        - [Signing Windows builds](#signing-windows-builds)
    - [Credential storage](#credential-storage)
    - [Reproducibility](#reproducibility)

## Android

### Build with Docker (easiest)

This method does not require installing Nix to your machine, but requires more disk space. It essentially automates [native Nix build method](#build-with-nix-builds-everywhere) for you with zero setup needed.

> [!IMPORTANT]
> **The image is pinned to `linux/amd64`.** The Android NDK ships only an x86_64 host cross-compiler — also the canonical reproducible target — so the build always runs in an `x86_64-linux` environment. On a native x86_64 Linux host that runs directly; on Apple Silicon (arm64) macOS it runs under Docker Desktop's amd64 emulation (Rosetta or QEMU).
>
> **Apple Silicon works — the only caveat is memory.** Because the container evaluates as `x86_64-linux`, [flake.nix](./flake.nix) takes its i686-stripped `androidenv` path, so the toolchain realizes cleanly and the old `personality(PER_LINUX32)` failure no longer applies. The one requirement is RAM: the universal (4-ABI) release build OOMs at Docker Desktop's default ~8 GB, so raise the memory limit to **at least 12 GB** (Settings &rarr; Resources &rarr; Memory) before building. To sanity-check on less RAM, build a single ABI with `-e OPEN_GRIND_ANDROID_ABI=aarch64` — but that is not the universal release artifact. Since the container runs as `x86_64-linux`, an Apple Silicon Docker build reproduces the canonical release; a native `nix run .#build-android` on `aarch64-darwin` does **not** (different host toolchain).

Prerequisites:

- [Docker](https://docs.docker.com/get-started/get-docker/) with Compose installed
- ~30 GB of free disk space (the ~12 GB toolchain plus build caches; the first run needs ~15 GB transient)
- On Apple Silicon: **>=12 GB of memory** allocated to Docker Desktop (the universal build OOMs at the ~8 GB default)

1. Install Docker on your host system and make sure to give it enough disk headroom (Settings &rarr; Resources &rarr; Disk): the toolchain is ~12 GB and its first realization needs ~15 GB of transient space.
2. Build the thin image: `docker compose build`
3. Build the apk: `docker compose run --rm build`
4. Retrieve the apk from `src-tauri/gen/android/app/build/outputs/apk/universal/release/open-grind-v<version>-android-unsigned.apk` on your host system
5. Follow [Signing](#signing) steps to make the build installable on your Android device

#### Clean-up Docker

```bash
docker compose down -v   # removes the toolchain + all cache volumes (~25 GB)
docker image rm open-grind-build   # removes the thin image
```

### Build with Nix (builds everywhere)

Open Grind ships a [Nix flake](./flake.nix) that pins the entire Android toolchain — Rust, the JDK, the Android SDK, the NDK, Gradle, Bun, and Node.js — so any contributor on Linux or macOS can produce an identical build in an identical environment.

- [Nix](https://nixos.org/download) >= 2.18
- ~30 GB of disk space

1. Install and configure Nix on your host system
2. Run `nix run .#build-android`
3. Retrieve the apk: `src-tauri/gen/android/app/build/outputs/apk/universal/release/open-grind-v<version>-android-unsigned.apk` on your host system

> [!NOTE]
> First time you run `nix develop` or `nix run` in Open Grind's repository, Nix will download and setup about 3 GB environment, which might take some time, depending on your internet connection speed.

> [!NOTE]
> If you use [direnv](https://direnv.net/), the bundled [.envrc](./.envrc) activates the dev shell automatically when you `cd` into the repository.

### Build manually (advanced)

If you already have an Android toolchain (e.g. via Android Studio) and Rust installed, you can build against those directly. This reuses what is already on your machine instead of downloading the pinned ~12 GB toolchain, so it saves a lot of disk — at the cost of a build that is **not** guaranteed byte-for-byte identical to a release (your tool versions, paths, and timestamps differ). Use it for developing and testing patches; use Nix when you need to [reproduce a published release](#verifying-a-published-android-release).

Prerequisites (match the pinned versions where you can — see the [Reproducibility](#reproducibility) table):

- **Rust** via [rustup](https://rustup.rs) — [rust-toolchain.toml](./rust-toolchain.toml) pins 1.95.0 and lists the Android targets, which rustup installs automatically the first time you build in the repo
- **JDK 21** (e.g. [Temurin](https://adoptium.net), or Android Studio's bundled JDK) — 17+ will likely build but won't match a release
- **Android SDK** via Android Studio's SDK Manager (or the command-line `sdkmanager`): SDK Platform 36, Build-Tools 35.0.0, NDK 29.0.14206865, CMake 3.22.1
- **[Bun](https://bun.sh)**

1. Point Tauri at your SDK / NDK / JDK (paths shown for macOS; on Linux the SDK is usually `~/Android/Sdk`):

```bash
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"   # or your JDK 21 path
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/29.0.14206865"
```

2. Build:

```bash
bun install
bun run tauri android build --apk
```

3. Retrieve the apk from `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk` on your host system
4. Follow [Signing](#signing) to make the build installable on your Android device

### Signing

You need to follow these instructions in order to install the APK on an Android device, otherwise attempts to install it will throw "App not installed as package appears to be invalid." error.

You don't need to follow these instructions if you're just [verifying release binaries reproducibility](#verifying-a-published-android-release).

Never commit or otherwise publish anything about your keystore.

`keytool` is part of the JDK, so it is already available inside `nix develop` — you do not need to install it.

1. Create a JKS once (from inside `nix develop`):

```bash
keytool -genkey -v \
  -keystore ~/.config/open-grind/release.jks \
  -alias open-grind \
  -keyalg EC \
  -groupname secp256r1 \
  -sigalg SHA256withECDSA \
  -validity 20000
```

2. Copy [contrib/keystore.properties.example](./contrib/keystore.properties.example) to a private location such as `/home/you/.config/open-grind/keystore.properties` and fill it in.

3. Build with keystore passed (see below):

#### Sign & build with Docker

Mount the keystore directory onto the container's home so the `~/` in `storeFile` resolves the same as on your host, then point `OPEN_GRIND_KEYSTORE_PROPERTIES` at the in-container path:

```bash
docker compose run --rm \
  -v ~/.config/open-grind:/root/.config/open-grind:ro \
  -e OPEN_GRIND_KEYSTORE_PROPERTIES=/root/.config/open-grind/keystore.properties \
  build
```

#### Sign & build with Nix

Point `OPEN_GRIND_KEYSTORE_PROPERTIES` at keystore.properties file and run the `nix run .#build-android`:

```bash
OPEN_GRIND_KEYSTORE_PROPERTIES=/home/you/.config/open-grind/keystore.properties \
  nix run .#build-android
```

#### Sign & build manually

`OPEN_GRIND_KEYSTORE_PROPERTIES` is a flake convenience and is ignored by a plain `tauri` build. Gradle reads `keystore.properties` from the Android project root, so place it there yourself (it is gitignored) before building:

```bash
cp ~/.config/open-grind/keystore.properties src-tauri/gen/android/keystore.properties
bun run tauri android build --apk
rm src-tauri/gen/android/keystore.properties   # optional: don't leave the password lying around
```

### Verifying a published Android release

Published artifacts carry a detached [minisign](https://jedisct1.github.io/minisign/) signature. Anyone can also check that the published binary was built from the source in this repository, no key required.

Android's v2/v3 signing block lives in a dedicated region between the last zip entry and the central directory; v1 (JAR) signatures live in `META-INF/*.SF`, `*.{RSA,EC,DSA}`, and modify `MANIFEST.MF`. Everything else — dex, native libs, resources, manifest, assets — is byte-identical between a signed and an unsigned build of the same source on the same toolchain.

All tools below ship with the dev shell — `nix develop` and you're ready.

> [!IMPORTANT]
> The canonical release build reproduces only in an `x86_64-linux` build environment — a native x86_64 Linux host, or the [Docker method](#build-with-docker-easiest) on any machine (that is also how [CI builds](./REPRODUCIBILITY.md#canonical-builders) releases). A native `nix run .#build-android` on Apple Silicon macOS produces a different, non-matching APK.

```bash
nix develop

# 1. Reproduce the unsigned APK locally
git checkout v<tag>
nix run .#build-android
LOCAL=src-tauri/gen/android/app/build/outputs/apk/universal/release/open-grind-v<tag>-android-unsigned.apk

# 2. Fetch the published signed APK and its signature, side by side
#    (https://git.opengrind.org/open-grind/open-grind/releases)
PUBLISHED=/path/to/open-grind-v<tag>-android.apk   # minisign reads "$PUBLISHED.minisig"

# 3. Confirm the release signature
#    Key and its provenance: KEYS.md
if minisign -Vm "$PUBLISHED" -P RWReleaseOpenGrindurRQcmR+NovOaU5IEU3LM5l6TcXJvOGYw2m4O+; then
  echo "✓ signature valid and verified"
else
  echo "✗ signature invalid, do not install this APK" >&2
  exit 1
fi

# 4. Confirm the content reproduces
apk_content_hash() {
  unzip -Z1 "$1" \
    | grep -vE '^META-INF/(MANIFEST\.MF|[^/]+\.(SF|RSA|EC|DSA))$' \
    | while IFS= read -r entry; do
        printf '%s  %s\n' \
          "$(unzip -p "$1" "$entry" | sha256sum | cut -c1-64)" \
          "$entry"
      done
}
if diff <(apk_content_hash "$LOCAL") <(apk_content_hash "$PUBLISHED"); then
  echo "✓ APK hash checksum matches"
else
  echo "✗ APK hash checksum mismatch, local build does not match the published APK" >&2
  exit 1
fi
```

If steps 3 and 4 both succeed, the published APK was built from this commit and signed by Open Grind's governance key.

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

| Setting                   | Value                      | Where it's pinned                                                             |
| ------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| Apple development team    | `APPLE_DEVELOPMENT_TEAM`   | your environment, see below (config holds a placeholder)                      |
| Bundle identifier         | `org.opengrind.app`        | `src-tauri/tauri.conf.json` &rarr; `identifier` (and `gen/apple/project.yml`) |
| Marketing / build version | from `version`             | `src-tauri/tauri.conf.json` &rarr; `version`                                  |
| iOS usage descriptions    | location permission string | `src-tauri/Info.ios.plist`                                                    |
| Export method             | `debugging`                | `src-tauri/gen/apple/ExportOptions.plist`                                     |
| Xcode project             | committed                  | `src-tauri/gen/apple/` (regenerate with `bun tauri ios init`)                 |

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
src-tauri/gen/apple/build/arm64/Open Grind.ipa
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
  "src-tauri/gen/apple/build/arm64/Open Grind.ipa"
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
Program membership plus Apple notarization. Open Grind is instead distributed
for iOS as an **unsigned** IPA that users sideload and re-sign with **their own**
free Apple ID, using [SideStore](https://sidestore.io).

This works because the app needs no restricted capabilities:
[`open-grind_iOS.entitlements`](./src-tauri/gen/apple/open-grind_iOS/open-grind_iOS.entitlements)
is empty, and location and photo-library access are Info.plist usage strings
rather than entitlements. `tauri-plugin-notification` uses local notifications
only, so no `aps-environment` entitlement is required — a free personal team
cannot issue one.

The free-team limits apply to whoever installs it, not to whoever builds it:
three sideloaded apps at a time and a seven-day signing certificate. SideStore
refreshes on-device so the seven-day cycle is invisible after setup; AltStore
needs a computer on the same network to refresh.

Sideloading clients re-sign the IPA under the installing user's team and append
that team ID to the bundle identifier, so `org.opengrind.app` does not collide
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
`src-tauri/gen/apple/build/arm64/open-grind-v<version>.ipa`, and regenerates the
source manifest against that exact file. Then attach the IPA to the
`v<version>` release on
[the fork's releases](https://git.opengrind.org/codexrunner/open-grind/releases)
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
[`open-grind_iOS.entitlements`](./src-tauri/gen/apple/open-grind_iOS/open-grind_iOS.entitlements)
declares no keychain access group — two separate credential stores, so the
second app starts logged out.

[`ci/altstore/source.ts`](./ci/altstore/source.ts) reads the version and bundle
identifier from `tauri.conf.json`, reuses the store listing in
[`fastlane/metadata`](./fastlane/metadata) that F-Droid already uses, and hashes
the IPA so `size` and `sha256` match the published artifact byte-for-byte. It
writes `ci/altstore/source.json`. The URLs point at this fork, since upstream
publishes no IPA; override with `OPEN_GRIND_REPO` to retarget a mirror.

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
https://git.opengrind.org/codexrunner/open-grind/raw/branch/main/ci/altstore/source.json
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

## macOS

A macOS build needs a Mac. Nix still pins most of the toolchain, so build from inside the dev shell.

```bash
nix develop
bun run package:macos
```

This builds the app, signs it, and writes a reproducible zip to `src-tauri/target/release/artifacts/`. The build always enables the `keychain` feature, ad-hoc builds therefore cannot read back credentials an earlier build wrote. A release build refuses to run from anywhere but `/Applications` or `~/Applications`. Debug builds do not reproduce, `package:macos` defaults to `--release`.

### Signing and notarization

| Variable               | Default | Description                                                    |
| ---------------------- | ------- | -------------------------------------------------------------- |
| `MACOS_SIGN_IDENTITY`  | `-`     | `-` is ad-hoc                                                  |
| `MACOS_NOTARY_PROFILE` | unset   | `notarytool` keychain profile; when set, notarizes and staples |

`src-tauri/entitlements.plist` is passed to `codesign` when it exists.

For distribution, store the notary credentials once, then build:

```bash
xcrun notarytool store-credentials open-grind \
  --apple-id you@example.com --team-id TEAMID --password app-specific-password

MACOS_SIGN_IDENTITY="Developer ID Application: Name (TEAMID)" \
MACOS_NOTARY_PROFILE=open-grind \
  bun run package:macos
```

### Verifying a published macOS release

Signing embeds a secure timestamp and stapling adds a notarization ticket, so strip signature from both artifacts:

```bash
nix develop
git checkout v<tag>
bun run package:macos
bun run verify:macos /path/to/open-grind-v<tag>-macos-arm64.zip
```

It exits non-zero and prints the differing files when they do not match.

## Linux

The release `.deb` is built in a pinned Debian 12 container ([ci/linux/](./ci/linux)) so the binary links against Debian 12's system libraries. The glibc floor is 2.34, which covers Debian 12+ and Ubuntu 22.04+. The Nix shell is for development only — its glibc is newer than any shipping distribution.

### Build the release .deb

Needs Podman or Docker.

```bash
podman build -t open-grind-linux ci/linux
podman run --rm -v "$PWD:/work" open-grind-linux sh ci/linux/build.sh
```

The result is `src-tauri/target/release/bundle/deb/open-grind-v<version>-linux-<arch>.deb`. The script repacks what `tauri build` produced with `dpkg-deb` under `SOURCE_DATE_EPOCH`, because tauri-bundler writes wall-clock mtimes and unsorted entries ([tauri#13612](https://github.com/tauri-apps/tauri/issues/13612)).

Runtime notes:

- Video needs GStreamer: `gstreamer1.0-plugins-good` for MP4 and `gstreamer1.0-libav` for H.264, both declared as `Recommends`. Fedora strips patent-encumbered codecs from its own packages.
- Without a Secret Service (a headless box, or no D-Bus session) the login is kept in a plain file under the app data directory and the app says so on launch.
- Location is not available through the geolocation plugin on Linux. Set it from the command palette by geohash.

### Develop with Nix

```bash
nix develop .#linux
bun run tauri dev
```

`nix run .#build-linux` builds a `.deb` too, but against Nix's glibc, so it does not install on a normal distribution. Use the container for anything that leaves your machine.

### Verifying a published Linux release

```bash
git checkout v<tag>
podman build -t open-grind-linux ci/linux
podman run --rm -v "$PWD:/work" open-grind-linux sh ci/linux/build.sh
minisign -Vm /path/to/open-grind-v<tag>-linux-x86_64.deb -P RWReleaseOpenGrindurRQcmR+NovOaU5IEU3LM5l6TcXJvOGYw2m4O+
sha256sum src-tauri/target/release/bundle/deb/*.deb /path/to/open-grind-v<tag>-linux-x86_64.deb
```

Both hashes match. There is no in-file signature to strip: the `.deb` is signed only by its detached `.minisig`.

### Rejected Linux formats

- `.rpm` — tauri-bundler passes the version through unsanitised and RPM's `Version` cannot contain `-`, so every prerelease is rejected; there is no `rpm.version` override
- AppImage — tauri-bundler downloads linuxdeploy and its plugins from unpinned branches at bundle time, and the default bundle breaks on Mesa 25+ ([tauri#15665](https://github.com/tauri-apps/tauri/issues/15665))
- Bundled codecs — The app uses the system WebKitGTK, which decodes through the system GStreamer; shipping codecs would only duplicate what `Recommends` already installs |

## Windows

Windows is cross-compiled from Linux with [cargo-xwin](https://github.com/rust-cross/cargo-xwin). Two clean Linux builds of one commit write a reproducible exe and NSIS installer.

```bash
# x86_64:
nix develop .#windows-x64
cargo xwin check --manifest-path src-tauri/Cargo.toml --lib --target x86_64-pc-windows-msvc

# arm64:
nix develop .#windows-arm64
cargo xwin check --manifest-path src-tauri/Cargo.toml --lib --target arm64-pc-windows-msvc
```

Nix runs the full `tauri build --bundles nsis`. On first use cargo-xwin downloads Microsoft's CRT and Windows SDK (about 1 GB) into `~/.cache/cargo-xwin`.

### Verifying a published Windows release

```bash
git checkout v<tag>

# x86_64:
nix run .#build-windows-x64
minisign -Vm /path/to/open-grind-v<tag>-windows-x86_64.exe -P RWReleaseOpenGrindurRQcmR+NovOaU5IEU3LM5l6TcXJvOGYw2m4O+
sha256sum src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe /path/to/open-grind-v<tag>-windows-x86_64.exe

# arm64:
nix run .#build-windows-arm64
minisign -Vm /path/to/open-grind-v<tag>-windows-arm64.exe -P RWReleaseOpenGrindurRQcmR+NovOaU5IEU3LM5l6TcXJvOGYw2m4O+
sha256sum src-tauri/target/arm64-pc-windows-msvc/release/bundle/nsis/*.exe /path/to/open-grind-v<tag>-windows-arm64.exe
```

Both hashes match. Nothing is embedded in the installer beyond its detached `.minisig`.

### Signing Windows builds

Windows builds ship unsigned with a detached `.minisig`.

## Credential storage

Open Grind keeps the session, device identity, and media signing key in the platform's own credential store: Keychain on iOS, Keystore on Android, Credential Manager on Windows, and the Secret Service (GNOME Keyring, KWallet, etc) over D-Bus on Linux.

Two targets fall back to a file store: `credentials/` in the app data directory, each file `0600` inside a `0700` directory.

- macOS, by default. Keychain entries are tied to the code-signing identity, so an unsigned build cannot read back what an earlier build wrote, which breaks local development ([`ac38b2c`](https://git.opengrind.org/open-grind/open-grind/commit/ac38b2c)).
- Linux, only when no Secret Service is reachable, such as a headless box with no D-Bus session bus.

> [!IMPORTANT]
> A macOS build that is distributed must be code-signed and built with the `keychain` feature, which swaps the file store for the Keychain. [`bun run package:macos`](#build-and-package) does both.

## Reproducibility

What is pinned, which builds reproduce, and how CI proves it: [REPRODUCIBILITY.md](./REPRODUCIBILITY.md).
