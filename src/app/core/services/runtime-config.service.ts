import { Injectable } from '@angular/core';

declare global {
  interface Window {
    menuSmartQrRuntime?: {
      apiBaseUrl?: string;
      supabaseUrl?: string;
      supabasePublishableKey?: string;
      enablePwaOffline?: boolean;
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

  get supabaseUrl(): string {
    return typeof window === 'undefined'
      ? ''
      : window.menuSmartQrRuntime?.supabaseUrl?.trim() ?? '';
  }

  get supabasePublishableKey(): string {
    return typeof window === 'undefined'
      ? ''
      : window.menuSmartQrRuntime?.supabasePublishableKey?.trim() ?? '';
  }

  get isSupabaseAuthConfigured(): boolean {
    return Boolean(this.supabaseUrl && this.supabasePublishableKey);
  }

  get isApiConfigured(): boolean {
    return Boolean(this.apiBaseUrl);
  }

  get isPwaOfflineEnabled(): boolean {
    return typeof window !== 'undefined'
      && window.menuSmartQrRuntime?.enablePwaOffline === true;
  }
}
