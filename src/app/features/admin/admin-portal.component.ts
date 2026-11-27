import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import type { Session } from '@supabase/supabase-js';

import {
  AdminApiService,
  type AdminReservation,
  type RestaurantMembership,
} from '../../core/services/admin-api.service';
import { AdminAuthService } from '../../core/services/admin-auth.service';

@Component({
  selector: 'app-admin-portal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-portal.component.html',
  styleUrl: './admin-portal.component.scss',
})
export class AdminPortalComponent implements OnInit {
  session: Session | null = null;
  email = '';
  password = '';
  restaurants: RestaurantMembership[] = [];
  selectedRestaurantId = '';
  date = this.today();
  reservations: AdminReservation[] = [];
  isLoading = false;
  isSigningIn = false;
  errorMessage = '';
  readonly isAuthConfigured: boolean;

  constructor(
    private readonly auth: AdminAuthService,
    private readonly adminApi: AdminApiService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    this.isAuthConfigured = auth.isConfigured;
  }

  ngOnInit(): void {
    if (!this.isAuthConfigured) {
      return;
    }
    void this.restoreSession();
  }

  async signIn(): Promise<void> {
    if (this.isSigningIn || !this.email.trim() || !this.password) {
      return;
    }

    this.isSigningIn = true;
    this.errorMessage = '';
    try {
      this.session = await this.auth.signIn(this.email.trim(), this.password);
      this.password = '';
      await this.loadRestaurants();
    } catch (error: unknown) {
      console.error('Backoffice sign-in failed:', error);
      this.errorMessage = 'Accesso non riuscito. Verifica le credenziali e riprova.';
    } finally {
      this.isSigningIn = false;
    }
  }

  async signOut(): Promise<void> {
    this.errorMessage = '';
    try {
      await this.auth.signOut();
      this.session = null;
      this.restaurants = [];
      this.selectedRestaurantId = '';
      this.reservations = [];
    } catch (error: unknown) {
      console.error('Backoffice sign-out failed:', error);
      this.errorMessage = 'Non è stato possibile uscire. Riprova.';
    }
  }

  async selectRestaurant(): Promise<void> {
    await this.loadReservations();
  }

  async refreshReservations(): Promise<void> {
    await this.loadReservations();
  }

  reservationStatus(status: AdminReservation['status']): string {
    const labels: Record<AdminReservation['status'], string> = {
      draft: 'Bozza',
      holding: 'In attesa',
      awaiting_guarantee: 'In attesa di garanzia',
      confirmed: 'Confermata',
      seated: 'Al tavolo',
      completed: 'Completata',
      cancelled_by_guest: 'Annullata dal cliente',
      cancelled_by_restaurant: 'Annullata dal locale',
      no_show: 'Non presentato',
      expired: 'Scaduta',
    };
    return labels[status];
  }

  private async restoreSession(): Promise<void> {
    this.isLoading = true;
    try {
      this.session = await this.auth.getSession();
      if (this.session) {
        await this.loadRestaurants();
      }
    } catch (error: unknown) {
      console.error('Backoffice session restore failed:', error);
      this.errorMessage = 'Non è stato possibile ripristinare la sessione.';
    } finally {
      this.isLoading = false;
      this.changeDetector.markForCheck();
    }
  }

  private async loadRestaurants(): Promise<void> {
    if (!this.session) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    try {
      const response = await firstValueFrom(
        this.adminApi.getRestaurants(this.session.access_token),
      );
      this.restaurants = response.restaurants;
      this.selectedRestaurantId = this.restaurants[0]?.restaurantId ?? '';
      if (this.selectedRestaurantId) {
        await this.loadReservations();
      } else {
        this.reservations = [];
      }
    } catch (error: unknown) {
      console.error('Failed to load restaurant memberships:', error);
      this.errorMessage = this.apiErrorMessage(
        error,
        'Non è stato possibile caricare i ristoranti associati all’account.',
      );
    } finally {
      this.isLoading = false;
    }
  }

  private async loadReservations(): Promise<void> {
    if (!this.session || !this.selectedRestaurantId || !this.date) {
      this.reservations = [];
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    try {
      const response = await firstValueFrom(
        this.adminApi.getReservations(
          this.selectedRestaurantId,
          this.date,
          this.session.access_token,
        ),
      );
      this.reservations = response.reservations;
    } catch (error: unknown) {
      console.error('Failed to load restaurant reservations:', error);
      this.errorMessage = this.apiErrorMessage(
        error,
        'Non è stato possibile caricare le prenotazioni.',
      );
    } finally {
      this.isLoading = false;
    }
  }

  private apiErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.session = null;
      return 'Sessione scaduta. Accedi di nuovo.';
    }
    if (error instanceof HttpErrorResponse && error.status === 404) {
      return 'Non hai accesso a questo ristorante oppure non esiste.';
    }
    return fallback;
  }

  private today(): string {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 10);
  }
}
