import { Component, input, output } from '@angular/core';

export type VictoryPanelPhase = 'actComplete' | 'victory';

@Component({
  selector: 'app-victory-panel',
  standalone: true,
  template: `
    <div class="reward-panel victory-panel">
      <div class="reward-title">{{ phase() === 'actComplete' ? 'Sector clear!' : 'Mission complete!' }}</div>
      @if (phase() === 'actComplete') {
        <button type="button" class="btn-rest" (click)="advance.emit()">Next sector</button>
      } @else {
        <button type="button" class="btn-rest" (click)="toMenu.emit()">Command</button>
      }
    </div>
  `,
  styleUrl: '../combat-canvas.component.scss',
})
export class VictoryPanelComponent {
  phase = input.required<VictoryPanelPhase>();

  advance = output<void>();
  toMenu = output<void>();
}
