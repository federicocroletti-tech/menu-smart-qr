import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';

import { TranslationService } from '../../../../core/services/translation.service';

@Component({
  selector: 'app-error-state',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './error-state.component.html',
  styleUrl: './error-state.component.scss',
})
export class ErrorStateComponent {
  @Output() retry = new EventEmitter<void>();

  constructor(public readonly translationService: TranslationService) {}
}
