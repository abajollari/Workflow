import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkflowGraphComponent } from '../../components/workflow-graph/workflow-graph.component';
import { SelectedProjectService } from '../../services/selected-project.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, WorkflowGraphComponent],
  template: `
    <div class="home-page">
      <!-- Page hero -->
      <section class="hero">
        <div class="hero-inner">
          <div class="hero-content">
            <div class="hero-label">
              <span class="label-sep">CUSTOMER: </span>
              <ng-container *ngIf="selectedProject.selected() as project; else defaultLabel">
                <span class="label-account-number">{{ project.accountNumber }}</span>
                <span class="label-sep">—</span>
                <span>{{ project.accountName }}</span>
              </ng-container>
              <ng-template #defaultLabel>
                
              </ng-template>
            </div>

          </div>


        </div>
      </section>

      <!-- Workflow Graph Section -->
      <section class="graph-section" id="graph" *ngIf="selectedProject.selected()">
        <app-workflow-graph />
      </section>


    </div>
  `,
  styles: [`
    .home-page {
      padding: 24px 24px 60px;
      max-width: 1300px;
      margin: 0 auto;
    }

    /* ── Hero ── */
    .hero {
      padding: 8px 0 6px;
    }

    .hero-inner {
      display: flex;
      flex-direction: column;
      gap: 36px;
    }

    .hero-content {
      animation: slideUp 0.6s ease both;
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .hero-label {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-family: var(--font-mono);
      font-weight: bold;
      font-size: 22px;
      letter-spacing: 1px;
      color: white;
      margin-bottom: 2px;
    }

    .label-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-cyan);
      box-shadow: 0 0 8px var(--accent-cyan);
    }

    .label-account-number {
      font-weight: 700;
    }

    .label-sep {
      color: var(--text-dim);
      margin: 0 2px;
    }

    .hero-title {
      font-size: clamp(28px, 5vw, 44px);
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -1.2px;
      line-height: 1.15;
      margin-bottom: 16px;
    }

    .gradient-text {
      background: linear-gradient(135deg, var(--accent-cyan), var(--accent-violet));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .hero-desc {
      font-size: 15px;
      color: var(--text-muted);
      line-height: 1.65;
      max-width: 600px;
      margin-bottom: 28px;
    }

    .hero-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 11px 24px;
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      color: #fff;
      font-family: var(--font-body);
      font-size: 13px;
      font-weight: 600;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(56, 189, 248, 0.25);
      transition: all 0.25s ease;
    }

    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 28px rgba(56, 189, 248, 0.35);
    }

    .btn-arrow {
      font-size: 16px;
      transition: transform 0.2s ease;
    }

    .btn-primary:hover .btn-arrow {
      transform: translateY(2px);
    }

    .btn-ghost {
      display: inline-flex;
      align-items: center;
      padding: 11px 24px;
      background: transparent;
      color: var(--text-secondary);
      font-family: var(--font-body);
      font-size: 13px;
      font-weight: 600;
      border: 1px solid var(--border-medium);
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-ghost:hover {
      border-color: var(--text-muted);
      color: var(--text-primary);
    }

    /* Stat cards */
    .stat-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 12px;
    }

    .stat-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 18px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      animation: slideUp 0.5s ease both;
      transition: border-color 0.2s ease;
    }

    .stat-card:hover {
      border-color: var(--border-medium);
    }

    .stat-icon {
      font-size: 22px;
    }

    .stat-number {
      font-family: var(--font-mono);
      font-size: 20px;
      font-weight: 700;
      display: block;
      line-height: 1;
    }

    .stat-name {
      font-size: 11px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.8px;
      font-family: var(--font-mono);
    }

    /* ── Graph section ── */
    .graph-section {
      padding: 4px 0;
    }

    /* ── Features ── */
    .features {
      padding: 48px 0 0;
    }

    .features-title {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.5px;
      margin-bottom: 24px;
      text-align: center;
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 14px;
    }

    .feature-card {
      padding: 22px;
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      animation: slideUp 0.5s ease both;
      transition: all 0.25s ease;
    }

    .feature-card:hover {
      border-color: var(--border-medium);
      transform: translateY(-2px);
    }

    .feature-icon {
      font-size: 24px;
      display: block;
      margin-bottom: 12px;
    }

    .feature-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 6px;
    }

    .feature-desc {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.6;
    }

    @media (max-width: 768px) {
      .home-page { padding: 16px 16px 48px; }
      .hero { padding: 24px 0; }
    }
  `],
})
export class HomeComponent {
  constructor(public selectedProject: SelectedProjectService) {}
  stats = [
    { icon: '◉', value: '15', label: 'Nodes', color: 'var(--accent-cyan)' },
    { icon: '⤨', value: '18', label: 'Edges', color: 'var(--accent-violet)' },
    { icon: '↻', value: '3', label: 'Loops', color: 'var(--accent-amber)' },
    { icon: '⫘', value: '2', label: 'Branches', color: 'var(--accent-pink)' },
  ];

  features = [
    {
      icon: '⊞',
      title: 'Branching Paths',
      desc: 'Decision nodes route your workflow down different paths based on conditions and outcomes.',
    },
    {
      icon: '⫘',
      title: 'Parallel Execution',
      desc: 'Split work into concurrent tracks and sync them back together with parallel gates.',
    },
    {
      icon: '↻',
      title: 'Iteration Loops',
      desc: 'Loop-back edges let you model retry logic, bug-fix cycles, and iterative review processes.',
    },
    {
      icon: '◉',
      title: 'Live Status',
      desc: 'Click any node to simulate progress. Completed, active, and pending states update instantly.',
    },
    {
      icon: '🔍',
      title: 'Pan & Zoom',
      desc: 'Navigate large workflows with smooth zoom (scroll) and drag-to-pan on the SVG canvas.',
    },
    {
      icon: '⚡',
      title: 'Type-safe Angular',
      desc: 'Built with Angular 17 standalone components, full TypeScript interfaces, and injectable services.',
    },
  ];

  scrollToGraph(): void {
    document.getElementById('graph')?.scrollIntoView({ behavior: 'smooth' });
  }
}
