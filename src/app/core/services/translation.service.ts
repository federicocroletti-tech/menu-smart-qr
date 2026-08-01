import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, map, of, tap } from 'rxjs';

import type {
  LocalizedText,
  SupportedLanguage,
  TranslationDictionary,
  TranslationValue,
} from '../models/i18n.model';

@Injectable({
  providedIn: 'root',
})
export class TranslationService {
  private static readonly storageKey = 'menu-smart-qr-language';

  private readonly supportedLanguages: SupportedLanguage[] = ['it', 'en', 'fr', 'de'];

  private readonly defaultLanguage: SupportedLanguage = 'it';

  private readonly languageSubject = new BehaviorSubject<SupportedLanguage>(
    this.readInitialLanguage(),
  );

  readonly currentLanguage = this.languageSubject.asObservable();

  private translations: TranslationDictionary = {};

  constructor(private readonly http: HttpClient) {
    this.loadTranslations(this.languageSubject.value).subscribe();
  }

  setLanguage(language: SupportedLanguage): void {
    if (!this.isSupportedLanguage(language)) {
      return;
    }

    this.languageSubject.next(language);
    this.saveLanguage(language);
    this.loadTranslations(language).subscribe();
  }

  getCurrentLanguage(): SupportedLanguage {
    return this.languageSubject.value;
  }

  getSupportedLanguages(): SupportedLanguage[] {
    return [...this.supportedLanguages];
  }

  loadTranslations(language: SupportedLanguage = this.getCurrentLanguage()): Observable<void> {
    const languageToLoad = this.isSupportedLanguage(language)
      ? language
      : this.defaultLanguage;

    return this.http
      .get<TranslationDictionary>(`assets/i18n/${languageToLoad}.json`)
      .pipe(
        tap((dictionary) => {
          this.translations = dictionary ?? {};
        }),
        map(() => undefined),
        catchError((error: unknown) => {
          console.error(`Failed to load translations for "${languageToLoad}":`, error);
          this.translations = {};
          return of(undefined);
        }),
      );
  }

  translate(key: string): string {
    const value = this.resolveNestedValue(this.translations, key);
    if (typeof value === 'string') {
      return value;
    }

    return key;
  }

  getLocalizedValue(value: LocalizedText | undefined): string {
    if (!value) {
      return '';
    }

    const current = this.getCurrentLanguage();
    if (value[current]) {
      return value[current] ?? '';
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

  private readInitialLanguage(): SupportedLanguage {
    const storedLanguage =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(TranslationService.storageKey)
        : null;
    if (storedLanguage && this.isSupportedLanguage(storedLanguage)) {
      return storedLanguage;
    }

    return this.defaultLanguage;
  }

  private saveLanguage(language: SupportedLanguage): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(TranslationService.storageKey, language);
  }

  private isSupportedLanguage(language: string): language is SupportedLanguage {
    return this.supportedLanguages.includes(language as SupportedLanguage);
  }

  private resolveNestedValue(
    dictionary: TranslationDictionary,
    key: string,
  ): TranslationValue | undefined {
    const parts = key.split('.');
    let current: TranslationValue | undefined = dictionary;

    for (const part of parts) {
      if (!current || typeof current === 'string') {
        return undefined;
      }

      current = current[part];
    }

    return current;
  }
}
