import { Routes } from '@angular/router';
import { CombatCanvasComponent } from './combat-canvas/combat-canvas.component';
import { MainMenuComponent } from './main-menu/main-menu.component';

export const routes: Routes = [
  { path: '', component: MainMenuComponent },
  { path: 'game', component: CombatCanvasComponent },
];
