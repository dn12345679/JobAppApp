package com.dylan.jobtracker

import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.view.WindowCompat

// Overrides the generated MainActivity (copied into gen/android by the release
// workflow after `tauri android init`, since gen/android is regenerated each
// build). Native reinforcements for the web-layer fixes:
//   1. Edge-to-edge layout so the WebView draws behind the system bars and CSS
//      env(safe-area-inset-*) reports real values (the app pads around them).
//   2. WebView zoom disabled, backing up the viewport's user-scalable=no so
//      only the in-app Zoom control scales the UI.
//   3. A `AndroidPrint.print()` JS bridge that drives Android's PrintManager
//      (which offers "Save as PDF"). Android's WebView ignores window.print(),
//      so the résumé/cover "Export to PDF" calls this instead (see
//      src/lib/exportPdf.ts). It renders the current page with @media print
//      styles applied, so only the sheet is printed — same as desktop.
// super.onWebViewCreate(...) is called first so wry's own WebView setup is kept.
class MainActivity : TauriActivity() {
    private var webViewRef: WebView? = null

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        webViewRef = webView
        WindowCompat.setDecorFitsSystemWindows(window, false)
        webView.settings.setSupportZoom(false)
        webView.settings.builtInZoomControls = false
        webView.settings.displayZoomControls = false
        webView.addJavascriptInterface(PrintBridge(), "AndroidPrint")
    }

    inner class PrintBridge {
        @JavascriptInterface
        fun print() {
            runOnUiThread {
                val wv = webViewRef ?: return@runOnUiThread
                val printManager = getSystemService(Context.PRINT_SERVICE) as PrintManager
                val adapter = wv.createPrintDocumentAdapter("JobTracker")
                printManager.print(
                    "JobTracker",
                    adapter,
                    PrintAttributes.Builder().build(),
                )
            }
        }
    }
}
