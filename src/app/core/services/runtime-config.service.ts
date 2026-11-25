import { Injectable } from '@angular/core';

declare global {
  interface Window {
    menuSmartQrRuntime?: {
      apiBaseUrl?: string;
    };
  }
}

@Injectable({
  providedIn: 'root',
})
export class RuntimeConfigService {
  get apiV1BaseUrl(): string {
    const configuredUrl = typeof window === 'undefined'
      ? ''
      : window.menuSmartQrRuntime?.apiBaseUrl?.trim() ?? '';
    return `${configuredUrl.replace(/\/+$/, '')}/api/v1`;
  }
}
