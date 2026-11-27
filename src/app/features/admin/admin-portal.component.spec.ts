import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { AdminApiService } from '../../core/services/admin-api.service';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminPortalComponent } from './admin-portal.component';

describe('AdminPortalComponent', () => {
  it('offers sign-in without public account registration', async () => {
    const getSession = vi.fn().mockResolvedValue(null);
    await TestBed.configureTestingModule({
      imports: [AdminPortalComponent],
      providers: [
        {
          provide: AdminAuthService,
          useValue: {
            isConfigured: true,
            getSession,
          },
        },
        { provide: AdminApiService, useValue: {} },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdminPortalComponent);
    fixture.detectChanges();
    await getSession.mock.results[0]?.value;
    await vi.waitFor(() => expect(fixture.componentInstance.isLoading).toBe(false));
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Accedi');
    expect(text).not.toContain('Registrati');
    expect(fixture.nativeElement.querySelector('input[type="password"]'))
      .not.toBeNull();
  });

  it('explains when backoffice authentication is not configured', async () => {
    await TestBed.configureTestingModule({
      imports: [AdminPortalComponent],
      providers: [
        {
          provide: AdminAuthService,
          useValue: { isConfigured: false },
        },
        { provide: AdminApiService, useValue: {} },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdminPortalComponent);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('SUPABASE_URL');
    expect(text).toContain('SUPABASE_PUBLISHABLE_KEY');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
});
