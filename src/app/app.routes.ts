import type { Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: 'admin',
    loadComponent: () =>
      import('./features/admin/admin-portal.component').then(
        (module) => module.AdminPortalComponent,
      ),
  },
  {
    path: '',
    loadComponent: () =>
      import('./features/menu/pages/menu-page/menu-page.component').then(
        (module) => module.MenuPageComponent,
      ),
  },
  { path: '**', redirectTo: '' },
];
