import { Component, input, output } from '@angular/core';

export type VictoryPanelPhase = 'actComplete' | 'victory';

@Component({
  selector: 'app-victory-panel',
  standalone: true,
  template: `
    <div class="reward-panel victory-panel">
    <div class="reward-title">
        {{ phase() === 'actComplete' ? '✦ Sector Cleared ✦' : '★ Mission Complete ★' }}
      </div>
      <div class="victory-subtitle">
        {{ phase() === 'actComplete'
          ? 'The path forward is open.'
          : 'You have conquered all who stood before you.' }}
      </div>
      @if (phase() === 'actComplete') { <button type="button" class="btn-rest" (click)="advance.emit()">
          Advance →
        </button> <button type="button" class="btn-rest" (click)="advance.emit()">Next sector</button>
      } @else {
        <button type="button" class="btn-rest" (click)="toMenu.emit()">
          Return to Command
        </button>
      }
    </div>
  `,
  styles: [`
      .victory-subtitle {
        font-size: 0.88rem;
        color: rgba(160, 255, 180, 0.65);
        text-align: center;
        margin: -6px 26px 20px;
        letter-spacing: 0.02em;
        font-style: italic;
      }
    `],
  styleUrl: '../combat-canvas.component.scss',
})
export class VictoryPanelComponent {
  phase = input.required<VictoryPanelPhase>();

  advance = output<void>();
  toMenu = output<void>();
}
