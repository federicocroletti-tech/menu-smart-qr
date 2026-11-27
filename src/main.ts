import 'zone.js';

import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { appConfig } from './app/app.config';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));

if ('serviceWorker' in navigator) {
  const runtimeConfig = window.menuSmartQrRuntime;
  if (runtimeConfig?.enablePwaOffline) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch((error) => {
        console.error('PWA offline service worker registration failed:', error);
      });
    });
  } else {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(
        registrations.map((registration) => registration.unregister()),
      ))
      .catch((error) => {
        console.error('PWA offline service worker cleanup failed:', error);
      });
  }
}
