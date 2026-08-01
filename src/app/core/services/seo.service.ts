import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

import type { Client, ClientSeo } from '../models/client.model';
import type { LocalizedText, SupportedLanguage } from '../models/i18n.model';

@Injectable({
  providedIn: 'root',
})
export class SeoService {
  private readonly canonicalSelector = 'link[rel="canonical"]';
  private readonly structuredDataId = 'menu-smart-qr-structured-data';
  private readonly document = inject(DOCUMENT);

  constructor(
    private readonly title: Title,
    private readonly meta: Meta,
  ) {}

  applySeo(client: Client, language: SupportedLanguage): void {
    const seo = client.seo;
    const title = this.getLocalizedValue(seo.title, language);
    const description = this.getLocalizedValue(seo.description, language);

    this.title.setTitle(title);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });

    const ogImage = seo.ogImage ?? seo.imageUrl;
    if (ogImage) {
      this.meta.updateTag({ property: 'og:image', content: ogImage });
    } else {
      this.meta.removeTag(`property='og:image'`);
    }

    this.updateCanonicalUrl(seo);
    this.updateStructuredData(client, language);
  }

  private updateCanonicalUrl(seo: ClientSeo): void {
    if (!seo.canonicalUrl) {
      return;
    }

    let canonicalLink = this.document.querySelector(
      this.canonicalSelector,
    ) as HTMLLinkElement | null;
    if (!canonicalLink) {
      canonicalLink = this.document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonicalLink);
    }

    canonicalLink.setAttribute('href', seo.canonicalUrl);
  }

  private updateStructuredData(client: Client, language: SupportedLanguage): void {
    const existing = this.document.getElementById(this.structuredDataId);
    if (existing) {
      existing.remove();
    }

    if (!client.name || !client.contacts?.address) {
      return;
    }

    const schemaType = client.type === 'restaurant' || client.type === 'pizzeria'
      ? 'Restaurant'
      : 'LocalBusiness';

    const structuredData = {
      '@context': 'https://schema.org',
      '@type': schemaType,
      name: client.name,
      description: this.getLocalizedValue(client.description, language),
      telephone: client.contacts.phone,
      email: client.contacts.email,
      url: client.contacts.website ?? client.seo.canonicalUrl,
      image: client.seo.ogImage ?? client.seo.imageUrl,
      address: {
        '@type': 'PostalAddress',
        streetAddress: this.getLocalizedValue(client.contacts.address, language),
      },
      hasMap: client.contacts.mapsUrl,
      openingHoursSpecification: (client.openingHours ?? []).map((day) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: day.day,
        opens: day.slots?.[0]?.open,
        closes: day.slots?.[0]?.close,
      })),
      inLanguage: language,
    };

    const script = this.document.createElement('script');
    script.id = this.structuredDataId;
    script.type = 'application/ld+json';
    script.text = JSON.stringify(structuredData);
    this.document.head.appendChild(script);
  }

  private getLocalizedValue(
    value: LocalizedText | undefined,
    language: SupportedLanguage,
  ): string {
    if (!value) {
      return '';
    }

    if (value[language]) {
      return value[language] ?? '';
    }

    if (value.it) {
      return value.it;
    }

    if (value.en) {
      return value.en;
    }

    const firstAvailable = Object.values(value).find(
      (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
    );
    return firstAvailable ?? '';
  }
}
