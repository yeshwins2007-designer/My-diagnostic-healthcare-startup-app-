import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The store apps are native shells around the web app: the same pages, the
 * same server, the same security. What the shells add is what a website
 * cannot do on its own: a home-screen app from the stores, the native splash
 * and status bar, Android's back button, an offline screen, and (once keys
 * exist) push notifications.
 *
 * MEDWYN_APP_URL is the permanent HTTPS address of the web app. It is read
 * when the native projects are synced (`npx cap sync`), so CI sets it per
 * build. MEDWYN_APP_ID is the bundle ID registered in App Store Connect and
 * Google Play Console; it cannot change after the first release.
 */
const appUrl = process.env.MEDWYN_APP_URL ?? 'https://app.medwyn.in';
const host = new URL(appUrl).host;
const partnerHost = process.env.PARTNER_HOST;

const config: CapacitorConfig = {
  appId: process.env.MEDWYN_APP_ID ?? 'in.medwyn.app',
  appName: 'MEDWYN',
  webDir: 'www',
  // Lets the server tell the store app from a browser, e.g. in logs.
  appendUserAgent: 'MedwynApp/1.0',
  server: {
    url: appUrl,
    cleartext: false,
    // Shown by the shell when the app address cannot be reached.
    errorPath: 'offline.html',
    // Pages that open inside the app. Anything else (a lab's website, a
    // tel: or upi: link) opens outside it, in the browser or the right app.
    allowNavigation: [host, ...(partnerHost ? [partnerHost] : []), 'api.razorpay.com', 'checkout.razorpay.com'],
  },
  ios: {
    // The web app already pads for the notch and the home indicator.
    contentInset: 'never',
    backgroundColor: '#09090b',
  },
  android: {
    backgroundColor: '#09090b',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#09090b',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
    },
  },
};

export default config;
