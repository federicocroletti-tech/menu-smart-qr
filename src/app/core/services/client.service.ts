import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, shareReplay, switchMap } from 'rxjs';

import type { Client } from '../models/client.model';
import { AppConfigService } from './app-config.service';

@Injectable({
  providedIn: 'root',
})
export class ClientService {
  private readonly client$: Observable<Client | null>;

  constructor(
    private readonly http: HttpClient,
    private readonly appConfigService: AppConfigService,
  ) {
    this.client$ = this.appConfigService.getClientAssetsBasePath().pipe(
      switchMap((basePath) => this.http.get<Client>(`${basePath}/client.json`)),
      catchError((error: unknown) => {
        console.error('Failed to load client data:', error);
        return of(null);
      }),
      shareReplay(1),
    );
  }

  getClient(): Observable<Client | null> {
    return this.client$;
  }
}
