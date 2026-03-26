import { Injectable, signal } from '@angular/core';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  icon: string;
}

let nextId = 0;

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  show(message: string, type: ToastType = 'info', duration = 3200): void {
    const id = ++nextId;
    const icon = type === 'success' ? '✔' : type === 'error' ? '✖' : type === 'warning' ? '⚠' : 'ℹ';
    this.toasts.update(t => [...t, { id, message, type, icon }]);
    setTimeout(() => this.dismiss(id), duration);
  }

  dismiss(id: number): void {
    this.toasts.update(t => t.filter(x => x.id !== id));
  }

  success(message: string, duration?: number): void { this.show(message, 'success', duration); }
  error(message: string, duration?: number): void { this.show(message, 'error', duration); }
  warning(message: string, duration?: number): void { this.show(message, 'warning', duration); }
  info(message: string, duration?: number): void { this.show(message, 'info', duration); }
}
