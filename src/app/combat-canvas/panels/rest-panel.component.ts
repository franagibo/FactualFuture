import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-rest-panel',
  standalone: true,
  template: `
    <div class="rest-panel">
    <div class="rest-title">⚕️ Repair Bay</div>
    @if (playerHp() > 0 && playerMaxHp() > 0) {
        <div class="rest-hp-bar-wrap">
          <div class="rest-hp-bar" [style.width.%]="hpPercent()"></div>
          <span class="rest-hp-label">{{ playerHp() }} / {{ playerMaxHp() }} Hull</span>
        </div>
      }
      <div class="rest-actions">
       
      <button type="button" class="btn-rest" [disabled]="playerHp() >= playerMaxHp()" (click)="restHeal.emit()">
      ⚕ Restore Hull
        </button>
      </div>
      @if (removableCards().length > 0) {
        <div class="rest-subtitle">Remove a card from your deck:</div>
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
      }
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
  
  playerHp = input<number>(0);
  playerMaxHp = input<number>(0);
  hpPercent = computed(() => {
    const max = this.playerMaxHp();
    return max > 0 ? Math.round((this.playerHp() / max) * 100) : 0;
  });
}
