import { provideIonicAngular } from "@ionic/angular";
import type { Routes } from "@angular/router";

export const featureRoutes: Routes = [
  {
    path: "",
    providers: [provideIonicAngular()],
    children: [
      {
        path: "admin",
        loadComponent: () =>
          import("./admin/admin-portal.component").then(
            (module) => module.AdminPortalComponent,
          ),
      },
      {
        path: "",
        loadComponent: () =>
          import("./menu/pages/menu-page/menu-page.component").then(
            (module) => module.MenuPageComponent,
          ),
      },
      { path: "**", redirectTo: "" },
    ],
  },
];
