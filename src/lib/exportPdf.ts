// Cross-platform "Export to PDF".
//
// Desktop: window.print() opens the OS print dialog → "Save as PDF" (crisp
// vector text + clickable links). The @media print CSS (index.css) hides the app
// and shows only the résumé/cover sheet portal.
//
// Android: the WebView ignores window.print(), so a native bridge
// (android-overrides/MainActivity.kt) drives Android's PrintManager over the
// same page — the identical @media print styles apply, so only the sheet prints
// and Android's print UI offers "Save as PDF". `AndroidPrint` is injected only
// on the Android build; on desktop it's undefined and we fall back to print().
type AndroidPrint = { print?: () => void };

export function exportToPdf(): void {
  const bridge = (window as unknown as { AndroidPrint?: AndroidPrint }).AndroidPrint;
  if (bridge && typeof bridge.print === "function") {
    bridge.print();
  } else {
    window.print();
  }
}
