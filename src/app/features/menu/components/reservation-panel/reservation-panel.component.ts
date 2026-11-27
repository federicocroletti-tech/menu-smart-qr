import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  NgZone,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { Client } from '../../../../core/models/client.model';
import {
  ReservationApiService,
  type ReservationAvailability,
  type ReservationHold,
} from '../../../../core/services/reservation-api.service';
import { TranslationService } from '../../../../core/services/translation.service';
import { isFutureReservationDateTime } from '../../../../core/utils/reservation-time.util';
import { createWhatsAppUrl } from '../../../../core/utils/whatsapp.util';
import { ReservationManagementComponent } from './reservation-management.component';

type ReservationAllocationMode = 'guest_selected' | 'restaurant_assigned';

@Component({
  selector: 'app-reservation-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ReservationManagementComponent],
  templateUrl: './reservation-panel.component.html',
  styleUrl: './reservation-panel.component.scss',
})
export class ReservationPanelComponent implements OnDestroy {
  @Input({ required: true }) client!: Client;
  @Input() onlineBookingEnabled = true;
  @Input() enableWhatsappFallback = true;
  @ViewChild('dialog') private dialogRef?: ElementRef<HTMLElement>;
  isOpen = false;
  isManaging = false;
  name = '';
  phone = '';
  date = '';
  time = '';
  partySize = 2;
  notes = '';
  availability: ReservationAvailability | null = null;
  availabilityErrorKey = '';
  isCheckingAvailability = false;
  isSubmitting = false;
  isReleasingHold = false;
  acceptBookingTerms = false;
  acceptPrivacyNotice = false;
  confirmationCode = '';
  submissionErrorKey = '';
  holdReleased = false;
  allocationMode: ReservationAllocationMode = 'restaurant_assigned';
  selectedTableSetId = '';
  hold: ReservationHold | null = null;
  remainingHoldSeconds = 0;
  private availabilityRequestId = 0;
  private idempotencyKey: string | null = null;
  private returnFocusTarget: HTMLElement | null = null;
  private holdTicker: ReturnType<typeof setInterval> | null = null;
  private heldGuest: { name: string; phone: string; notes?: string } | null = null;

  constructor(
    public readonly translationService: TranslationService,
    private readonly reservationApiService: ReservationApiService,
    private readonly ngZone: NgZone,
    private readonly changeDetector: ChangeDetectorRef,
  ) {}

  get minimumPartySize(): number {
    return this.client.reservations?.minimumPartySize ?? 1;
  }

  get maximumPartySize(): number {
    return this.client.reservations?.maximumPartySize ?? 20;
  }

  get canCheckAvailability(): boolean {
    if (
      !this.onlineBookingEnabled ||
      !this.date ||
      !this.time ||
      !Number.isInteger(this.partySize) ||
      this.partySize < this.minimumPartySize ||
      this.partySize > this.maximumPartySize
    ) {
      return false;
    }

    return isFutureReservationDateTime(
      this.date,
      this.time,
      this.client.timeZone ?? 'UTC',
    );
  }

  get isValid(): boolean {
    if (
      this.name.trim().length < 2 ||
      this.phone.replace(/\D/g, '').length < 6 ||
      !this.date ||
      !this.time ||
      !Number.isInteger(this.partySize) ||
      this.partySize < this.minimumPartySize ||
      this.partySize > this.maximumPartySize
    ) {
      return false;
    }

    return isFutureReservationDateTime(
      this.date,
      this.time,
      this.client.timeZone ?? 'UTC',
    );
  }

  get bookingTermsUrl(): string | null {
    return this.getSafeDocumentUrl(this.client.reservations?.bookingTermsUrl);
  }

  get privacyNoticeUrl(): string | null {
    return this.getSafeDocumentUrl(this.client.reservations?.privacyNoticeUrl);
  }

  get hasLegalDocuments(): boolean {
    return this.bookingTermsUrl !== null && this.privacyNoticeUrl !== null;
  }

  get canSubmitReservation(): boolean {
    return this.onlineBookingEnabled &&
      this.isValid &&
      this.availability?.available === true &&
      (this.allocationMode === 'restaurant_assigned' || this.selectedTableSet !== null) &&
      this.hasLegalDocuments &&
      this.acceptBookingTerms &&
      this.acceptPrivacyNotice &&
      !this.isSubmitting &&
      !this.isReleasingHold &&
      !this.hold &&
      !this.confirmationCode;
  }

  get canConfirmHeldReservation(): boolean {
    return Boolean(this.hold?.holdToken) &&
      this.remainingHoldSeconds > 0 &&
      this.hasLegalDocuments &&
      this.acceptBookingTerms &&
      this.acceptPrivacyNotice &&
      !this.isSubmitting &&
      !this.isReleasingHold;
  }

  get selectedTableSet(): ReservationAvailability['tableSets'][number] | null {
    return this.availability?.tableSets.find(
      (tableSet) => tableSet.id === this.selectedTableSetId,
    ) ?? null;
  }

  get holdCountdownLabel(): string {
    const minutes = Math.floor(this.remainingHoldSeconds / 60);
    const seconds = this.remainingHoldSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  get holdExpirationTime(): string {
    if (!this.hold?.expiresAt) {
      return '';
    }

    return new Intl.DateTimeFormat(
      this.translationService.getCurrentLanguage(),
      { hour: '2-digit', minute: '2-digit', timeZone: this.client.timeZone ?? 'UTC' },
    ).format(new Date(this.hold.expiresAt));
  }

  get whatsappReservationUrl(): string | null {
    if (
      !this.enableWhatsappFallback ||
      !this.date ||
      !this.time ||
      !Number.isInteger(this.partySize) ||
      this.partySize < this.minimumPartySize ||
      this.partySize > this.maximumPartySize
    ) {
      return null;
    }

    const allocationText = this.translationService.translate(
      this.allocationMode === 'restaurant_assigned'
        ? 'restaurantAssigned'
        : 'guestSelectedTable',
    );
    const selectedTableNames =
      this.allocationMode === 'guest_selected'
        ? this.selectedTableSet?.tableNames?.join(', ') ??
          this.selectedTableSet?.tableIds.join(', ')
        : '';
    const message = [
      this.translationService.translate('reservationWhatsappIntro'),
      '',
      `${this.translationService.translate('name')}: ${this.name.trim() || '-'}`,
      `${this.translationService.translate('phone')}: ${this.phone.trim() || '-'}`,
      `${this.translationService.translate('date')}: ${this.date}`,
      `${this.translationService.translate('time')}: ${this.time}`,
      `${this.translationService.translate('partySize')}: ${this.partySize}`,
      `${this.translationService.translate('tableAssignment')}: ${allocationText}`,
      ...(selectedTableNames
        ? [`${this.translationService.translate('reservationTables')}: ${selectedTableNames}`]
        : []),
      ...(this.notes.trim()
        ? [`${this.translationService.translate('notes')}: ${this.notes.trim()}`]
        : []),
    ].join('\n');

    return createWhatsAppUrl(this.client.contacts, message);
  }

  get showWhatsappFallbackAction(): boolean {
    return this.shouldOfferWhatsappFallback && Boolean(this.whatsappReservationUrl);
  }

  get showWhatsappFallbackUnavailable(): boolean {
    return this.shouldOfferWhatsappFallback && !this.whatsappReservationUrl;
  }

  private get shouldOfferWhatsappFallback(): boolean {
    const validSelection = Boolean(this.date && this.time) &&
      Number.isInteger(this.partySize) &&
      this.partySize >= this.minimumPartySize &&
      this.partySize <= this.maximumPartySize &&
      isFutureReservationDateTime(
        this.date,
        this.time,
        this.client.timeZone ?? 'UTC',
      );

    return this.enableWhatsappFallback &&
      validSelection &&
      (!this.onlineBookingEnabled ||
        !this.hasLegalDocuments ||
        Boolean(this.availabilityErrorKey || this.submissionErrorKey));
  }

  ngOnDestroy(): void {
    this.clearHoldTicker();
  }

  openPanel(trigger: HTMLElement): void {
    this.returnFocusTarget = trigger;
    this.isOpen = true;
    setTimeout(() => this.focusFirstElement(), 0);
  }

  closePanel(): void {
    this.isOpen = false;
    setTimeout(() => this.returnFocusTarget?.focus(), 0);
  }

  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closePanel();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusable = this.getFocusableElements();
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const dialog = this.dialogRef?.nativeElement;
    if (!first || !last) {
      event.preventDefault();
      return;
    }

    const activeElement = dialog?.ownerDocument.activeElement ?? null;
    if (
      event.shiftKey &&
      (activeElement === first || !dialog?.contains(activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (activeElement === last || !dialog?.contains(activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  checkAvailability(): void {
    if (
      !this.canCheckAvailability ||
      this.isCheckingAvailability ||
      this.isSubmitting
    ) {
      return;
    }

    const requestId = ++this.availabilityRequestId;
    this.availability = null;
    this.availabilityErrorKey = '';
    this.isCheckingAvailability = true;

    this.reservationApiService
      .getAvailability(this.client.id, this.date, this.time, this.partySize)
      .subscribe({
        next: (availability) => {
          this.ngZone.run(() => {
            if (requestId !== this.availabilityRequestId) {
              return;
            }
            this.availability = availability;
            this.selectedTableSetId = availability.tableSets[0]?.id ?? '';
            this.isCheckingAvailability = false;
            if (!availability.available) {
              this.availabilityErrorKey = 'availabilityNotFound';
            }
            this.changeDetector.detectChanges();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            if (requestId !== this.availabilityRequestId) {
              return;
            }
            if (error instanceof HttpErrorResponse && error.status === 404) {
              this.availabilityErrorKey = 'availabilityNotFound';
            } else {
              console.error('Failed to check reservation availability:', error);
              this.availabilityErrorKey = 'availabilityError';
            }
            this.isCheckingAvailability = false;
            this.changeDetector.detectChanges();
          });
        },
      });
  }

  submitReservation(): void {
    if (!this.canSubmitReservation) {
      return;
    }

    this.isSubmitting = true;
    this.submissionErrorKey = '';
    this.idempotencyKey ??= crypto.randomUUID();
    const holdRequest = {
      date: this.date,
      time: this.time,
      partySize: this.partySize,
      allocationMode: this.allocationMode,
      ...(this.allocationMode === 'guest_selected'
        ? { tableIds: this.selectedTableSet?.tableIds }
        : {}),
    };
    const guest = {
      name: this.name.trim(),
      phone: this.phone.trim(),
      notes: this.notes.trim() || undefined,
    };
    this.reservationApiService
      .createReservationHold(this.client.id, holdRequest, this.idempotencyKey)
      .subscribe({
        next: (hold) => {
          this.ngZone.run(() => {
            if (!hold.expiresAt || !Number.isFinite(Date.parse(hold.expiresAt))) {
              this.submissionErrorKey = 'reservationHoldExpiryUnavailable';
              this.idempotencyKey = null;
              this.isSubmitting = false;
              this.changeDetector.detectChanges();
              return;
            }

            this.hold = hold;
            this.heldGuest = guest;
            this.isSubmitting = false;
            this.updateHoldCountdown();
            this.holdTicker = setInterval(
              () => this.ngZone.run(() => this.updateHoldCountdown()),
              1000,
            );
            this.changeDetector.detectChanges();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            console.error('Failed to save reservation:', error);
            this.submissionErrorKey =
              error instanceof HttpErrorResponse && error.status === 410
                ? 'reservationHoldExpired'
                : error instanceof HttpErrorResponse && error.status === 409
                  ? 'reservationNoLongerAvailable'
                  : 'reservationSubmitError';
            this.isSubmitting = false;
            this.changeDetector.detectChanges();
          });
        },
      });
  }

  confirmHeldReservation(): void {
    if (!this.canConfirmHeldReservation || !this.hold || !this.heldGuest) {
      return;
    }

    this.isSubmitting = true;
    this.submissionErrorKey = '';
    this.reservationApiService
      .confirmReservation({
        holdToken: this.hold.holdToken,
        guest: this.heldGuest,
        acceptTerms: true,
        acceptPrivacy: true,
        marketingConsent: false,
      })
      .subscribe({
        next: (confirmation) => {
          this.ngZone.run(() => {
            this.clearHoldTicker();
            this.hold = null;
            this.heldGuest = null;
            this.confirmationCode = confirmation.confirmationCode;
            this.isSubmitting = false;
            this.changeDetector.detectChanges();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            console.error('Failed to confirm reservation:', error);
            this.submissionErrorKey =
              error instanceof HttpErrorResponse && error.status === 410
                ? 'reservationHoldExpired'
                : error instanceof HttpErrorResponse && error.status === 409
                  ? 'reservationNoLongerAvailable'
                  : 'reservationSubmitError';
            if (
              error instanceof HttpErrorResponse &&
              (error.status === 410 || error.status === 409)
            ) {
              this.expireLocalHold();
            }
            this.isSubmitting = false;
            this.changeDetector.detectChanges();
          });
        },
      });
  }

  releaseHeldReservation(): void {
    if (!this.hold || this.isSubmitting || this.isReleasingHold) {
      return;
    }

    this.isReleasingHold = true;
    this.submissionErrorKey = '';
    this.holdReleased = false;
    this.reservationApiService.releaseReservationHold(this.hold.holdToken).subscribe({
      next: () => {
        this.ngZone.run(() => {
          this.resetAvailability();
          this.holdReleased = true;
          this.isReleasingHold = false;
          this.changeDetector.detectChanges();
        });
      },
      error: (error: unknown) => {
        this.ngZone.run(() => {
          console.error('Failed to release reservation hold:', error);
          this.submissionErrorKey = 'reservationHoldReleaseError';
          this.isReleasingHold = false;
          this.changeDetector.detectChanges();
        });
      },
    });
  }

  openManagement(): void {
    this.isManaging = true;
  }

  closeManagement(): void {
    this.isManaging = false;
  }

  resetAvailability(): void {
    if (this.isSubmitting) {
      return;
    }

    this.availabilityRequestId += 1;
    this.holdReleased = false;
    this.clearHoldTicker();
    this.hold = null;
    this.heldGuest = null;
    this.remainingHoldSeconds = 0;
    this.availability = null;
    this.availabilityErrorKey = '';
    this.submissionErrorKey = '';
    this.confirmationCode = '';
    this.idempotencyKey = null;
    this.isCheckingAvailability = false;
    this.selectedTableSetId = '';
  }

  private updateHoldCountdown(): void {
    if (!this.hold?.expiresAt) {
      return;
    }

    this.remainingHoldSeconds = Math.max(
      0,
      Math.ceil((Date.parse(this.hold.expiresAt) - Date.now()) / 1000),
    );
    if (this.remainingHoldSeconds === 0) {
      this.expireLocalHold();
      this.submissionErrorKey = 'reservationHoldExpired';
    }
    this.changeDetector.markForCheck();
  }

  private expireLocalHold(): void {
    this.clearHoldTicker();
    this.hold = null;
    this.heldGuest = null;
    this.remainingHoldSeconds = 0;
    this.availability = null;
    this.idempotencyKey = null;
  }

  private clearHoldTicker(): void {
    if (this.holdTicker !== null) {
      clearInterval(this.holdTicker);
      this.holdTicker = null;
    }
  }

  get minimumDate(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.client.timeZone ?? 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values['year']}-${values['month']}-${values['day']}`;
  }

  private focusFirstElement(): void {
    this.dialogRef?.nativeElement.querySelector<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )?.focus();
  }

  private getFocusableElements(): HTMLElement[] {
    return Array.from(
      this.dialogRef?.nativeElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
  }

  private getSafeDocumentUrl(value: string | undefined): string | null {
    if (!value) {
      return null;
    }
    try {
      const isLocalPath = value.startsWith('/') && !value.startsWith('//');
      const url = isLocalPath
        ? new URL(value, 'https://local.invalid')
        : new URL(value);
      if (isLocalPath) {
        return url.origin === 'https://local.invalid'
          ? `${url.pathname}${url.search}${url.hash}`
          : null;
      }
      return url.protocol === 'https:' || url.protocol === 'http:'
        ? url.href
        : null;
    } catch {
      return null;
    }
  }
}
