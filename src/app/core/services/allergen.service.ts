import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay, switchMap } from 'rxjs';

import type { Allergen } from '../models/allergen.model';
import { AppConfigService } from './app-config.service';

@Injectable({
  providedIn: 'root',
})
export class AllergenService {
  private readonly allergens$: Observable<Allergen[]>;

  constructor(
    private readonly http: HttpClient,
    private readonly appConfigService: AppConfigService,
  ) {
    this.allergens$ = this.appConfigService.getClientAssetsBasePath().pipe(
      switchMap((basePath) => this.http.get<Allergen[]>(`${basePath}/allergens.json`)),
      map((allergens) => allergens ?? []),
      catchError((error: unknown) => {
        console.error('Failed to load allergens:', error);
        return of([]);
      }),
      shareReplay(1),
    );
  }

  getAllergens(): Observable<Allergen[]> {
    return this.allergens$;
  }

  getAllergenById(id: string): Observable<Allergen | null> {
    return this.allergens$.pipe(
      map((allergens) => allergens.find((allergen) => allergen.id === id) ?? null),
    );
  }
}
