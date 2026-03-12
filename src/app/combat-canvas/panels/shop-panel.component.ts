import { Component, input, output } from '@angular/core';
import type { GameState } from '../../../engine/types';

@Component({
  selector: 'app-shop-panel',
  standalone: true,
  template: `
    <div class="reward-panel shop-panel">
      <div class="reward-title">Shop</div>
      <div class="shop-gold">Credits: {{ gold() }}</div>
      @if (shopState(); as shop) {
        <div class="shop-cards">
          @for (cardId of shop.cardIds; track cardId) {
            <div class="shop-item" [attr.title]="getCardTooltip()(cardId)">
              <img class="shop-item-art" [src]="getCardArtUrl()(cardId)" alt="" />
              <div class="shop-item-info">
                <span class="shop-item-name">{{ getCardName()(cardId) }}</span>
                @if (getCardEffectDescriptionText()(cardId)) {
                  <span class="shop-item-desc">{{ getCardEffectDescriptionText()(cardId) }}</span>
                }
                <span class="shop-item-price">{{ shop.cardPrices[cardId] }}c</span>
              </div>
              <button
                type="button"
                class="btn-rest btn-shop-buy"
                [disabled]="gold() < (shop.cardPrices[cardId] || 0)"
                (click)="purchaseCard.emit(cardId)"
              >
                Buy
              </button>
            </div>
          }
        </div>
        <div class="shop-relics">
          @for (relicId of shop.relicIds; track relicId) {
            <div class="shop-item" [attr.title]="getRelicTooltip()(relicId)">
              <span class="shop-item-name">{{ getRelicName()(relicId) }}</span>
              <span class="shop-item-price">{{ shop.relicPrices[relicId] }}c</span>
              <button
                type="button"
                class="btn-rest btn-shop-buy"
                [disabled]="gold() < (shop.relicPrices[relicId] || 0)"
                (click)="purchaseRelic.emit(relicId)"
              >
                Buy
              </button>
            </div>
          }
        </div>
      }
      <div class="shop-actions">
        <button type="button" class="btn-rest" (click)="leaveShop.emit()">Leave</button>
      </div>
    </div>
  `,
  styleUrl: '../combat-canvas.component.scss',
})
export class ShopPanelComponent {
  shopState = input.required<GameState['shopState']>();
  gold = input.required<number>();
  getCardName = input.required<(id: string) => string>();
  getCardArtUrl = input.required<(id: string) => string>();
  getCardTooltip = input.required<(id: string) => string>();
  getCardEffectDescriptionText = input.required<(id: string) => string>();
  getRelicName = input.required<(id: string) => string>();
  getRelicTooltip = input.required<(id: string) => string>();

  purchaseCard = output<string>();
  purchaseRelic = output<string>();
  leaveShop = output<void>();
}
