import { Component } from '@angular/core';

import { MenuPageComponent } from './features/menu/pages/menu-page/menu-page.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MenuPageComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
