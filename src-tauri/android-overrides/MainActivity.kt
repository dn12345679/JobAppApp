package com.dylan.jobtracker

import android.webkit.WebView
import androidx.core.view.WindowCompat

// Overrides the generated MainActivity (copied into gen/android by the release
// workflow after `tauri android init`, since gen/android is regenerated each
// build). Two native reinforcements for the web-layer fixes in index.html /
// index.css:
//   1. Edge-to-edge layout so the WebView draws behind the system bars and CSS
//      env(safe-area-inset-*) reports real values (the app pads around them).
//   2. WebView zoom disabled, backing up the viewport's user-scalable=no so
//      only the in-app Zoom control scales the UI.
// super.onWebViewCreate(...) is called first so wry's own WebView setup is kept.
class MainActivity : TauriActivity() {
    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        webView.settings.setSupportZoom(false)
        webView.settings.builtInZoomControls = false
        webView.settings.displayZoomControls = false
    }
}
