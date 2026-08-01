import { CommonModule, DOCUMENT } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { Subject, finalize, forkJoin, takeUntil, timeout } from 'rxjs';

import type { Allergen } from '../../../../core/models/allergen.model';
import type { Client } from '../../../../core/models/client.model';
import type { MenuCategory } from '../../../../core/models/menu.model';
import { AllergenService } from '../../../../core/services/allergen.service';
import { ClientService } from '../../../../core/services/client.service';
import { MenuService } from '../../../../core/services/menu.service';
import { SeoService } from '../../../../core/services/seo.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { TranslationService } from '../../../../core/services/translation.service';
import { LocalizedTextPipe } from '../../../../shared/pipes/localized-text.pipe';
import { type MenuFilter } from '../../../../shared/utils/menu-filter.util';
import { CategoryNavComponent } from '../../components/category-nav/category-nav.component';
import { ContactBarComponent } from '../../components/contact-bar/contact-bar.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { FooterInfoComponent } from '../../components/footer-info/footer-info.component';
import { LanguageSelectorComponent } from '../../components/language-selector/language-selector.component';
import { LoadingStateComponent } from '../../components/loading-state/loading-state.component';
import { MenuSectionComponent } from '../../components/menu-section/menu-section.component';
import { RecommendedSectionComponent } from '../../components/recommended-section/recommended-section.component';
import { RestaurantHeaderComponent } from '../../components/restaurant-header/restaurant-header.component';
import { SearchFilterComponent } from '../../components/search-filter/search-filter.component';

@Component({
  selector: 'app-menu-page',
  standalone: true,
  imports: [
    CommonModule,
    LocalizedTextPipe,
    RestaurantHeaderComponent,
    LanguageSelectorComponent,
    RecommendedSectionComponent,
    SearchFilterComponent,
    CategoryNavComponent,
    MenuSectionComponent,
    ContactBarComponent,
    FooterInfoComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
  ],
  templateUrl: './menu-page.component.html',
  styleUrl: './menu-page.component.scss',
})
export class MenuPageComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly document = inject(DOCUMENT);
  private readonly cdr = inject(ChangeDetectorRef);

  client: Client | null = null;
  categories: MenuCategory[] = [];
  allergens: Allergen[] = [];

  loading = true;
  hasError = false;
  filter: MenuFilter = {};
  activeCategoryId: string | null = null;

  constructor(
    private readonly clientService: ClientService,
    private readonly menuService: MenuService,
    private readonly allergenService: AllergenService,
    private readonly translationService: TranslationService,
    private readonly themeService: ThemeService,
    private readonly seoService: SeoService,
  ) {}

  ngOnInit(): void {
    this.loadPageData();

    this.translationService.currentLanguage
      .pipe(takeUntil(this.destroy$))
      .subscribe((language) => {
        if (this.client) {
          this.seoService.applySeo(this.client, language);
          this.cdr.markForCheck();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get featureFlags(): Record<string, boolean | undefined> {
    return this.client?.settings.featureFlags ?? {};
  }

  get isEmpty(): boolean {
    return !this.loading && !this.hasError && this.categories.length === 0;
  }

  get hasMobileContactBar(): boolean {
    return Boolean(this.client && this.featureFlags['showContactBar']);
  }

  get allergenMap(): Record<string, Allergen> {
    return this.allergens.reduce<Record<string, Allergen>>((accumulator, allergen) => {
      accumulator[allergen.id] = allergen;
      return accumulator;
    }, {});
  }

  onFilterChange(filter: MenuFilter): void {
    this.filter = filter;
  }

  onCategorySelect(categoryId: string): void {
    this.activeCategoryId = categoryId;
    this.scrollToCategory(categoryId);
  }

  onRetry(): void {
    this.loadPageData();
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    if (this.categories.length === 0) {
      return;
    }

    const viewportOffset = 140;
    let activeCategory: string | null = null;

    for (const category of this.categories) {
      const section = this.document.getElementById(this.toSectionId(category.id));
      if (!section) {
        continue;
      }

      const rect = section.getBoundingClientRect();
      if (rect.top <= viewportOffset) {
        activeCategory = category.id;
      }
    }

    if (activeCategory) {
      this.activeCategoryId = activeCategory;
    }
  }

  toSectionId(categoryId: string): string {
    return `menu-category-${categoryId}`;
  }

  private loadPageData(): void {
    this.loading = true;
    this.hasError = false;

    forkJoin({
      client: this.clientService.getClient(),
      categories: this.menuService.getMenuCategories(),
      allergens: this.allergenService.getAllergens(),
    })
      .pipe(
        takeUntil(this.destroy$),
        timeout(10000),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ client, categories, allergens }) => {
          if (!client) {
            this.hasError = true;
            return;
          }

          this.client = client;
          this.categories = categories;
          this.allergens = allergens;
          this.activeCategoryId = categories[0]?.id ?? null;

          this.themeService.applyTheme(client.theme);
          this.seoService.applySeo(client, this.translationService.getCurrentLanguage());
        },
        error: () => {
          this.hasError = true;
        },
      });
  }

  private scrollToCategory(categoryId: string): void {
    const section = this.document.getElementById(this.toSectionId(categoryId));
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
