import type { Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: '',
    loadChildren: () =>
      import('./features/feature.routes').then((module) => module.featureRoutes),
  },
  { path: '**', redirectTo: '' },
];
