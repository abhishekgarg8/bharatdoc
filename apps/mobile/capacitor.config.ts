import type { CapacitorConfig } from "@capacitor/cli";

const productionWebUrl = "https://bharatdoc-web.vercel.app";

const config: CapacitorConfig = {
  appId: "com.bharatdoc.app",
  appName: "BharatDoc",
  webDir: "web",
  server: {
    url: productionWebUrl,
    cleartext: false,
    errorPath: "offline.html"
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#FAF5EA",
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false
    },
    StatusBar: {
      backgroundColor: "#C24A2A",
      overlaysWebView: false,
      style: "LIGHT"
    }
  }
};

export default config;
