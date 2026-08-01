import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { SupportedLanguage } from '../../../../core/models/i18n.model';
import { TranslationService } from '../../../../core/services/translation.service';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './language-selector.component.html',
  styleUrl: './language-selector.component.scss',
})
export class LanguageSelectorComponent {
  readonly languages: SupportedLanguage[];

  constructor(public readonly translationService: TranslationService) {
    this.languages = this.translationService.getSupportedLanguages();
  }

  get selectedLanguage(): SupportedLanguage {
    return this.translationService.getCurrentLanguage();
  }

  set selectedLanguage(language: SupportedLanguage) {
    this.translationService.setLanguage(language);
  }
}
