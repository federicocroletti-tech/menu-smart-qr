import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

import { TranslationService } from '../../../../core/services/translation.service';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  constructor(public readonly translationService: TranslationService) {}
}
