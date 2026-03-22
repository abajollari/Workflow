import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <footer class="footer">
      <div class="footer-inner">
        <div class="footer-left">
          <span class="footer-brand">Custom Pricing Workflow</span>
          <span class="footer-sep">·</span>
          <span class="footer-copy">&copy; {{ currentYear }}</span>
          <span class="footer-sep">·</span>
          <span class="footer-meta"></span>
        </div>

        <div class="footer-center">
          <div class="footer-stats">
            <!-- <div class="stat-item" *ngFor="let stat of stats">
              <span class="stat-value" [style.color]="stat.color">{{ stat.value }}</span>
              <span class="stat-label">{{ stat.label }}</span>
            </div> -->
          </div>
        </div>

        <div class="footer-right">
          <a class="footer-link" *ngFor="let link of links" [title]="link.label">
            {{ link.icon }}
          </a>
          <div class="footer-env">
            <span class="env-dot"></span>
            <span class="env-text">DEV</span>
          </div>
        </div>
      </div>
    </footer>
  `,
  styles: [`
    .footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: var(--footer-height);
      z-index: 100;
      background: rgba(5, 8, 16, 0.9);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-top: 1px solid var(--border-subtle);
      animation: slideUp 0.4s var(--ease-out-expo) 0.2s both;
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(100%); }
      to { opacity: 1; transform: translateY(0); }
    }

    .footer-inner {
      max-width: 1400px;
      margin: 0 auto;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      gap: 16px;
    }

    .footer-left {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .footer-brand {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      letter-spacing: 0.2px;
    }

    .footer-sep {
      color: var(--border-medium);
      font-size: 10px;
    }

    .footer-copy,
    .footer-meta {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-dim);
      letter-spacing: 0.3px;
    }

    /* Stats */
    .footer-center {
      flex: 1;
      display: flex;
      justify-content: center;
    }

    .footer-stats {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .stat-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .stat-value {
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 700;
    }

    .stat-label {
      font-size: 10px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.8px;
      font-family: var(--font-mono);
    }

    /* Right */
    .footer-right {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .footer-link {
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      font-size: 13px;
      color: var(--text-dim);
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .footer-link:hover {
      background: rgba(148, 163, 184, 0.08);
      color: var(--text-secondary);
    }

    .footer-env {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 2px 8px;
      background: rgba(245, 158, 11, 0.06);
      border: 1px solid rgba(245, 158, 11, 0.1);
      border-radius: 4px;
      margin-left: 4px;
    }

    .env-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--accent-amber);
    }

    .env-text {
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 700;
      color: var(--accent-amber);
      letter-spacing: 1px;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .footer-center { display: none; }
      .footer-meta { display: none; }
      .footer-inner { padding: 0 16px; }
    }
  `],
})
export class FooterComponent {
  currentYear = new Date().getFullYear();

  stats = [
    { value: '15', label: 'nodes', color: 'var(--accent-cyan)' },
    { value: '18', label: 'edges', color: 'var(--accent-violet)' },
    { value: '3', label: 'loops', color: 'var(--accent-amber)' },
  ];

  links = [
    { icon: '📖', label: 'Docs' },
    { icon: '⚙️', label: 'API' },
    { icon: '💬', label: 'Help' },
  ];
}
