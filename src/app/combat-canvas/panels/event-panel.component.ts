import { Component, input, output } from '@angular/core';
import type { GameState } from '../../../engine/types';

@Component({
  selector: 'app-event-panel',
  standalone: true,
  template: `
    <div class="reward-panel event-panel">
    <div class="reward-title">◈ Encounter</div>
      @if (eventState()?.text) {
        <p class="event-text">{{ eventState()?.text }}</p>
      }
      <div class="event-choices">
        @for (choice of (eventState()?.choices ?? []); track $index) {
          <button type="button" class="btn-rest" (click)="eventChoice.emit($index)">
            {{ choice.text }}
          </button>
        }
      </div>
    </div>
  `,
  styleUrl: '../combat-canvas.component.scss',
})
export class EventPanelComponent {
  eventState = input.required<GameState['eventState']>();

  eventChoice = output<number>();
}
