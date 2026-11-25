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
  get apiBaseUrl(): string {
    const configuredUrl = typeof window === 'undefined'
      ? ''
      : window.menuSmartQrRuntime?.apiBaseUrl?.trim() ?? '';
    return configuredUrl.replace(/\/+$/, '');
  }

  get apiV1BaseUrl(): string {
    return `${this.apiBaseUrl}/api/v1`;
  }

  get isApiConfigured(): boolean {
    return Boolean(this.apiBaseUrl);
  }
}
