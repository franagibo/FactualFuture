import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-rest-panel',
  standalone: true,
  template: `
    <div class="rest-panel">
      <div class="rest-title">Repair bay</div>
      <div class="rest-actions">
        <button type="button" class="btn-rest" (click)="restHeal.emit()">Repair hull</button>
      </div>
      <div class="rest-subtitle">Jettison a card from your loadout:</div>
      <div class="rest-cards">
        @for (cardId of removableCards(); track cardId) {
          <button
            type="button"
            class="btn-rest-card"
            [attr.title]="getCardTooltip()(cardId)"
            (click)="removeCard.emit(cardId)"
          >
            <img class="rest-card-art" [src]="getCardArtUrl()(cardId)" alt="" />
            <span class="rest-card-name">{{ getCardName()(cardId) }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styleUrl: '../combat-canvas.component.scss',
})
export class RestPanelComponent {
  removableCards = input.required<string[]>();
  getCardName = input.required<(id: string) => string>();
  getCardArtUrl = input.required<(id: string) => string>();
  getCardTooltip = input.required<(id: string) => string>();

  restHeal = output<void>();
  removeCard = output<string>();
}
