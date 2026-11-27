import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import type { MenuItem } from '../models/menu.model';

export interface CartEntry {
  item: MenuItem;
  quantity: number;
}

@Injectable({ providedIn: 'root' })
export class OrderCartService {
  private readonly entries = new Map<string, CartEntry>();
  private readonly entriesSubject = new BehaviorSubject<CartEntry[]>([]);
  private readonly persistenceErrorSubject = new BehaviorSubject(false);
  private restaurantId: string | null = null;

  readonly entries$ = this.entriesSubject.asObservable();
  readonly persistenceError$ = this.persistenceErrorSubject.asObservable();

  get persistenceError(): boolean {
    return this.persistenceErrorSubject.value;
  }

  setRestaurant(restaurantId: string): void {
    if (this.restaurantId === restaurantId) {
      return;
    }

    this.restaurantId = restaurantId;
    this.entries.clear();
    this.persistenceErrorSubject.next(false);
    for (const entry of this.readStoredEntries(restaurantId)) {
      this.entries.set(entry.item.id, entry);
    }
    this.entriesSubject.next(Array.from(this.entries.values()));
  }

  getEntries(): CartEntry[] {
    return [...this.entriesSubject.value];
  }

  add(item: MenuItem): void {
    const current = this.entries.get(item.id);
    this.entries.set(item.id, {
      item,
      quantity: (current?.quantity ?? 0) + 1,
    });
    this.emit();
  }

  remove(itemId: string): void {
    const current = this.entries.get(itemId);
    if (!current) {
      return;
    }

    if (current.quantity <= 1) {
      this.entries.delete(itemId);
    } else {
      this.entries.set(itemId, { ...current, quantity: current.quantity - 1 });
    }
    this.emit();
  }

  clear(): void {
    this.entries.clear();
    this.emit();
  }

  private emit(): void {
    const entries = Array.from(this.entries.values());
    this.entriesSubject.next(entries);
    if (!this.restaurantId) {
      return;
    }

    if (typeof localStorage === 'undefined') {
      this.persistenceErrorSubject.next(true);
      return;
    }

    try {
      localStorage.setItem(this.getStorageKey(this.restaurantId), JSON.stringify(entries));
      this.persistenceErrorSubject.next(false);
    } catch (error) {
      this.persistenceErrorSubject.next(true);
      console.error('Unable to persist the order cart:', error);
    }
  }

  private readStoredEntries(restaurantId: string): CartEntry[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    try {
      const serialized = localStorage.getItem(this.getStorageKey(restaurantId));
      if (!serialized) {
        return [];
      }

      const parsed: unknown = JSON.parse(serialized);
      if (!Array.isArray(parsed)) {
        throw new TypeError('Stored order cart must be an array');
      }
      return parsed.filter(isCartEntry);
    } catch (error) {
      this.persistenceErrorSubject.next(true);
      console.error('Unable to restore the order cart:', error);
      return [];
    }
  }

  private getStorageKey(restaurantId: string): string {
    return `menu-smart-qr:order-cart:${encodeURIComponent(restaurantId)}`;
  }
}

function isCartEntry(value: unknown): value is CartEntry {
  if (!isRecord(value) || !isRecord(value['item'])) {
    return false;
  }
  const item = value['item'];
  return (
    typeof value['quantity'] === 'number' &&
    Number.isInteger(value['quantity']) &&
    value['quantity'] > 0 &&
    typeof item['id'] === 'string' &&
    typeof item['name'] === 'object' &&
    item['name'] !== null &&
    typeof item['description'] === 'object' &&
    item['description'] !== null &&
    typeof item['price'] === 'number' &&
    Number.isFinite(item['price']) &&
    typeof item['currency'] === 'string' &&
    Array.isArray(item['allergens']) &&
    typeof item['available'] === 'boolean' &&
    typeof item['recommended'] === 'boolean' &&
    typeof item['vegetarian'] === 'boolean' &&
    typeof item['vegan'] === 'boolean' &&
    typeof item['spicy'] === 'boolean' &&
    typeof item['glutenFree'] === 'boolean' &&
    typeof item['order'] === 'number'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
