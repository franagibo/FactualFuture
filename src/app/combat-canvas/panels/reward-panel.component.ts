import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-reward-panel',
  standalone: true,
  template: `
    <div class="reward-panel">
    <div class="reward-title">✦ Choose a Card ✦</div>
      <div class="reward-cards">
        @for (cardId of choices(); track cardId; let i = $index) {
          <button
            type="button"
            class="reward-card"
            [class.chosen]="chosenCardId() === cardId"
            [class.fade-out]="chosenCardId() != null && chosenCardId() !== cardId"
            [attr.title]="getCardTooltip()(cardId)"
            [attr.aria-label]="'Choose card: ' + getCardName()(cardId) + ', option ' + (i + 1) + ' of ' + choices().length"
            (click)="chooseReward.emit(cardId)"
          >
          <div class="reward-card-art-wrap">
              <img class="reward-card-art" [src]="getCardArtUrl()(cardId)" alt="" />
              <div class="reward-card-shimmer"></div>
            </div>
            <span class="reward-card-name">{{ getCardName()(cardId) }}</span>
            @if (getCardEffectDescriptionText()(cardId)) {
              <span class="reward-card-desc">{{ getCardEffectDescriptionText()(cardId) }}</span>
            }
          </button>
        }
      </div>
    </div>
  `,
  styleUrl: '../combat-canvas.component.scss',
})
export class RewardPanelComponent {
  choices = input.required<string[]>();
  chosenCardId = input<string | null>(null);
  getCardName = input.required<(id: string) => string>();
  getCardArtUrl = input.required<(id: string) => string>();
  getCardTooltip = input.required<(id: string) => string>();
  getCardEffectDescriptionText = input.required<(id: string) => string>();

  chooseReward = output<string>();
}
