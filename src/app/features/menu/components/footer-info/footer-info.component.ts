import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';

import type { Client } from '../../../../core/models/client.model';
import { LocalizedTextPipe } from '../../../../shared/pipes/localized-text.pipe';
import { TranslationService } from '../../../../core/services/translation.service';
import { OpeningHoursComponent } from '../opening-hours/opening-hours.component';

@Component({
  selector: 'app-footer-info',
  standalone: true,
  imports: [CommonModule, LocalizedTextPipe, OpeningHoursComponent],
  templateUrl: './footer-info.component.html',
  styleUrl: './footer-info.component.scss',
})
export class FooterInfoComponent {
  @Input({ required: true }) client!: Client;
  @Input() showOpeningHours = true;
  @Input() showMap = true;

  mapExpanded = false;
  mapLoading = false;
  mapError = false;

  private cachedMapUrl: string | null | undefined;
  private cachedSafeMapUrl: SafeResourceUrl | null = null;

  constructor(
    public readonly translationService: TranslationService,
    private readonly sanitizer: DomSanitizer,
  ) {}

  get noteLines(): string[] {
    const text = this.translationService.getLocalizedValue(this.client.notes);
    return text
      .split('.')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  get directionsUrl(): string | null {
    const configuredUrl = this.safeGoogleMapsUrl(this.client.contacts.mapsUrl)?.toString();
    if (configuredUrl) {
      return configuredUrl;
    }

    const address = this.locationQuery;
    return address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
      : null;
  }

  get mapEmbedUrl(): SafeResourceUrl | null {
    const address = this.locationQuery;
    let embedUrl: string | null = null;

    if (address) {
      embedUrl = `https://www.google.com/maps?output=embed&q=${encodeURIComponent(address)}`;
    } else {
      const mapsUrl = this.safeGoogleMapsUrl(this.client.contacts.mapsUrl);
      if (mapsUrl) {
        mapsUrl.searchParams.set('output', 'embed');
        embedUrl = mapsUrl.toString();
      }
    }

    if (embedUrl !== this.cachedMapUrl) {
      this.cachedMapUrl = embedUrl;
      this.cachedSafeMapUrl = embedUrl
        ? this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl)
        : null;
    }

    return this.cachedSafeMapUrl;
  }

  toggleEmbeddedMap(): void {
    if (this.mapExpanded) {
      this.mapExpanded = false;
      this.mapLoading = false;
      return;
    }

    if (!this.mapEmbedUrl) {
      return;
    }

    this.mapExpanded = true;
    this.mapLoading = true;
    this.mapError = false;
  }

  onMapLoad(): void {
    this.mapLoading = false;
  }

  onMapError(): void {
    this.mapLoading = false;
    this.mapError = true;
  }

  private get locationQuery(): string {
    return this.translationService.getLocalizedValue(this.client.contacts.address).trim();
  }

  private safeGoogleMapsUrl(value: string | undefined): URL | null {
    if (!value) {
      return null;
    }

    try {
      const url = new URL(value);
      const isGoogleMaps =
        url.protocol === 'https:' &&
        url.port === '' &&
        !url.username &&
        !url.password &&
        (url.hostname === 'maps.google.com' ||
          url.hostname === 'google.com' ||
          url.hostname === 'www.google.com') &&
        (url.hostname === 'maps.google.com' || url.pathname.startsWith('/maps'));

      return isGoogleMaps ? url : null;
    } catch {
      return null;
    }
  }
}
