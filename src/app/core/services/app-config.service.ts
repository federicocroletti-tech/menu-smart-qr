import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';

interface AppConfig {
  activeClient: string;
}

@Injectable({
  providedIn: 'root',
})
export class AppConfigService {
  private readonly appConfigUrl = 'assets/app-config.json';
  private readonly appConfig$: Observable<AppConfig>;

  constructor(private readonly http: HttpClient) {
    this.appConfig$ = this.http.get<AppConfig>(this.appConfigUrl).pipe(
      map((config) => ({
        activeClient: config?.activeClient?.trim() || 'pizzeria-vesuvio',
      })),
      catchError((error: unknown) => {
        console.error('Failed to load app config:', error);
        return of({ activeClient: 'pizzeria-vesuvio' });
      }),
      shareReplay(1),
    );
  }

  getActiveClient(): Observable<string> {
    return this.appConfig$.pipe(map((config) => config.activeClient));
  }

  getClientAssetsBasePath(): Observable<string> {
    return this.getActiveClient().pipe(
      map((activeClient) => `assets/clients/${activeClient}`),
    );
  }
}
