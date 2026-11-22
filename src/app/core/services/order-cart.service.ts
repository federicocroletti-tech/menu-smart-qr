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

  readonly entries$ = this.entriesSubject.asObservable();

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
    this.entriesSubject.next(Array.from(this.entries.values()));
  }
}
