import { Routes } from '@angular/router';
import { CombatCanvasComponent } from './combat-canvas/combat-canvas.component';
import { MainMenuComponent } from './main-menu/main-menu.component';
import { CharacterSelectComponent } from './character-select/character-select.component';

export const routes: Routes = [
  { path: '', component: MainMenuComponent },
  { path: 'select-character', component: CharacterSelectComponent },
  { path: 'game', component: CombatCanvasComponent },
];
