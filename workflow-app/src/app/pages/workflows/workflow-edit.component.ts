import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { EngineApiService } from '../../services/engine-api.service';
import { forkJoin } from 'rxjs';


type NodeType = 'start' | 'end' | 'task' | 'decision' | 'loop' | 'parallel';
type ActionType = 'manual' | 'approval' | 'gate' | 'automated';
type EdgeType = 'normal' | 'loop';

interface Team { id: number; name: string; }

interface ActivityDraft {
  activityKey: string;
  label: string;
  nodeType: NodeType;
  col: number;
  row: number;
  teamId: number | null;
  actionType: ActionType;
  slaHours: number | null;
  handler: string;
  inputSchema: string;
}

interface TransitionDraft {
  fromActivityKey: string;
  toActivityKey: string;
  condition: string;
  edgeType: EdgeType;
}

interface TaskDraft {
  activityKey: string;
  title: string;
  description: string;
  orderIndex: number;
}

@Component({
  selector: 'app-workflow-edit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">

      <!-- Loading state -->
      <div class="state-box" *ngIf="loading">
        <p class="state-text">Loading workflow…</p>
      </div>

      <!-- Error state -->
      <div class="state-box" *ngIf="!loading && loadError">
        <p class="state-text error">{{ loadError }}</p>
        <button class="btn-back" (click)="back()">← Back to Workflows</button>
      </div>

      <!-- Main content -->
      <ng-container *ngIf="!loading && !loadError">
        <!-- Header -->
        <div class="page-header">
          <button class="btn-back" (click)="back()">← Back</button>
          <div>
            <h1 class="page-title">Edit Workflow</h1>
            <p class="page-sub">Modify version, activities, transitions, and tasks</p>
          </div>
        </div>

        <!-- Stepper -->
        <div class="stepper">
          <div class="step-item" *ngFor="let s of stepLabels; let i = index"
               [class.active]="step === i" [class.done]="step > i">
            <div class="step-dot">{{ step > i ? '✓' : i + 1 }}</div>
            <div class="step-name">{{ s }}</div>
          </div>
          <div class="step-line"></div>
        </div>

        <!-- ── Step 0: Version Info ── -->
        <div class="card" *ngIf="step === 0">
          <h2 class="card-title">Workflow Version</h2>
          <label class="field-label">Version Name <span class="req">*</span></label>
          <input class="field-input" [(ngModel)]="info.name" placeholder="e.g. 2.0" />
          <label class="field-label">Description</label>
          <textarea class="field-input textarea" [(ngModel)]="info.description" placeholder="Optional description" rows="3"></textarea>
          <div class="field-error" *ngIf="stepError">{{ stepError }}</div>
          <div class="card-footer">
            <button class="btn-next" (click)="nextStep()">Next →</button>
          </div>
        </div>

        <!-- ── Step 1: Activities ── -->
        <div class="card" *ngIf="step === 1">
          <h2 class="card-title">Activities</h2>

          <div class="activity-list">
            <div class="activity-row" *ngFor="let a of activities; let i = index">
              <div class="activity-row-header">
                <span class="activity-num">{{ i + 1 }}</span>
                <button class="btn-remove" (click)="removeActivity(i)" *ngIf="activities.length > 1">✕</button>
              </div>
              <div class="field-grid">
                <div class="field-group">
                  <label class="field-label">Activity Key <span class="req">*</span></label>
                  <input class="field-input" [(ngModel)]="a.activityKey" placeholder="e.g. start" />
                </div>
                <div class="field-group">
                  <label class="field-label">Label <span class="req">*</span></label>
                  <input class="field-input" [(ngModel)]="a.label" placeholder="e.g. Start" />
                </div>
                <div class="field-group">
                  <label class="field-label">Node Type</label>
                  <select class="field-input" [(ngModel)]="a.nodeType">
                    <option value="start">Start</option>
                    <option value="end">End</option>
                    <option value="task">Task</option>
                    <option value="decision">Decision</option>
                    <option value="loop">Loop</option>
                    <option value="parallel">Parallel</option>
                  </select>
                </div>
                <div class="field-group">
                  <label class="field-label">Action Type</label>
                  <select class="field-input" [(ngModel)]="a.actionType">
                    <option value="manual">Manual</option>
                    <option value="approval">Approval</option>
                    <option value="gate">Gate</option>
                    <option value="automated">Automated</option>
                  </select>
                </div>
                <div class="field-group">
                  <label class="field-label">Team</label>
                  <select class="field-input" [(ngModel)]="a.teamId">
                    <option [ngValue]="null">— None —</option>
                    <option *ngFor="let t of teams" [ngValue]="t.id">{{ t.name }}</option>
                  </select>
                </div>
                <div class="field-group">
                  <label class="field-label">SLA Hours</label>
                  <input class="field-input" type="number" [(ngModel)]="a.slaHours" placeholder="Optional" min="1" />
                </div>
                <div class="field-group">
                  <label class="field-label">Col</label>
                  <input class="field-input" type="number" [(ngModel)]="a.col" placeholder="0" min="0" />
                </div>
                <div class="field-group">
                  <label class="field-label">Row</label>
                  <input class="field-input" type="number" [(ngModel)]="a.row" placeholder="0" min="0" />
                </div>
              <div class="field-group">
                <label class="field-label">Handler</label>
                <input class="field-input" [(ngModel)]="a.handler" placeholder="e.g. weather, send_proposal" />
              </div>
              <div class="field-group config-full">
                <label class="field-label">Input Schema <span class="field-hint">(JSON array, optional)</span></label>
                <textarea class="field-input textarea config-area" [(ngModel)]="a.inputSchema"
                          placeholder='e.g. [{"key":"name","label":"Full Name","type":"text","required":true}]'></textarea>
              </div>
              </div>
            </div>
          </div>

          <button class="btn-add" (click)="addActivity()">+ Add Activity</button>
          <div class="field-error" *ngIf="stepError">{{ stepError }}</div>
          <div class="card-footer">
            <button class="btn-back-step" (click)="prevStep()">← Back</button>
            <button class="btn-next" (click)="nextStep()">Next →</button>
          </div>
        </div>

        <!-- ── Step 2: Transitions ── -->
        <div class="card" *ngIf="step === 2">
          <h2 class="card-title">Transitions</h2>
          <p class="card-hint">Connect activities to define the flow. At least one transition is required.</p>

          <div class="transition-list">
            <div class="transition-row" *ngFor="let t of transitions; let i = index">
              <div class="transition-row-header">
                <span class="activity-num">{{ i + 1 }}</span>
                <button class="btn-remove" (click)="removeTransition(i)">✕</button>
              </div>
              <div class="field-grid">
                <div class="field-group">
                  <label class="field-label">From Activity <span class="req">*</span></label>
                  <select class="field-input" [(ngModel)]="t.fromActivityKey">
                    <option value="">— Select —</option>
                    <option *ngFor="let a of activities" [value]="a.activityKey">{{ a.label || a.activityKey }}</option>
                  </select>
                </div>
                <div class="field-group">
                  <label class="field-label">To Activity <span class="req">*</span></label>
                  <select class="field-input" [(ngModel)]="t.toActivityKey">
                    <option value="">— Select —</option>
                    <option *ngFor="let a of activities" [value]="a.activityKey">{{ a.label || a.activityKey }}</option>
                  </select>
                </div>
                <div class="field-group">
                  <label class="field-label">Condition</label>
                  <input class="field-input" [(ngModel)]="t.condition" placeholder="e.g. approved" />
                </div>
                <div class="field-group">
                  <label class="field-label">Edge Type</label>
                  <select class="field-input" [(ngModel)]="t.edgeType">
                    <option value="normal">Normal</option>
                    <option value="loop">Loop</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <button class="btn-add" (click)="addTransition()">+ Add Transition</button>
          <div class="field-error" *ngIf="stepError">{{ stepError }}</div>
          <div class="card-footer">
            <button class="btn-back-step" (click)="prevStep()">← Back</button>
            <button class="btn-next" (click)="nextStep()">Next →</button>
          </div>
        </div>

        <!-- ── Step 3: Tasks ── -->
        <div class="card" *ngIf="step === 3">
          <h2 class="card-title">Activity Tasks</h2>
          <p class="card-hint">Optionally add checklist tasks to any activity.</p>

          <div class="task-list">
            <div class="task-row" *ngFor="let tk of tasks; let i = index">
              <div class="transition-row-header">
                <span class="activity-num">{{ i + 1 }}</span>
                <button class="btn-remove" (click)="removeTask(i)">✕</button>
              </div>
              <div class="field-grid">
                <div class="field-group">
                  <label class="field-label">Activity <span class="req">*</span></label>
                  <select class="field-input" [(ngModel)]="tk.activityKey">
                    <option value="">— Select —</option>
                    <option *ngFor="let a of activities" [value]="a.activityKey">{{ a.label || a.activityKey }}</option>
                  </select>
                </div>
                <div class="field-group">
                  <label class="field-label">Title <span class="req">*</span></label>
                  <input class="field-input" [(ngModel)]="tk.title" placeholder="Task title" />
                </div>
                <div class="field-group">
                  <label class="field-label">Description</label>
                  <input class="field-input" [(ngModel)]="tk.description" placeholder="Optional" />
                </div>
                <div class="field-group">
                  <label class="field-label">Order</label>
                  <input class="field-input" type="number" [(ngModel)]="tk.orderIndex" placeholder="0" min="0" />
                </div>
              </div>
            </div>
          </div>

          <button class="btn-add" (click)="addTask()">+ Add Task</button>
          <div class="field-error" *ngIf="stepError">{{ stepError }}</div>
          <div class="card-footer">
            <button class="btn-back-step" (click)="prevStep()">← Back</button>
            <button class="btn-submit" (click)="submit()" [disabled]="submitting">
              {{ submitting ? 'Saving…' : 'Save Changes' }}
            </button>
          </div>
        </div>
      </ng-container>
    </div>
  `,
  styles: [`
    .page {
      max-width: 860px;
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
      gap: 20px;
      margin-bottom: 36px;
    }

    .btn-back {
      background: none;
      border: 1px solid var(--border-medium);
      border-radius: 8px;
      color: var(--text-muted);
      font-size: 12px;
      font-family: var(--font-body);
      padding: 7px 14px;
      cursor: pointer;
      white-space: nowrap;
      margin-top: 4px;
      transition: all 0.2s;
    }
    .btn-back:hover { color: var(--text-primary); border-color: var(--text-muted); }

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

    /* ── State boxes ── */
    .state-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 80px 24px;
      text-align: center;
    }

    .state-text {
      font-size: 14px;
      color: var(--text-muted);
      margin: 0;
    }

    .state-text.error { color: #f87171; }

    /* ── Stepper ── */
    .stepper {
      display: flex;
      align-items: center;
      gap: 0;
      margin-bottom: 32px;
      position: relative;
    }

    .step-line {
      position: absolute;
      top: 14px;
      left: 14px;
      right: 14px;
      height: 1px;
      background: var(--border-subtle);
      z-index: 0;
    }

    .step-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      flex: 1;
      position: relative;
      z-index: 1;
    }

    .step-dot {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--bg-surface);
      border: 2px solid var(--border-medium);
      color: var(--text-dim);
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .step-item.active .step-dot {
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      border-color: #38bdf8;
      color: #fff;
    }

    .step-item.done .step-dot {
      background: rgba(16, 185, 129, 0.15);
      border-color: #10b981;
      color: #10b981;
    }

    .step-name {
      font-size: 10px;
      font-family: var(--font-mono);
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--text-dim);
    }

    .step-item.active .step-name { color: var(--text-primary); }
    .step-item.done .step-name { color: #10b981; }

    /* ── Card ── */
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      padding: 28px 28px 24px;
    }

    .card-title {
      font-size: 17px;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0 0 20px;
    }

    .card-hint {
      font-size: 12px;
      color: var(--text-muted);
      margin: -12px 0 20px;
    }

    .card-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid var(--border-subtle);
    }

    /* ── Fields ── */
    .field-label {
      display: block;
      font-size: 11px;
      font-family: var(--font-mono);
      letter-spacing: 0.8px;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 5px;
    }

    .req { color: #f87171; }

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

    select.field-input { cursor: pointer; }

    .textarea { resize: vertical; min-height: 72px; }

    .field-error {
      font-size: 12px;
      color: #f87171;
      margin-top: 8px;
    }

    .field-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 14px;
      margin-bottom: 4px;
    }

    .field-group { display: flex; flex-direction: column; }
    .config-full { grid-column: 1 / -1; }
    .config-area { font-family: var(--font-mono); font-size: 12px; min-height: 60px; resize: vertical; }
    .field-hint  { font-size: 10px; color: var(--text-dim); text-transform: none; letter-spacing: 0; }

    /* ── Activity / Transition / Task rows ── */
    .activity-list, .transition-list, .task-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 16px;
    }

    .activity-row, .transition-row, .task-row {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 16px;
    }

    .activity-row-header, .transition-row-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .activity-num {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-dim);
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 50%;
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .btn-remove {
      background: none;
      border: 1px solid rgba(248, 113, 113, 0.3);
      border-radius: 6px;
      color: #f87171;
      font-size: 10px;
      padding: 3px 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-remove:hover { background: rgba(248, 113, 113, 0.08); }

    .btn-add {
      background: transparent;
      border: 1px dashed var(--border-medium);
      border-radius: 8px;
      color: var(--text-muted);
      font-size: 12px;
      font-family: var(--font-body);
      padding: 8px 16px;
      cursor: pointer;
      width: 100%;
      transition: all 0.2s;
    }
    .btn-add:hover { border-color: var(--accent-cyan); color: var(--accent-cyan); }

    /* ── Buttons ── */
    .btn-next, .btn-submit {
      padding: 9px 22px;
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
    .btn-next:hover, .btn-submit:not(:disabled):hover { opacity: 0.85; }
    .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-back-step {
      padding: 9px 18px;
      background: transparent;
      border: 1px solid var(--border-medium);
      border-radius: 8px;
      color: var(--text-muted);
      font-size: 13px;
      font-family: var(--font-body);
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-back-step:hover { border-color: var(--text-muted); color: var(--text-primary); }
  `],
})
export class WorkflowEditComponent implements OnInit {
  private engine  = inject(EngineApiService);
  private router  = inject(Router);
  private route   = inject(ActivatedRoute);

  versionId!: number;

  loading   = true;
  loadError = '';

  step = 0;
  stepLabels = ['Version Info', 'Activities', 'Transitions', 'Tasks'];
  stepError  = '';
  submitting = false;

  teams: Team[] = [];

  info = { name: '', description: '' };

  activities: ActivityDraft[]  = [];
  transitions: TransitionDraft[] = [];
  tasks: TaskDraft[]            = [];

  ngOnInit(): void {
    this.versionId = Number(this.route.snapshot.paramMap.get('id'));

    forkJoin({
      versions:    this.engine.get<any[]>(`/api/workflow/versions`),
      steps:       this.engine.get<any[]>(`/api/workflow/activities?versionId=${this.versionId}`),
      transitions: this.engine.get<any[]>(`/api/workflow/transitions?versionId=${this.versionId}`),
      tasks:       this.engine.get<any[]>(`/api/workflow/tasks?versionId=${this.versionId}`),
      teams:       this.engine.get<Team[]>(`/api/teams`),
    }).subscribe({
      next: ({ versions, steps, transitions, tasks, teams }) => {
        const version = versions.find((v: any) => v.id === this.versionId);
        if (!version) {
          this.loadError = `Workflow version ${this.versionId} not found.`;
          this.loading = false;
          return;
        }

        this.info = { name: version.name, description: version.description ?? '' };
        this.teams = teams;

        this.activities = steps.map((s: any): ActivityDraft => ({
          activityKey: s.activityKey,
          label:       s.label,
          nodeType:    s.nodeType,
          col:         s.col,
          row:         s.row,
          teamId:      s.teamId ?? null,
          actionType:  s.actionType,
          slaHours:    s.slaHours ?? null,
          handler:     s.handler      ?? '',
          inputSchema: s.inputSchema  ?? '',
        }));

        if (this.activities.length === 0) {
          this.activities = [this.blankActivity()];
        }

        this.transitions = transitions.map((t: any): TransitionDraft => ({
          fromActivityKey: t.fromActivityKey,
          toActivityKey:   t.toActivityKey,
          condition:       t.condition ?? '',
          edgeType:        t.edgeType,
        }));

        if (this.transitions.length === 0) {
          this.transitions = [this.blankTransition()];
        }

        this.tasks = tasks.map((tk: any): TaskDraft => ({
          activityKey: tk.activityKey,
          title:       tk.title,
          description: tk.description ?? '',
          orderIndex:  tk.orderIndex,
        }));

        this.loading = false;
      },
      error: (err) => {
        this.loadError = err.error?.error ?? 'Failed to load workflow data.';
        this.loading = false;
      },
    });
  }

  back(): void { this.router.navigate(['/workflows']); }

  // ── Navigation ──────────────────────────────────────────────
  nextStep(): void {
    this.stepError = '';
    if (this.step === 0) {
      if (!this.info.name.trim()) { this.stepError = 'Version name is required.'; return; }
    } else if (this.step === 1) {
      for (const a of this.activities) {
        if (!a.activityKey.trim()) { this.stepError = 'All activities must have an Activity Key.'; return; }
        if (!a.label.trim())       { this.stepError = 'All activities must have a Label.'; return; }
      }
      const keys = this.activities.map(a => a.activityKey.trim());
      if (new Set(keys).size !== keys.length) { this.stepError = 'Activity keys must be unique.'; return; }
      for (const a of this.activities) {
        if (a.inputSchema.trim()) { try { JSON.parse(a.inputSchema); } catch { this.stepError = `Invalid JSON input schema for "${a.activityKey || 'activity'}".`; return; } }
      }
    } else if (this.step === 2) {
      if (this.transitions.length === 0) { this.stepError = 'Add at least one transition.'; return; }
      for (const t of this.transitions) {
        if (!t.fromActivityKey || !t.toActivityKey) { this.stepError = 'All transitions must have From and To activities.'; return; }
      }
    }
    this.step++;
  }

  prevStep(): void { this.stepError = ''; this.step--; }

  // ── Activities ───────────────────────────────────────────────
  blankActivity(): ActivityDraft {
    return { activityKey: '', label: '', nodeType: 'task', col: 0, row: 0, teamId: null, actionType: 'manual', slaHours: null, handler: '', inputSchema: '' };
  }
  addActivity(): void { this.activities.push(this.blankActivity()); }
  removeActivity(i: number): void { this.activities.splice(i, 1); }

  // ── Transitions ──────────────────────────────────────────────
  blankTransition(): TransitionDraft {
    return { fromActivityKey: '', toActivityKey: '', condition: '', edgeType: 'normal' };
  }
  addTransition(): void { this.transitions.push(this.blankTransition()); }
  removeTransition(i: number): void { this.transitions.splice(i, 1); }

  // ── Tasks ────────────────────────────────────────────────────
  blankTask(): TaskDraft {
    return { activityKey: '', title: '', description: '', orderIndex: 0 };
  }
  addTask(): void { this.tasks.push(this.blankTask()); }
  removeTask(i: number): void { this.tasks.splice(i, 1); }

  // ── Submit ───────────────────────────────────────────────────
  submit(): void {
    this.stepError = '';
    for (const tk of this.tasks) {
      if (!tk.activityKey) { this.stepError = 'All tasks must be assigned to an activity.'; return; }
      if (!tk.title.trim()) { this.stepError = 'All tasks must have a title.'; return; }
    }

    this.submitting = true;
    this.engine.put(`/api/workflow/full/${this.versionId}`, {
      name: this.info.name.trim(),
      description: this.info.description.trim() || null,
      activities: this.activities.map(a => ({
        ...a,
        activityKey: a.activityKey.trim(),
        label: a.label.trim(),
        slaHours: a.slaHours || null,
        handler:     a.handler.trim()      || null,
        inputSchema: a.inputSchema.trim()  || null,
      })),
      transitions: this.transitions.map(t => ({
        fromActivityKey: t.fromActivityKey,
        toActivityKey:   t.toActivityKey,
        condition:       t.condition.trim() || null,
        edgeType:        t.edgeType,
      })),
      tasks: this.tasks.map(tk => ({
        activityKey:  tk.activityKey,
        title:        tk.title.trim(),
        description:  tk.description.trim() || null,
        orderIndex:   tk.orderIndex,
      })),
    }).subscribe({
      next: () => this.router.navigate(['/workflows']),
      error: (err) => {
        this.stepError = err.error?.error ?? 'Failed to save workflow.';
        this.submitting = false;
      },
    });
  }
}
