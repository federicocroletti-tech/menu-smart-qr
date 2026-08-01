import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

import { TranslationService } from '../../../../core/services/translation.service';

@Component({
  selector: 'app-loading-state',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loading-state.component.html',
  styleUrl: './loading-state.component.scss',
})
export class LoadingStateComponent {
  constructor(public readonly translationService: TranslationService) {}
}
