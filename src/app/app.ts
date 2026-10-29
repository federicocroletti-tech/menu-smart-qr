import { Component } from "@angular/core";
import { IonApp } from "@ionic/angular/ion-app";
import { IonContent } from "@ionic/angular/ion-content";

import { MenuPageComponent } from "./features/menu/pages/menu-page/menu-page.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [IonApp, IonContent, MenuPageComponent],
  templateUrl: "./app.html",
  styleUrl: "./app.scss",
})
export class App {}
