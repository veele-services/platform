import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl =
  process.env.CAPACITOR_SERVER_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://veeleservices.fieldgrid.nl/personeel";

const config: CapacitorConfig = {
  appId: process.env.CAPACITOR_APP_ID ?? "nl.veeleservices.personeel",
  appName: process.env.CAPACITOR_APP_NAME ?? "Veele Personeel",
  webDir: "native/www",
  server: {
    url: serverUrl,
    cleartext: false,
  },
  android: {
    path: "android",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 900,
      backgroundColor: "#081D3A",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      backgroundColor: "#081D3A",
      style: "LIGHT",
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
