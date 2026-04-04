import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SelectedProjectService, Project } from '../../services/selected-project.service';
import { NotificationService } from '../../services/notification.service';
import { EngineApiService } from '../../services/engine-api.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule],
  // CommonModule includes DatePipe, AsyncPipe, NgIf, NgFor
  template: `
    <header class="header">
      <div class="header-inner">
        <!-- Logo & Brand -->
        <div class="brand" (click)="router.navigate(['/'])" style="cursor:pointer">
          <div class="logo">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="2" y="2" width="24" height="24" rx="6" stroke="var(--accent-cyan)" stroke-width="1.5" />
              <circle cx="9" cy="14" r="2.5" fill="var(--accent-cyan)" />
              <circle cx="19" cy="9" r="2.5" fill="var(--accent-green)" />
              <circle cx="19" cy="19" r="2.5" fill="var(--accent-violet)" />
              <line x1="11" y1="13" x2="17" y2="9.5" stroke="var(--accent-cyan)" stroke-width="1" opacity="0.6" />
              <line x1="11" y1="15" x2="17" y2="18.5" stroke="var(--accent-cyan)" stroke-width="1" opacity="0.6" />
            </svg>
          </div>
          <div class="brand-text">
            <h1 class="brand-name">Custom Pricing Workflow</h1>
            <span class="brand-version">v1.0</span>
          </div>
        </div>

        <!-- Navigation -->
        <nav class="nav">
          <a
            *ngFor="let item of navItems"
            class="nav-link"
            [class.active]="item.active"
            (click)="setActive(item)"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            <span class="nav-label">{{ item.label }}</span>
          </a>
        </nav>

        <!-- Right Actions -->
        <div class="actions">
          <div class="project-select-wrapper">
            <span class="project-select-icon">⊞</span>
            <select
              class="project-select"
              [(ngModel)]="selectedProjectId"
              (ngModelChange)="onProjectChange($event)"
              [disabled]="loading"
            >
              <option value="" disabled>
                {{ loading ? 'Loading…' : 'Select customer' }}
              </option>
              <option *ngFor="let p of projects" [value]="p.id">
                {{ p.accountNumber }} — {{ p.accountName }}
              </option>
            </select>
            <span class="project-select-arrow">▾</span>
          </div>
          <button
            class="btn-delete-project"
            *ngIf="selectedProjectId !== ''"
            title="Delete project"
            (click)="deleteProject()"
          >🗑</button>
          <div class="notif-wrapper">
            <button class="notif-btn" title="Notifications" (click)="toggleNotif()">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5A4.5 4.5 0 0 0 3.5 6v2.5L2 10h12l-1.5-1.5V6A4.5 4.5 0 0 0 8 1.5Z"
                      stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                <path d="M6.5 10.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" stroke-width="1.3"/>
              </svg>
              <span class="notif-badge" *ngIf="notif.unreadCount() > 0">{{ notif.unreadCount() }}</span>
            </button>
          </div>

          <button class="avatar-btn" title="User profile">
            <span class="avatar-initials">AB</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Notifications popup — must be outside <header> so its z-index:300 is in the root
         stacking context, above the backdrop's z-index:299 -->
    <div class="notif-popup" *ngIf="notifOpen">
      <div class="notif-header">
        <span class="notif-title">Notifications</span>
        <button class="notif-clear" (click)="notif.clear()" *ngIf="notif.notifications().length > 0">Clear</button>
      </div>
      <div class="notif-empty" *ngIf="notif.notifications().length === 0">
        No notifications yet
      </div>
      <div class="notif-list" *ngIf="notif.notifications().length > 0">
        <div class="notif-item" *ngFor="let n of notif.notifications()" [class.unread]="!n.read">
          <span class="notif-dot" *ngIf="!n.read"></span>
          <div class="notif-content">
            <span class="notif-msg">{{ n.message }}</span>
            <span class="notif-time">{{ n.timestamp | date:'HH:mm:ss' }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Notification backdrop (invisible, closes popup) -->
    <div class="notif-backdrop" *ngIf="notifOpen" (click)="closeNotif()"></div>

    <!-- DocuSign Dialog -->
    <div class="dialog-backdrop" *ngIf="docuSignOpen" (click)="closeDocuSign()"></div>
    <div class="dialog" *ngIf="docuSignOpen" role="dialog" aria-modal="true">
      <div class="dialog-header">
        <span class="dialog-title">Send for Signature</span>
        <button class="dialog-close" (click)="closeDocuSign()">✕</button>
      </div>
      <div class="dialog-body">
        <label class="field-label">Agreement Party</label>
        <input class="field-input" [(ngModel)]="ds.agreementParty" placeholder="e.g. Acme Corp" />
        <label class="field-label">Jurisdiction</label>
        <input class="field-input" [(ngModel)]="ds.jurisdiction" placeholder="e.g. State of California" />
        <label class="field-label" style="margin-top:12px;color:var(--accent-cyan)">Buyer</label>
        <label class="field-label">Name</label>
        <input class="field-input" [(ngModel)]="ds.buyerName" placeholder="Buyer full name" />
        <label class="field-label">Email</label>
        <input class="field-input" [(ngModel)]="ds.buyerEmail" placeholder="buyer@example.com" />
        <label class="field-label" style="margin-top:12px;color:var(--accent-green)">Seller</label>
        <label class="field-label">Name</label>
        <input class="field-input" [(ngModel)]="ds.sellerName" placeholder="Seller full name" />
        <label class="field-label">Email</label>
        <input class="field-input" [(ngModel)]="ds.sellerEmail" placeholder="seller@example.com" />
        <div class="field-error" *ngIf="dsError">{{ dsError }}</div>
        <div class="field-success" *ngIf="dsSuccess">{{ dsSuccess }}</div>
      </div>
      <div class="dialog-footer">
        <button class="btn-cancel" (click)="closeDocuSign()">Cancel</button>
        <button class="btn-ok" (click)="sendDocuSign()" [disabled]="dsSending">
          {{ dsSending ? 'Sending…' : 'Send' }}
        </button>
      </div>
    </div>

    <!-- New Project Dialog -->
    <div class="dialog-backdrop" *ngIf="dialogOpen" (click)="closeDialog()"></div>
    <div class="dialog" *ngIf="dialogOpen" role="dialog" aria-modal="true">
      <div class="dialog-header">
        <span class="dialog-title">New Customer</span>
        <button class="dialog-close" (click)="closeDialog()">✕</button>
      </div>
      <div class="dialog-body">
        <label class="field-label">Account Number</label>
        <input
          class="field-input"
          [(ngModel)]="newAccountNumber"
          placeholder="e.g. ACC-0031"
          (keydown.enter)="createProject()"
        />
        <label class="field-label">Account Name</label>
        <input
          class="field-input"
          [(ngModel)]="newAccountName"
          placeholder="e.g. Acme Corp"
          (keydown.enter)="createProject()"
        />
        <div class="field-error" *ngIf="createError">{{ createError }}</div>
      </div>
      <div class="dialog-footer">
        <button class="btn-cancel" (click)="closeDialog()">Cancel</button>
        <button class="btn-ok" (click)="createProject()" [disabled]="creating">
          {{ creating ? 'Creating…' : 'Create' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: var(--header-height);
      z-index: 100;
      background: rgba(8, 12, 20, 0.85);
      backdrop-filter: blur(20px) saturate(1.4);
      -webkit-backdrop-filter: blur(20px) saturate(1.4);
      border-bottom: 1px solid var(--border-subtle);
      animation: slideDown 0.4s var(--ease-out-expo) both;
    }

    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-100%); }
      to { opacity: 1; transform: translateY(0); }
    }

    .header-inner {
      max-width: 1400px;
      margin: 0 auto;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      gap: 24px;
    }

    /* Brand */
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .logo {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(56, 189, 248, 0.06);
      border: 1px solid rgba(56, 189, 248, 0.12);
      border-radius: 10px;
      transition: all 0.3s ease;
    }

    .logo:hover {
      background: rgba(56, 189, 248, 0.1);
      border-color: rgba(56, 189, 248, 0.25);
      transform: scale(1.05);
    }

    .brand-text {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .brand-name {
      font-size: 17px;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.4px;
    }

    .brand-version {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-dim);
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      padding: 1px 6px;
      border-radius: 6px;
      letter-spacing: 0.5px;
    }

    /* Navigation */
    .nav {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .nav-link {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-muted);
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s ease;
      user-select: none;
      position: relative;
    }

    .nav-link:hover {
      color: var(--text-secondary);
      background: rgba(148, 163, 184, 0.06);
    }

    .nav-link.active {
      color: var(--accent-cyan);
      background: var(--accent-cyan-muted);
    }

    .nav-link.active::after {
      content: '';
      position: absolute;
      bottom: -12px;
      left: 50%;
      transform: translateX(-50%);
      width: 20px;
      height: 2px;
      background: var(--accent-cyan);
      border-radius: 1px;
    }

    .nav-icon {
      font-size: 14px;
      line-height: 1;
    }

    .nav-label {
      line-height: 1;
    }

    /* Actions */
    .actions {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-shrink: 0;
    }

    .project-select-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .project-select-icon {
      position: absolute;
      left: 10px;
      font-size: 13px;
      color: var(--accent-cyan);
      pointer-events: none;
      line-height: 1;
    }

    .project-select-arrow {
      position: absolute;
      right: 10px;
      font-size: 10px;
      color: var(--text-muted);
      pointer-events: none;
    }

    .project-select {
      appearance: none;
      -webkit-appearance: none;
      padding: 6px 30px 6px 30px;
      background: var(--bg-surface);
      border: 1px solid var(--border-medium);
      border-radius: 8px;
      color: var(--text-secondary);
      font-size: 12px;
      font-family: var(--font-body);
      cursor: pointer;
      transition: border-color 0.2s ease, color 0.2s ease;
      max-width: 220px;
    }

    .project-select:hover:not(:disabled) {
      border-color: var(--accent-cyan);
      color: var(--text-primary);
    }

    .project-select:focus {
      outline: none;
      border-color: var(--accent-cyan);
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.15);
    }

    .project-select:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .project-select option {
      background: var(--bg-card);
      color: var(--text-primary);
    }

    .btn-delete-project {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 1px solid rgba(248, 113, 113, 0.3);
      background: transparent;
      color: #f87171;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      flex-shrink: 0;
    }

    .btn-delete-project:hover {
      background: rgba(248, 113, 113, 0.1);
      border-color: #f87171;
    }

    .avatar-btn {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      border: 1.5px solid var(--border-medium);
      background: linear-gradient(135deg, var(--bg-elevated), var(--bg-card));
      color: var(--text-secondary);
      font-size: 11px;
      font-weight: 700;
      font-family: var(--font-mono);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .avatar-btn:hover {
      border-color: var(--accent-cyan);
      color: var(--accent-cyan);
      transform: scale(1.05);
    }

    /* Dialog */
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 200;
    }

    .dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 201;
      width: 360px;
      background: var(--bg-card);
      border: 1px solid var(--border-medium);
      border-radius: 14px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 20px 14px;
      border-bottom: 1px solid var(--border-subtle);
    }

    .dialog-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .dialog-close {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 13px;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 6px;
      transition: color 0.2s;
    }

    .dialog-close:hover { color: var(--text-primary); }

    .dialog-body {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 18px 20px;
    }

    .field-label {
      font-size: 11px;
      font-family: var(--font-mono);
      letter-spacing: 0.8px;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-top: 6px;
    }

    .field-input {
      width: 100%;
      padding: 9px 12px;
      background: var(--bg-surface);
      border: 1px solid var(--border-medium);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 13px;
      font-family: var(--font-body);
      box-sizing: border-box;
      transition: border-color 0.2s;
    }

    .field-input:focus {
      outline: none;
      border-color: var(--accent-cyan);
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.15);
    }

    .field-error {
      font-size: 12px;
      color: #f87171;
      margin-top: 4px;
    }

    .field-success {
      font-size: 12px;
      color: var(--accent-green);
      margin-top: 4px;
    }

    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 14px 20px 18px;
      border-top: 1px solid var(--border-subtle);
    }

    .btn-cancel {
      padding: 8px 18px;
      background: transparent;
      border: 1px solid var(--border-medium);
      border-radius: 8px;
      color: var(--text-muted);
      font-size: 13px;
      font-family: var(--font-body);
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-cancel:hover { border-color: var(--text-muted); color: var(--text-primary); }

    .btn-ok {
      padding: 8px 20px;
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      font-family: var(--font-body);
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .btn-ok:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-ok:not(:disabled):hover { opacity: 0.9; }

    /* Notifications */
    .notif-wrapper {
      position: relative;
    }

    .notif-btn {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      border: 1.5px solid var(--border-medium);
      background: linear-gradient(135deg, var(--bg-elevated), var(--bg-card));
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      transition: all 0.2s ease;
      flex-shrink: 0;
    }

    .notif-btn:hover {
      border-color: var(--accent-cyan);
      color: var(--accent-cyan);
      transform: scale(1.05);
    }

    .notif-badge {
      position: absolute;
      top: -5px;
      right: -5px;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      background: #ef4444;
      border-radius: 8px;
      font-size: 9px;
      font-weight: 700;
      font-family: var(--font-mono);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
    }

    .notif-popup {
      position: fixed;
      top: calc(var(--header-height) + 4px);
      right: 80px;
      width: 340px;
      max-height: 400px;
      background: var(--bg-card);
      border: 1px solid var(--border-medium);
      border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
      z-index: 300;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .notif-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px 10px;
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }

    .notif-title {
      font-size: 12px;
      font-weight: 700;
      font-family: var(--font-mono);
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .notif-clear {
      background: none;
      border: none;
      font-size: 11px;
      color: var(--text-dim);
      cursor: pointer;
      font-family: var(--font-body);
      padding: 2px 6px;
      border-radius: 4px;
      transition: color 0.2s;
    }
    .notif-clear:hover { color: #f87171; }

    .notif-empty {
      padding: 32px 16px;
      text-align: center;
      font-size: 12px;
      color: var(--text-dim);
      font-family: var(--font-mono);
    }

    .notif-list {
      overflow-y: auto;
      flex: 1;
    }

    .notif-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border-subtle);
      transition: background 0.15s;
    }
    .notif-item:last-child { border-bottom: none; }
    .notif-item:hover { background: var(--bg-surface); }
    .notif-item.unread { background: rgba(56, 189, 248, 0.04); }

    .notif-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-cyan);
      flex-shrink: 0;
      margin-top: 5px;
    }

    .notif-content {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }

    .notif-msg {
      font-size: 12px;
      color: var(--text-secondary);
      font-family: var(--font-mono);
      word-break: break-word;
    }

    .notif-time {
      font-size: 10px;
      color: var(--text-dim);
      font-family: var(--font-mono);
    }

    .notif-backdrop {
      position: fixed;
      inset: 0;
      z-index: 299;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .nav-label { display: none; }
      .brand-version { display: none; }
      .project-select { max-width: 140px; }
      .header-inner { padding: 0 16px; }
    }
  `],
})
export class HeaderComponent implements OnInit {
  navItems = [
    { icon: '＋', label: 'New', active: false },
    { icon: '⊞', label: 'Dashboard', active: false },
    { icon: '⚡', label: 'DocuSign', active: false },
    { icon: '⊙', label: 'Workflows', active: false },
  ];

  dialogOpen = false;
  newAccountNumber = '';
  newAccountName = '';
  creating = false;
  createError = '';

  docuSignOpen = false;
  dsSending = false;
  dsError = '';
  dsSuccess = '';
  ds = { agreementParty: '', jurisdiction: '', buyerName: '', buyerEmail: '', sellerName: '', sellerEmail: '' };

  projects: Project[] = [];
  selectedProjectId: number | '' = '';
  loading = false;

  notifOpen = false;

  constructor(
    private engine: EngineApiService,
    private selectedProject: SelectedProjectService,
    public router: Router,
    public notif: NotificationService,
    private cdr: ChangeDetectorRef,
  ) {}

  toggleNotif(): void {
    this.notifOpen = !this.notifOpen;
    if (this.notifOpen) this.notif.markAllRead();
  }

  closeNotif(): void {
    this.notifOpen = false;
  }

  ngOnInit(): void {
    this.loading = true;
    this.engine.get<Project[]>('/api/projects').subscribe({
      next: (data) => { this.projects = data; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  deleteProject(): void {
    const project = this.projects.find((p) => p.id === Number(this.selectedProjectId));
    if (!project) return;
    if (!confirm(`Delete project "${project.accountNumber} — ${project.accountName}"? This cannot be undone.`)) return;
    this.engine.delete(`/api/projects/${this.selectedProjectId}`).subscribe({
      next: () => {
        this.projects = this.projects.filter((p) => p.id !== Number(this.selectedProjectId));
        this.selectedProjectId = '';
        this.selectedProject.select(null);
      },
    });
  }

  onProjectChange(id: number | ''): void {
    const project = this.projects.find((p) => p.id === Number(id)) ?? null;
    this.selectedProject.select(project);
  }

  setActive(item: any): void {
    if (item.label === 'New') { this.openDialog(); return; }
    if (item.label === 'DocuSign') { this.openDocuSign(); return; }
    if (item.label === 'Workflows') { this.router.navigate(['/workflows']); return; }
    this.navItems.forEach((i) => (i.active = false));
    item.active = true;
  }

  openDocuSign(): void {
    this.ds = { agreementParty: 'My Project', jurisdiction: 'NJ', buyerName: 'Arian', buyerEmail: 'abajollari@gmail.com', sellerName: 'Ari', sellerEmail: 'arianb1@hotmail.com' };
    this.dsError = '';
    this.dsSuccess = '';
    this.docuSignOpen = true;
  }

  closeDocuSign(): void {
    this.docuSignOpen = false;
  }

  sendDocuSign(): void {
    const { agreementParty, jurisdiction, buyerName, buyerEmail, sellerName, sellerEmail } = this.ds;
    if (!agreementParty.trim() || !jurisdiction.trim() || !buyerName.trim() || !buyerEmail.trim() || !sellerName.trim() || !sellerEmail.trim()) {
      this.dsError = 'All fields are required.';
      return;
    }
    this.dsSending = true;
    this.dsError = '';
    this.dsSuccess = '';
    this.engine.post<{ envelopeId: string }>('/api/docusign/send', {
      agreementParty: agreementParty.trim(),
      jurisdiction: jurisdiction.trim(),
      buyer: { name: buyerName.trim(), email: buyerEmail.trim() },
      seller: { name: sellerName.trim(), email: sellerEmail.trim() },
    }).subscribe({
      next: (res) => {
        this.dsSending = false;
        this.dsSuccess = `Sent! Envelope ID: ${res.envelopeId}`;
      },
      error: (err) => {
        this.dsError = err.error?.error ?? 'Failed to send envelope.';
        this.dsSending = false;
        console.error('DocuSign error:', err);
      },
    });
  }

  openDialog(): void {
    this.newAccountNumber = '';
    this.newAccountName = '';
    this.createError = '';
    this.dialogOpen = true;
  }

  closeDialog(): void {
    this.dialogOpen = false;
  }

  createProject(): void {
    if (!this.newAccountNumber.trim() || !this.newAccountName.trim()) {
      this.createError = 'Both fields are required.';
      return;
    }
    this.creating = true;
    this.createError = '';
    this.engine.get<{ activityKey: string; nodeType: string }[]>('/api/workflow/activities').subscribe({
      next: (activities) => {
        const startActivity = activities.find(a => a.nodeType === 'start');
        if (!startActivity) {
          this.createError = 'Active workflow has no start activity.';
          this.creating = false;
          return;
        }
        this.engine.post<Project>('/api/projects', {
          accountNumber: this.newAccountNumber.trim(),
          accountName: this.newAccountName.trim(),
          activity: startActivity.activityKey,
        }).subscribe({
          next: (created) => {
            this.projects = [...this.projects, created];
            this.selectedProjectId = created.id;
            this.selectedProject.select(created);
            this.creating = false;
            this.dialogOpen = false;
          },
          error: (err) => {
            this.createError = err.error?.error ?? 'Failed to create project.';
            this.creating = false;
          },
        });
      },
      error: () => {
        this.createError = 'Could not load active workflow.';
        this.creating = false;
      },
    });
  }
}
