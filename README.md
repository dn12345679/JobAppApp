# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Install on Android (with auto-update)

Android has no silent auto-update for sideloaded apps, so updates run through
[**Obtainium**](https://github.com/ImranR98/Obtainium) — a free app that watches
this repo's GitHub Releases and prompts you to install each new version.

1. Install Obtainium (from its GitHub Releases, or F-Droid).
2. In Obtainium: **Add App** → paste this repo's URL
   (`https://github.com/dn12345679/JobAppApp`).
3. It finds the `JobTracker-vX.Y.Z.apk` attached to the latest release and installs
   it. Grant "Install unknown apps" when prompted (first time only).
4. On every future release, Obtainium notifies you and installs the update in one
   tap. (Desktop installs still auto-update on their own — Android is Obtainium-only.)

**First install** may warn about an unknown developer — that's expected for a
self-signed app; the signature stays consistent across updates.

### Releasing the Android build

The `.github/workflows/release.yml` **android** job builds a signed universal APK
on every `v*` tag and attaches it to the release. It needs these repo secrets:
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD` (see the comment block in the workflow for how to generate
the keystore). **Back up the keystore** — losing it breaks updates for every
existing install (signature mismatch).
