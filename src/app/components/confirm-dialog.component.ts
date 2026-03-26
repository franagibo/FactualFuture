import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="confirm-backdrop" (click)="cancel.emit()"></div>
    <div class="confirm-modal" role="alertdialog" [attr.aria-label]="title()">
      <div class="confirm-icon">⚠</div>
      <h2 class="confirm-title">{{ title() }}</h2>
      <p class="confirm-body">{{ body() }}</p>
      <div class="confirm-actions">
        <button type="button" class="confirm-btn confirm-btn--cancel" (click)="cancel.emit()">
          {{ labelCancel() }}
        </button>
        <button type="button" class="confirm-btn confirm-btn--confirm" (click)="confirm.emit()">
          {{ labelConfirm() }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: contents;
    }

    .confirm-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.72);
      backdrop-filter: blur(5px);
      -webkit-backdrop-filter: blur(5px);
      z-index: 2000;
    }

    .confirm-modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 2001;
      width: 90vw;
      max-width: 400px;
      background: rgba(10, 8, 3, 0.98);
      border: 1px solid rgba(200, 158, 42, 0.55);
      border-radius: 18px;
      padding: 2rem 2rem 1.75rem;
      text-align: center;
      box-shadow:
        0 0 60px rgba(180, 120, 20, 0.3),
        0 20px 60px rgba(0,0,0,0.85),
        inset 0 1px 0 rgba(255,240,160,0.06);
      animation: confirmIn 0.3s cubic-bezier(0.34, 1.25, 0.64, 1) both;

      &::before {
        content: '';
        position: absolute;
        top: 0; left: 10%; right: 10%;
        height: 2px;
        background: linear-gradient(90deg, transparent, rgba(200,158,42,0.9), transparent);
        border-radius: 18px 18px 0 0;
      }
    }

    @keyframes confirmIn {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.88) translateY(10px); }
      to   { opacity: 1; transform: translate(-50%, -50%) scale(1)    translateY(0); }
    }

    .confirm-icon {
      font-size: 2rem;
      margin-bottom: 0.75rem;
      color: #f0c040;
      text-shadow: 0 0 20px rgba(240, 180, 40, 0.6);
      animation: iconPulse 2s ease-in-out infinite;
    }

    @keyframes iconPulse {
      0%, 100% { text-shadow: 0 0 20px rgba(240,180,40,0.6); }
      50%       { text-shadow: 0 0 36px rgba(255,220,60,1); }
    }

    .confirm-title {
      font-family: 'Cinzel', Georgia, serif;
      font-size: 1.2rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #f4d98a;
      margin: 0 0 0.75rem;
    }

    .confirm-body {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.88rem;
      line-height: 1.55;
      color: #a09070;
      margin: 0 0 1.5rem;
    }

    .confirm-actions {
      display: flex;
      gap: 10px;
      justify-content: center;
    }

    .confirm-btn {
      flex: 1;
      padding: 12px 20px;
      font-family: 'Cinzel', Georgia, serif;
      font-size: 0.9rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      border-radius: 12px;
      cursor: pointer;
      transition: transform 0.15s, filter 0.15s, box-shadow 0.18s;

      &:hover { transform: translateY(-2px); filter: brightness(1.12); }
      &:active { transform: translateY(0); }
    }

    .confirm-btn--cancel {
      color: #c8b880;
      background: linear-gradient(160deg, #2c2210, #1a1408);
      border: 1px solid rgba(158, 118, 34, 0.4);
      box-shadow: 0 4px 0 #0e0a04, 0 5px 14px rgba(0,0,0,0.4);
    }

    .confirm-btn--confirm {
      color: #f4d98a;
      background: linear-gradient(160deg, #7a3010, #5a2008);
      border: 1px solid rgba(220, 100, 50, 0.55);
      box-shadow: 0 4px 0 #280f04, 0 5px 14px rgba(0,0,0,0.4), 0 0 16px rgba(200,80,40,0.2);
      &:hover {
        box-shadow: 0 6px 0 #280f04, 0 8px 20px rgba(0,0,0,0.5), 0 0 28px rgba(220,100,50,0.4);
      }
    }
  `],
})
export class ConfirmDialogComponent {
  title = input.required<string>();
  body = input.required<string>();
  labelConfirm = input<string>('Confirm');
  labelCancel = input<string>('Cancel');

  confirm = output<void>();
  cancel = output<void>();
}
