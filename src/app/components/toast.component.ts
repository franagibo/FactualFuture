import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-container" aria-live="polite" aria-atomic="false">
      @for (toast of toastSvc.toasts(); track toast.id) {
        <div class="toast toast--{{ toast.type }}" (click)="toastSvc.dismiss(toast.id)" role="alert">
          <span class="toast-icon">{{ toast.icon }}</span>
          <span class="toast-msg">{{ toast.message }}</span>
          <button class="toast-close" type="button" aria-label="Dismiss">✕</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
      max-width: 340px;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 13px 16px;
      border-radius: 12px;
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.88rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      color: #f0e8d0;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: 0 8px 28px rgba(0,0,0,0.6), 0 2px 0 rgba(255,255,255,0.04) inset;
      pointer-events: all;
      cursor: pointer;
      animation: toastIn 0.32s cubic-bezier(0.34, 1.2, 0.64, 1) both;
      border: 1px solid transparent;
    }

    @keyframes toastIn {
      from { opacity: 0; transform: translateX(60px) scale(0.88); }
      to   { opacity: 1; transform: translateX(0) scale(1); }
    }

    .toast--info {
      background: rgba(20, 15, 40, 0.95);
      border-color: rgba(140, 100, 220, 0.45);
    }
    .toast--success {
      background: rgba(10, 36, 20, 0.96);
      border-color: rgba(60, 200, 100, 0.5);
      color: #a0f0b8;
    }
    .toast--warning {
      background: rgba(36, 28, 8, 0.96);
      border-color: rgba(220, 160, 30, 0.5);
      color: #f0d080;
    }
    .toast--error {
      background: rgba(40, 10, 10, 0.96);
      border-color: rgba(220, 60, 60, 0.5);
      color: #f09090;
    }

    .toast-icon {
      font-size: 1em;
      flex-shrink: 0;
    }

    .toast-msg {
      flex: 1;
    }

    .toast-close {
      font-size: 0.75rem;
      opacity: 0.5;
      padding: 2px 4px;
      cursor: pointer;
      background: none;
      border: none;
      color: inherit;
      flex-shrink: 0;
      transition: opacity 0.15s;
      &:hover { opacity: 1; }
    }
  `],
})
export class ToastComponent {
  toastSvc = inject(ToastService);
}
