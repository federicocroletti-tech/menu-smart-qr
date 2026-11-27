import { TestBed } from '@angular/core/testing';

import { RuntimeConfigService } from './runtime-config.service';

describe('RuntimeConfigService PWA offline flag', () => {
  afterEach(() => {
    delete window.menuSmartQrRuntime;
  });

  it('is disabled by default when runtime configuration is missing', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(RuntimeConfigService);

    expect(service.isPwaOfflineEnabled).toBe(false);
  });

  it('is enabled only when explicitly set to true', () => {
    window.menuSmartQrRuntime = Object.freeze({
      enablePwaOffline: true,
    });
    TestBed.configureTestingModule({});
    const service = TestBed.inject(RuntimeConfigService);

    expect(service.isPwaOfflineEnabled).toBe(true);
  });
});
