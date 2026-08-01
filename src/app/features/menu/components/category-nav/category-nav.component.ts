import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import type { MenuCategory } from '../../../../core/models/menu.model';
import { LocalizedTextPipe } from '../../../../shared/pipes/localized-text.pipe';

@Component({
  selector: 'app-category-nav',
  standalone: true,
  imports: [CommonModule, LocalizedTextPipe],
  templateUrl: './category-nav.component.html',
  styleUrl: './category-nav.component.scss',
})
export class CategoryNavComponent {
  @Input() categories: MenuCategory[] = [];
  @Input() activeCategoryId: string | null = null;
  @Output() categorySelect = new EventEmitter<string>();
}
