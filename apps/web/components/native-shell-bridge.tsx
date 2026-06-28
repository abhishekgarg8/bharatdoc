"use client";

import { useEffect } from "react";

const APP_ORIGIN = "https://bharatdoc-web.vercel.app";

export function shouldOpenExternally(href: string, currentOrigin: string = APP_ORIGIN): boolean {
  try {
    const url = new URL(href, currentOrigin);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    return url.origin !== currentOrigin;
  } catch {
    return false;
  }
}

function isPlainPrimaryClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

export function NativeShellBridge() {
  useEffect(() => {
    let isMounted = true;
    const cleanupFns: Array<() => void> = [];

    async function setupNativeShell() {
      const [{ Capacitor }, { App }, { Browser }, statusBarModule, splashScreenModule] = await Promise.all([
        import("@capacitor/core"),
        import("@capacitor/app"),
        import("@capacitor/browser"),
        import("@capacitor/status-bar").catch(() => null),
        import("@capacitor/splash-screen").catch(() => null)
      ]);

      if (!isMounted || !Capacitor.isNativePlatform()) {
        return;
      }

      document.documentElement.dataset.nativeShell = "capacitor";
      document.documentElement.dataset.nativePlatform = Capacitor.getPlatform();

      window.dispatchEvent(
        new CustomEvent("bharatdoc:native-shell-ready", {
          detail: {
            platform: Capacitor.getPlatform()
          }
        })
      );

      if (statusBarModule) {
        await statusBarModule.StatusBar.setBackgroundColor({ color: "#C24A2A" }).catch(() => undefined);
        await statusBarModule.StatusBar.setStyle({ style: statusBarModule.Style.Light }).catch(() => undefined);
      }

      await splashScreenModule?.SplashScreen.hide().catch(() => undefined);

      const backButtonHandle = await App.addListener("backButton", (event) => {
        if (event.canGoBack || window.history.length > 1) {
          window.history.back();
          return;
        }

        void App.minimizeApp();
      });
      cleanupFns.push(() => {
        void backButtonHandle.remove();
      });

      const clickListener = (event: MouseEvent) => {
        if (event.defaultPrevented || !isPlainPrimaryClick(event)) {
          return;
        }

        const target = event.target instanceof Element ? event.target : null;
        const anchor = target?.closest<HTMLAnchorElement>("a[href]");

        if (!anchor || anchor.hasAttribute("download")) {
          return;
        }

        if (!shouldOpenExternally(anchor.href, window.location.origin)) {
          return;
        }

        event.preventDefault();
        void Browser.open({ url: anchor.href }).catch(() => {
          window.location.assign(anchor.href);
        });
      };

      document.addEventListener("click", clickListener, true);
      cleanupFns.push(() => {
        document.removeEventListener("click", clickListener, true);
      });
    }

    void setupNativeShell().catch(() => undefined);

    return () => {
      isMounted = false;

      for (const cleanup of cleanupFns) {
        cleanup();
      }
    };
  }, []);

  return null;
}
