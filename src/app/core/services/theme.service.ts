import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

import type { ClientTheme } from '../models/client.model';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  applyTheme(theme: ClientTheme): void {
    const root = this.document.documentElement;

    const primary = theme.primary ?? theme.primaryColor ?? '#C62828';
    const secondary = theme.secondary ?? theme.secondaryColor ?? theme.accentColor ?? '#F9A825';
    const background = theme.background ?? theme.backgroundColor ?? '#FFF8F2';
    const surface = theme.surface ?? '#FFFFFF';
    const text = theme.text ?? theme.textColor ?? '#212121';
    const muted = theme.muted ?? '#6B7280';
    const border = theme.border ?? '#E5E7EB';

    root.style.setProperty('--color-primary', primary);
    root.style.setProperty('--color-secondary', secondary);
    root.style.setProperty('--color-background', background);
    root.style.setProperty('--color-surface', surface);
    root.style.setProperty('--color-text', text);
    root.style.setProperty('--color-muted', muted);
    root.style.setProperty('--color-border', border);
  }
}
