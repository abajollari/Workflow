import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { EngineApiService } from '../../services/engine-api.service';

interface WorkflowVersion {
  id: number;
  name: string;
  description: string | null;
  isActive: 0 | 1;
  createdAt: string;
}


@Component({
  selector: 'app-workflows',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Workflows</h1>
          <p class="page-sub">Manage and activate workflow versions</p>
        </div>
        <div class="header-actions">
          <span class="chip">{{ versions.length }} version{{ versions.length !== 1 ? 's' : '' }}</span>
          <button class="btn-create" (click)="createWorkflow()">+ Create Workflow</button>
        </div>
      </div>


<div class="version-list" *ngIf="!loading">
        <div
          class="version-card"
          *ngFor="let v of versions"
          [class.active]="v.isActive"
        >
          <div class="card-left">
            <div class="status-dot" [class.on]="v.isActive"></div>
            <div class="card-info">
              <div class="card-name">Version {{ v.name }}</div>
              <div class="card-desc">{{ v.description || '—' }}</div>
              <div class="card-date">Created {{ v.createdAt | date:'mediumDate' }}</div>
            </div>
          </div>

          <div class="card-right">
            <span class="badge" [class.badge-active]="v.isActive" [class.badge-inactive]="!v.isActive">
              {{ v.isActive ? 'Active' : 'Inactive' }}
            </span>
            <button class="btn-edit" (click)="editWorkflow(v.id)">Edit</button>
            <button
              class="btn-activate"
              *ngIf="!v.isActive"
              [disabled]="activating"
              (click)="activate(v.id)"
            >
              {{ activating ? 'Activating…' : 'Set Active' }}
            </button>
            <button
              class="btn-deactivate"
              *ngIf="v.isActive"
              [disabled]="activating"
              (click)="deactivate(v.id)"
            >
              {{ activating ? 'Updating…' : 'Set Inactive' }}
            </button>
          </div>
        </div>
      </div>

      <div class="loading" *ngIf="loading">Loading…</div>
      <div class="error" *ngIf="error">{{ error }}</div>
    </div>
  `,
  styles: [`
    .page {
      max-width: 780px;
      margin: 0 auto;
      padding: 40px 24px;
      animation: fadeIn 0.4s ease both;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 32px;
      gap: 16px;
    }

    .page-title {
      font-size: 26px;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.6px;
      margin: 0 0 4px;
    }

    .page-sub {
      font-size: 13px;
      color: var(--text-muted);
      margin: 0;
    }

    .chip {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-muted);
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      padding: 4px 12px;
      border-radius: 14px;
      white-space: nowrap;
    }

    .version-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .version-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      transition: border-color 0.2s ease;
      gap: 16px;
    }

    .version-card.active {
      border-color: rgba(56, 189, 248, 0.3);
      background: linear-gradient(135deg, var(--bg-card), rgba(56, 189, 248, 0.04));
    }

    .card-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--border-medium);
      flex-shrink: 0;
      transition: background 0.2s;
    }

    .status-dot.on {
      background: #10b981;
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
    }

    .card-name {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 3px;
    }

    .card-desc {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 4px;
    }

    .card-date {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-dim);
    }

    .card-right {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .badge {
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 1px;
      padding: 3px 10px;
      border-radius: 10px;
      text-transform: uppercase;
    }

    .badge-active {
      color: #10b981;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
    }

    .badge-inactive {
      color: var(--text-dim);
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
    }

    .btn-edit {
      padding: 7px 16px;
      background: transparent;
      border: 1px solid var(--border-medium);
      border-radius: 8px;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-body);
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-edit:hover {
      border-color: var(--accent-cyan);
      color: var(--accent-cyan);
    }

    .btn-activate {
      padding: 7px 16px;
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-body);
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .btn-activate:hover:not(:disabled) { opacity: 0.85; }
    .btn-activate:disabled { opacity: 0.4; cursor: not-allowed; }

    .btn-deactivate {
      padding: 7px 16px;
      background: transparent;
      border: 1px solid rgba(248, 113, 113, 0.4);
      border-radius: 8px;
      color: #f87171;
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-body);
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-deactivate:hover:not(:disabled) {
      background: rgba(248, 113, 113, 0.08);
      border-color: #f87171;
    }

    .btn-deactivate:disabled { opacity: 0.4; cursor: not-allowed; }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .btn-create {
      padding: 8px 16px;
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-body);
      cursor: pointer;
      transition: opacity 0.2s;
      white-space: nowrap;
    }

    .btn-create:hover { opacity: 0.85; }

.loading, .error {
      font-size: 13px;
      color: var(--text-muted);
      padding: 40px 0;
      text-align: center;
    }

    .error { color: #f87171; }
  `],
})
export class WorkflowsComponent implements OnInit {
  private engine = inject(EngineApiService);
  private router = inject(Router);

  versions: WorkflowVersion[] = [];
  loading = false;
  activating = false;
  error = '';

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.error = '';
    this.engine.get<WorkflowVersion[]>(`/api/workflow/versions`).subscribe({
      next: (data) => { this.versions = data; this.loading = false; },
      error: () => { this.error = 'Failed to load workflow versions.'; this.loading = false; },
    });
  }

  createWorkflow(): void { this.router.navigate(['/workflows/create']); }
  editWorkflow(id: number): void { this.router.navigate(['/workflows', id, 'edit']); }

  activate(id: number): void {
    this.activating = true;
    this.engine.patch<WorkflowVersion>(`/api/workflow/versions/${id}/activate`, {}).subscribe({
      next: () => { this.activating = false; this.load(); },
      error: () => { this.activating = false; },
    });
  }

  deactivate(id: number): void {
    this.activating = true;
    this.engine.patch<WorkflowVersion>(`/api/workflow/versions/${id}/deactivate`, {}).subscribe({
      next: () => { this.activating = false; this.load(); },
      error: () => { this.activating = false; },
    });
  }
}
