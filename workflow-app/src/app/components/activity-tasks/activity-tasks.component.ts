import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActionType, InputField } from '../../models/workflow.model';
import { EngineApiService } from '../../services/engine-api.service';

type TaskStatus = 'new' | 'in_progress' | 'done';

interface TaskItem {
  id: number | null;
  activityTaskId: number;
  title: string;
  description: string | null;
  orderIndex: number;
  completed: number;
  completedAt: string | null;
  status: TaskStatus;
}

const STATUS_CYCLE: TaskStatus[] = ['new', 'in_progress', 'done'];

const STATUS_CONFIG: Record<TaskStatus, { label: string; class: string }> = {
  new:         { label: 'New',         class: 'status-new' },
  in_progress: { label: 'In Progress', class: 'status-in-progress' },
  done:        { label: 'Done',        class: 'status-done' },
};

@Component({
  selector: 'app-activity-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Run dialog popup -->
    <div class="dialog-backdrop" *ngIf="dialogOpen" (click)="closeDialog()">
      <div class="dialog-card" (click)="$event.stopPropagation()">
        <div class="dialog-header">
          <span class="dialog-title">Run — {{ activityLabel }}</span>
          <button class="dialog-close" (click)="closeDialog()">✕</button>
        </div>
        <div class="dialog-body">
          <div class="task-loading" *ngIf="manualRunning">
            <span class="spinner"></span>
            <span>Running…</span>
          </div>
          <ng-container *ngIf="!manualRunning">
            <ng-container *ngIf="inputSchema && inputSchema.length > 0; else simpleRunDialog">
              <form class="input-form" (ngSubmit)="submitWithInputs()">
                <div class="input-form-fields">
                  <div class="input-field-row" *ngFor="let field of inputSchema">
                    <label class="input-field-label">
                      {{ field.label }}<span *ngIf="field.required" class="req">*</span>
                    </label>
                    <textarea
                      *ngIf="field.type === 'textarea'"
                      class="input-field-control"
                      [(ngModel)]="inputValues[field.key]"
                      [name]="field.key"
                      [placeholder]="field.placeholder || ''"
                      rows="3"
                    ></textarea>
                    <input
                      *ngIf="field.type !== 'textarea'"
                      class="input-field-control"
                      [(ngModel)]="inputValues[field.key]"
                      [name]="field.key"
                      [type]="field.type"
                      [placeholder]="field.placeholder || ''"
                    />
                  </div>
                </div>
                <div class="input-form-error" *ngIf="inputError">{{ inputError }}</div>
                <div class="dialog-footer">
                  <button class="cancel-btn" type="button" (click)="closeDialog()">Cancel</button>
                  <button class="run-btn" type="submit">Submit</button>
                </div>
              </form>
            </ng-container>
            <ng-template #simpleRunDialog>
              <p class="run-hint">Click Run to trigger this activity.</p>
              <div class="dialog-footer">
                <button class="cancel-btn" type="button" (click)="closeDialog()">Cancel</button>
                <button class="run-btn" type="button" (click)="triggerManual()">Run</button>
              </div>
            </ng-template>
          </ng-container>
        </div>
      </div>
    </div>

    <div class="task-panel">
      <div class="task-panel-header">
        <div class="task-panel-title">
          <span class="task-icon">✓</span>
          Tasks — <span class="step-name">{{ activityLabel }}</span>
        </div>
        <div class="header-right">
          <button
            *ngIf="actionType === 'manual' && isActive"
            class="run-btn header-run-btn"
            (click)="openDialog()"
          >▶ Run</button>
          <div class="task-progress" *ngIf="actionType === 'manual' && tasks.length > 0">
            <span class="progress-count">{{ doneCount }}/{{ tasks.length }} done</span>
            <div class="progress-bar">
              <div class="progress-fill" [style.width.%]="progressPct"></div>
            </div>
          </div>
          <span *ngIf="actionType !== 'manual'" class="action-type-badge" [class]="'at-' + actionType">
            {{ actionTypeBadgeLabel }}
          </span>
        </div>
      </div>

      <!-- automated: spins while handler runs (no manual tasks) -->
      <div class="task-loading" *ngIf="actionType === 'automated' && isActive">
        <span class="spinner"></span>
        <span>Running automatically…</span>
      </div>
      <div class="task-empty" *ngIf="actionType === 'automated' && !isActive">
        <span>✓ Completed automatically.</span>
      </div>

      <!-- approval: approve or reject -->
      <div class="approval-panel" *ngIf="actionType === 'approval' && isActive">
        <textarea
          class="approval-comment"
          [(ngModel)]="approvalComment"
          placeholder="Reason / comment (optional)"
          rows="3"
        ></textarea>
        <div class="approval-actions">
          <button class="reject-btn" (click)="submitApproval('rejected')">✕ Reject</button>
          <button class="approve-btn" (click)="submitApproval('approved')">✓ Approve</button>
        </div>
      </div>
      <div class="task-empty" *ngIf="actionType === 'approval' && !isActive">
        <span>✓ Decision recorded.</span>
      </div>

      <!-- gate: waiting for external release signal -->
      <div class="gate-panel" *ngIf="actionType === 'gate' && isActive">
        <span class="gate-icon">⏳</span>
        <span>Waiting for gate release…</span>
      </div>
      <div class="task-empty" *ngIf="actionType === 'gate' && !isActive">
        <span>✓ Gate released.</span>
      </div>

      <!-- manual: existing task list -->
      <ng-container *ngIf="actionType === 'manual'">
        <div class="task-loading" *ngIf="loading">
          <span class="spinner"></span>
          <span>Loading tasks…</span>
        </div>

        <div class="task-empty" *ngIf="!loading && tasks.length === 0">
          <span>No tasks defined for this activity.</span>
        </div>

        <ul class="task-list" *ngIf="!loading && tasks.length > 0">
          <li
            *ngFor="let task of tasks"
            class="task-item"
            [class.is-done]="task.status === 'done'"
            [class.no-instance]="task.id === null"
          >
            <div class="task-body">
              <div class="task-title">{{ task.title }}</div>
              <div class="task-desc" *ngIf="task.description">{{ task.description }}</div>
            </div>
            <button
              class="status-badge"
              [class]="'status-badge ' + statusConfig(task.status).class"
              [disabled]="task.id === null"
              (click)="cycleStatus(task)"
              [title]="task.id === null ? 'Activity not yet started' : 'Click to advance status'"
            >
              {{ statusConfig(task.status).label }}
            </button>
          </li>
        </ul>
      </ng-container>
    </div>
  `,
  styles: [`
    .task-panel {
      margin-top: 16px;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      overflow: hidden;
      animation: fadeIn 0.25s ease both;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .task-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      border-bottom: 1px solid var(--border-subtle);
      gap: 16px;
      flex-wrap: wrap;
    }

    .task-panel-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      font-family: var(--font-mono);
      letter-spacing: 0.3px;
    }

    .task-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
      font-size: 11px;
      font-weight: 700;
    }

    .step-name { color: var(--accent-cyan); }

    .task-progress {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .progress-count {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .progress-bar {
      width: 80px;
      height: 4px;
      background: var(--bg-surface);
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #10b981, #38bdf8);
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    .task-loading, .task-empty {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 20px;
      font-size: 13px;
      color: var(--text-dim);
      font-family: var(--font-mono);
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid var(--border-subtle);
      border-top-color: var(--accent-cyan);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: inline-block;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .task-list {
      list-style: none;
      margin: 0;
      padding: 8px 0;
    }

    .task-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 20px;
      transition: background 0.15s ease;
    }

    .task-item:hover { background: rgba(255, 255, 255, 0.03); }

    .task-item.is-done .task-title {
      color: var(--text-dim);
      text-decoration: line-through;
      text-decoration-color: rgba(100, 116, 139, 0.5);
    }

    .task-item.is-done .task-desc { opacity: 0.4; }

    .task-item.no-instance { opacity: 0.55; }

    .task-body {
      flex: 1;
      min-width: 0;
    }

    .task-title {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      line-height: 1.4;
    }

    .task-desc {
      font-size: 11px;
      color: var(--text-dim);
      margin-top: 2px;
      line-height: 1.5;
    }

    /* Status badge */
    .status-badge {
      flex-shrink: 0;
      font-size: 10px;
      font-family: var(--font-mono);
      font-weight: 600;
      letter-spacing: 0.6px;
      padding: 3px 10px;
      border-radius: 20px;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .status-badge:disabled {
      cursor: default;
      opacity: 0.5;
    }

    .status-badge:not(:disabled):hover {
      filter: brightness(1.15);
      transform: scale(1.04);
    }

    .status-new {
      color: #94a3b8;
      background: rgba(100, 116, 139, 0.1);
      border-color: rgba(100, 116, 139, 0.2);
    }

    .status-in-progress {
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.1);
      border-color: rgba(56, 189, 248, 0.25);
    }

    .status-done {
      color: #10b981;
      background: rgba(16, 185, 129, 0.1);
      border-color: rgba(16, 185, 129, 0.25);
    }

    /* action-type badge */
    .action-type-badge {
      font-size: 10px;
      font-family: var(--font-mono);
      font-weight: 600;
      letter-spacing: 0.6px;
      padding: 3px 10px;
      border-radius: 20px;
      border: 1px solid transparent;
    }
    .at-automated { color: #38bdf8; background: rgba(56,189,248,0.1); border-color: rgba(56,189,248,0.25); }
    .at-approval  { color: #f59e0b; background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.25); }
    .at-gate      { color: #a78bfa; background: rgba(167,139,250,0.1); border-color: rgba(167,139,250,0.25); }

    /* approval panel */
    .approval-panel {
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .approval-comment {
      width: 100%;
      box-sizing: border-box;
      background: var(--bg-surface, #0f172a);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 12px;
      padding: 8px 12px;
      resize: vertical;
    }
    .approval-comment:focus { outline: none; border-color: #f59e0b; }
    .approval-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .approve-btn, .reject-btn {
      padding: 6px 16px;
      border-radius: 8px;
      border: none;
      font-size: 12px;
      font-family: var(--font-mono);
      font-weight: 600;
      cursor: pointer;
    }
    .approve-btn { background: #10b981; color: #fff; }
    .approve-btn:hover { background: #059669; }
    .reject-btn  { background: transparent; color: #f87171; border: 1px solid #f87171; }
    .reject-btn:hover  { background: rgba(248,113,113,0.1); }

    /* gate panel */
    .gate-panel {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      font-size: 13px;
      color: #a78bfa;
      font-family: var(--font-mono);
    }
    .gate-icon { font-size: 16px; }

    .run-hint {
      margin: 0 0 12px;
      font-size: 12px;
      color: var(--text-dim);
      font-family: var(--font-mono);
    }

    /* header-right area */
    .header-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .run-btn {
      padding: 6px 18px;
      border-radius: 8px;
      border: 1px solid rgba(245,158,11,0.4);
      background: rgba(245,158,11,0.08);
      color: #f59e0b;
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-mono);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .run-btn:hover {
      background: rgba(245,158,11,0.18);
      border-color: rgba(245,158,11,0.7);
    }

    .header-run-btn {
      padding: 5px 14px;
      font-size: 11px;
    }

    /* Dialog */
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15,23,42,0.35);
      backdrop-filter: blur(2px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.15s ease both;
    }

    .dialog-card {
      background: var(--bg-card);
      border: 1px solid var(--border-medium);
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.18);
      width: 520px;
      max-width: 92vw;
      animation: slideUp 0.2s ease both;
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-subtle);
    }

    .dialog-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      font-family: var(--font-mono);
    }

    .dialog-close {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 14px;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      line-height: 1;
      transition: color 0.15s, background 0.15s;
    }
    .dialog-close:hover { color: var(--text-primary); background: var(--bg-surface); }

    .dialog-body { padding: 20px; }

    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 16px;
      border-top: 1px solid var(--border-subtle);
      margin-top: 4px;
    }

    .cancel-btn {
      padding: 6px 16px;
      border-radius: 8px;
      border: 1px solid var(--border-medium);
      background: var(--bg-surface);
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-mono);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .cancel-btn:hover { background: var(--bg-elevated); border-color: var(--border-strong); }

    /* Dynamic input form */
    .input-form { display: flex; flex-direction: column; gap: 0; }

    .input-form-fields {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 16px;
      padding-bottom: 12px;
    }

    .input-field-row { display: flex; flex-direction: column; gap: 4px; }

    .input-field-label {
      font-size: 10px;
      font-family: var(--font-mono);
      letter-spacing: 0.6px;
      color: var(--text-muted);
      text-transform: uppercase;
    }

    .req { color: #f59e0b; margin-left: 2px; }

    .input-field-control {
      width: 100%;
      padding: 7px 10px;
      background: var(--bg-surface);
      border: 1px solid var(--border-medium);
      border-radius: 7px;
      color: var(--text-primary);
      font-size: 12px;
      font-family: var(--font-body);
      box-sizing: border-box;
      transition: border-color 0.15s;
      resize: vertical;
    }
    .input-field-control:focus {
      outline: none;
      border-color: var(--accent-amber);
      box-shadow: 0 0 0 2px rgba(245,158,11,0.12);
    }

    .input-form-error {
      font-size: 11px;
      color: #ef4444;
      font-family: var(--font-mono);
      margin-bottom: 8px;
    }

    .input-form-footer {
      display: flex;
      justify-content: flex-end;
      padding-top: 4px;
      border-top: 1px solid var(--border-subtle);
    }
  `],
})
export class ActivityTasksComponent implements OnChanges {
  @Input() projectId: number | null = null;
  @Input() activityId = '';
  @Input() activityLabel = '';
  @Input() actionType: ActionType = 'manual';
  @Input() inputSchema: InputField[] | undefined = undefined;
  @Input() isActive = false;
  @Output() activityCompleted = new EventEmitter<void>();

  private engine = inject(EngineApiService);

  tasks: TaskItem[] = [];
  loading = false;
  manualRunning = false;
  dialogOpen = false;
  inputValues: Record<string, string> = {};
  inputError = '';
  approvalComment = '';

  get actionTypeBadgeLabel(): string {
    const labels: Record<ActionType, string> = {
      manual: 'Manual', automated: 'Auto', approval: 'Approval', gate: 'Gate',
    };
    return labels[this.actionType] ?? this.actionType;
  }

  readonly statusConfig = (s: TaskStatus) => STATUS_CONFIG[s] ?? STATUS_CONFIG['new'];

  get doneCount(): number {
    return this.tasks.filter((t) => t.status === 'done').length;
  }

  get progressPct(): number {
    if (this.tasks.length === 0) return 0;
    return Math.round((this.doneCount / this.tasks.length) * 100);
  }

  openDialog(): void {
    this.inputError = '';
    this.inputValues = Object.fromEntries(
      (this.inputSchema ?? []).map(f => [f.key, f.defaultValue ?? ''])
    );
    this.dialogOpen = true;
  }

  closeDialog(): void {
    if (this.manualRunning) return;
    this.dialogOpen = false;
    this.inputError = '';
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.manualRunning = false;
    this.dialogOpen = false;
    this.inputValues = Object.fromEntries(
      (this.inputSchema ?? []).map(f => [f.key, f.defaultValue ?? ''])
    );
    this.inputError = '';
    if (this.projectId && this.activityId && this.actionType === 'manual') {
      this.loadTasks();
    } else {
      this.tasks = [];
    }
  }

  submitWithInputs(): void {
    if (!this.projectId || !this.activityId) return;
    this.inputError = '';

    // Validate required fields
    const missing = (this.inputSchema ?? [])
      .filter(f => f.required && !this.inputValues[f.key]?.trim())
      .map(f => f.label);
    if (missing.length > 0) {
      this.inputError = `Required: ${missing.join(', ')}`;
      return;
    }

    this.manualRunning = true;
    this.engine
      .post(`/api/projects/${this.projectId}/activities/${this.activityId}/trigger`, this.inputValues)
      .subscribe({
        next: () => { this.dialogOpen = false; },
        error: (err) => {
          this.manualRunning = false;
          this.inputError = err.error?.error ?? 'Failed to submit.';
        },
      });
  }

  submitApproval(decision: 'approved' | 'rejected'): void {
    if (!this.projectId || !this.activityId) return;
    const label = decision === 'approved' ? 'Approve' : 'Reject';
    if (!confirm(`${label} "${this.activityLabel}"?`)) return;
    const isReject = decision === 'rejected';
    const endpoint = isReject ? 'reject' : 'complete';
    const outcomeMap: Record<string, string> = { uat: 'pass' };
    const outcome = isReject ? undefined : (outcomeMap[this.activityId] ?? 'yes');
    this.engine
      .post(`/api/projects/${this.projectId}/activities/${this.activityId}/${endpoint}`, {
        ...(outcome ? { outcome } : {}),
        notes: this.approvalComment.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.approvalComment = '';
          this.activityCompleted.emit();
        },
        error: (err) => alert(`Failed: ${err.error?.error ?? err.message}`),
      });
  }

  triggerManual(): void {
    if (!this.projectId || !this.activityId) return;
    this.manualRunning = true;
    this.engine
      .post(`/api/projects/${this.projectId}/activities/${this.activityId}/trigger`, {})
      .subscribe({
        next: () => { this.dialogOpen = false; },
        error: () => { this.manualRunning = false; },
      });
  }

  cycleStatus(task: TaskItem): void {
    if (task.id === null) return;
    const currentIdx = STATUS_CYCLE.indexOf(task.status);
    const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];

    if (nextStatus === 'in_progress' || nextStatus === 'done') {
      const label = STATUS_CONFIG[nextStatus].label;
      if (!confirm(`Mark "${task.title}" as ${label}?`)) return;
    }

    this.engine
      .patch<TaskItem>(
        `/api/projects/${this.projectId}/activities/${this.activityId}/tasks/${task.id}`,
        { status: nextStatus }
      )
      .subscribe((updated) => {
        const idx = this.tasks.findIndex((t) => t.id === updated.id);
        if (idx !== -1) this.tasks[idx] = updated;

        const allDone = this.tasks.every((t) => t.status === 'done');
        if (allDone) {
          this.engine
            .post(`/api/projects/${this.projectId}/activities/${this.activityId}/complete`)
            .subscribe(() => this.activityCompleted.emit());
        }
      });
  }

  private loadTasks(): void {
    this.loading = true;
    this.tasks = [];
    this.engine
      .get<TaskItem[]>(`/api/projects/${this.projectId}/activities/${this.activityId}/tasks`)
      .subscribe({
        next: (tasks) => {
          this.tasks = tasks;
          this.loading = false;
        },
        error: () => {
          this.tasks = [];
          this.loading = false;
        },
      });
  }
}
