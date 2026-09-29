# 404jam — Android app

A [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity/)
wrapping the live site (`https://moahbeatlab.github.io/404jam/`) via Google's
[androidbrowserhelper](https://github.com/GoogleChromeLabs/android-browser-helper)
library. No app logic lives here — this is a thin native shell that points
Chrome's rendering engine at the existing web app, so Web MIDI, localStorage,
and every feature behave exactly as they do in the browser.

## Building

Requires JDK 17 and the Android SDK (`platform-tools`, `platforms;android-34`,
`build-tools;34.0.0`). Set `sdk.dir` in `local.properties` (gitignored) to
your SDK path, then:

```
./gradlew assembleRelease
```

The output APK lands in `app/build/outputs/apk/release/`.

## Signing

Release builds need `keystore.properties` (gitignored, never commit it) —
copy `keystore.properties.example` and fill in the real values. Without it,
`assembleRelease` falls back to Android's built-in debug signing, which is
fine for local sideload testing but **cannot** be used for any real release:
every user who installs an update must get one signed with the *same* key as
the version before it, or the install is rejected as a different app.

The production keystore currently exists in exactly one place (this VPS,
`android/404jam-release.keystore` + `keystore.properties`, both gitignored).
**Back it up somewhere durable** (a password manager, encrypted storage) —
losing it means every future update permanently breaks continuity with
anyone who already installed the app; there is no recovery.

Current release key fingerprint (`keytool -list -v`):
```
SHA256: 26:3C:99:4A:57:D2:2C:C3:13:86:C5:67:95:73:82:19:77:A2:C9:6A:DD:30:C5:E6:04:C9:75:63:2A:BB:62:18
```

## Digital Asset Links (not yet wired up)

Right now the app runs with a visible Chrome URL bar rather than fully
chrome-free, because Android/Chrome only trusts the TWA once
`https://moahbeatlab.github.io/.well-known/assetlinks.json` (the domain
**root**, not `/404jam/`) lists this app's package name and the fingerprint
above. That file can only be served from a repo that owns the domain root
(e.g. a `moahbeatlab.github.io` repo) — a separate decision from this one,
since it claims the org's root domain identity. Once that exists, add:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "io.github.moahbeatlab.jam404",
    "sha256_cert_fingerprints": ["26:3C:99:4A:57:D2:2C:C3:13:86:C5:67:95:73:82:19:77:A2:C9:6A:DD:30:C5:E6:04:C9:75:63:2A:BB:62:18"]
  }
}]
```
