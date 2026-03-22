import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  HostListener,
  effect,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { WorkflowDataService } from '../../services/workflow-data.service';
import { EngineApiService } from '../../services/engine-api.service';
import { SelectedProjectService } from '../../services/selected-project.service';
import { WorkflowExecutionService } from '../../services/workflow-execution.service';
import { ActivityTasksComponent } from '../activity-tasks/activity-tasks.component';
import {
  WorkflowNode,
  WorkflowEdge,
  Point,
  ViewBox,
  NodeType,
} from '../../models/workflow.model';

/* ── Layout constants ── */
const CELL_W = 140;
const CELL_H = 120;
const NODE_W = 100;
const NODE_H = 56;
const PAD = 80;

function getNodeCenter(node: WorkflowNode): Point {
  return {
    x: PAD + node.col * CELL_W + NODE_W / 2,
    y: PAD + node.row * CELL_H + NODE_H / 2,
  };
}

function buildEdgePath(
  fromNode: WorkflowNode,
  toNode: WorkflowNode,
  edge: WorkflowEdge
): string {
  const a = getNodeCenter(fromNode);
  const b = getNodeCenter(toNode);

  if (edge.type === 'loop') {
    if (
      fromNode.col === toNode.col ||
      Math.abs(fromNode.col - toNode.col) <= 1
    ) {
      const goingUp = fromNode.row > toNode.row;
      const midX = a.x + (goingUp ? 50 : -50);
      return `M${a.x},${a.y - NODE_H / 2} C${midX},${a.y - 60} ${midX},${b.y + 60} ${b.x},${b.y + NODE_H / 2}`;
    }
    const loopY = Math.min(a.y, b.y) - 60;
    return `M${a.x},${a.y - NODE_H / 2} L${a.x},${loopY} L${b.x},${loopY} L${b.x},${b.y - NODE_H / 2}`;
  }

  if (fromNode.row === toNode.row) {
    if (toNode.col < fromNode.col) {
      const loopY = a.y - 70;
      return `M${a.x},${a.y - NODE_H / 2} L${a.x},${loopY} L${b.x},${loopY} L${b.x},${b.y - NODE_H / 2}`;
    }
    const dx = b.x - a.x;
    return `M${a.x + NODE_W / 2},${a.y} C${a.x + NODE_W / 2 + dx * 0.3},${a.y} ${b.x - NODE_W / 2 - dx * 0.3},${b.y} ${b.x - NODE_W / 2},${b.y}`;
  }

  const midX = (a.x + b.x) / 2;
  const startX = a.x + (b.x > a.x ? NODE_W / 2 : -NODE_W / 2);
  const endX = b.x + (a.x > b.x ? NODE_W / 2 : -NODE_W / 2);
  return `M${startX},${a.y} C${midX},${a.y} ${midX},${b.y} ${endX},${b.y}`;
}

@Component({
  selector: 'app-workflow-graph',
  standalone: true,
  imports: [CommonModule, ActivityTasksComponent],
  template: `
    <div class="graph-container">
      <!-- Title area -->
      <div class="graph-header">
        <div class="graph-header-left">
          <div class="top-badges">
            <span class="chip">{{ nodes.length }} activities</span>
            <span class="chip">{{ loopCount }} loops</span>
     
            Current Activity:
            <span class="highlight">{{ activeNodeLabel }}</span>
            
            <span class="dim">({{ completedNodes.size }} of {{ nodes.length }} completed)</span>
          </div>
        </div>

        <div class="header-right">

          <button class="toggle-btn" id="artifacts" (click)="showArtifacts()">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="6" rx="1" stroke="currentColor" stroke-width="1.6"/>
              <rect x="9" y="2" width="5" height="6" rx="1" stroke="currentColor" stroke-width="1.6"/>
              <rect x="2" y="10" width="5" height="4" rx="1" stroke="currentColor" stroke-width="1.6"/>
              <rect x="9" y="10" width="5" height="4" rx="1" stroke="currentColor" stroke-width="1.6"/>
            </svg>
            <span>Artifacts</span>
          </button>

          <button class="toggle-btn" (click)="graphVisible = !graphVisible">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <ng-container *ngIf="graphVisible">
                <path d="M2 5l6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </ng-container>
              <ng-container *ngIf="!graphVisible">
                <path d="M2 11l6-6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </ng-container>
            </svg>
            <span>{{ graphVisible ? 'Hide Graph' : 'Show Graph' }}</span>
          </button>
        </div>
      </div>

      <section id="graph-section" class="graph-section" *ngIf="graphVisible">
      <!-- Legend row -->
      <div class="legend-row">
      <div class="legend">
        <div class="legend-item" *ngFor="let item of legendItems">
          <svg width="24" height="20" viewBox="0 0 24 20">
            <circle *ngIf="item.shape === 'circle'" cx="12" cy="10" r="7" fill="none" [attr.stroke]="item.color" stroke-width="1.5" />
            <rect *ngIf="item.shape === 'rect'" x="3" y="3" width="18" height="14" rx="3" fill="none" [attr.stroke]="item.color" stroke-width="1.5" />
            <rect *ngIf="item.shape === 'diamond'" x="3" y="3" width="18" height="14" rx="3" fill="none" [attr.stroke]="item.color" stroke-width="1.5" stroke-dasharray="4 2" />
            <rect *ngIf="item.shape === 'pill'" x="3" y="3" width="18" height="14" rx="7" fill="none" [attr.stroke]="item.color" stroke-width="1.5" />
            <polygon *ngIf="item.shape === 'hex'" points="12,1 22,6 22,14 12,19 2,14 2,6" fill="none" [attr.stroke]="item.color" stroke-width="1.5" />
            <line *ngIf="item.shape === 'line'" x1="2" y1="10" x2="22" y2="10" [attr.stroke]="item.color" stroke-width="1.5" stroke-dasharray="4 3" />
          </svg>
          <span class="legend-label" [style.color]="item.color">{{ item.label }}</span>
        </div>
      </div>
      <div class="zoom-controls">
        <button class="ctrl-btn" (click)="zoomIn()">+</button>
        <button class="ctrl-btn" (click)="zoomOut()">−</button>
        <button class="ctrl-btn small-text" (click)="resetView()">⟳</button>
        <button class="ctrl-btn small-text" (click)="setSelectedInProgress()" title="Set selected activity as in progress">✓</button>
        <button class="ctrl-btn small-text" (click)="markSelectedComplete()" title="Mark selected activity as completed">✔✔</button>
      </div>
      </div>

      <!-- SVG Canvas -->
      <div
        class="canvas-wrap"
        #canvasWrap
        (mousedown)="onPanStart($event)"
        (mousemove)="onPanMove($event)"
        (mouseup)="onPanEnd()"
        (mouseleave)="onPanEnd()"
      >
        <svg
          #svgEl
          width="100%"
          height="100%"
          [attr.viewBox]="viewBoxStr"
          [style.cursor]="isPanning ? 'grabbing' : 'grab'"
        >
          <defs>
            <filter id="glow-blur"><feGaussianBlur stdDeviation="8" /></filter>
            <marker id="arr" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#475569" />
            </marker>
            <marker id="arr-active" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#38bdf8" />
            </marker>
            <marker id="arr-loop" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#f59e0b" />
            </marker>
            <marker id="arr-done" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#10b981" />
            </marker>
            <pattern id="grid" [attr.width]="cellW" [attr.height]="cellH" patternUnits="userSpaceOnUse">
              <rect [attr.width]="cellW" [attr.height]="cellH" fill="none" stroke="#1e293b" stroke-width="0.5" opacity="0.3" />
            </pattern>
          </defs>

          <!-- Grid bg -->
          <rect *ngIf="vb" [attr.x]="vb.x" [attr.y]="vb.y" [attr.width]="vb.w" [attr.height]="vb.h" fill="url(#grid)" />

          <!-- Edges -->
          <g *ngFor="let edge of edges; trackBy: trackEdge">
            <ng-container *ngIf="getEdgeData(edge) as ed">
              <path
                [attr.d]="ed.path"
                fill="none"
                [attr.stroke]="ed.color"
                [attr.stroke-width]="ed.isActive ? 2.5 : 1.5"
                [attr.stroke-dasharray]="ed.isLoop ? '6 4' : 'none'"
                [attr.marker-end]="'url(#' + ed.markerId + ')'"
                [attr.opacity]="ed.onPath ? 1 : 0.35"
                class="edge-path"
              />
              <!-- Edge label -->
              <ng-container *ngIf="edge.label">
                <rect
                  [attr.x]="ed.labelX - 16"
                  [attr.y]="ed.labelY - 8"
                  width="32" height="16" rx="4"
                  fill="#0f172a"
                  [attr.stroke]="ed.color"
                  stroke-width="0.5"
                />
                <text
                  [attr.x]="ed.labelX"
                  [attr.y]="ed.labelY + 1"
                  text-anchor="middle"
                  dominant-baseline="central"
                  [attr.fill]="ed.color"
                  font-size="9"
                  font-weight="600"
                  font-family="'Space Mono', monospace"
                >{{ edge.label }}</text>
              </ng-container>
            </ng-container>
          </g>

          <!-- Nodes -->
          <g
            *ngFor="let node of nodes; trackBy: trackNode"
            [style.cursor]="'pointer'"
            (click)="selectedNodeId = node.id"
            (mouseenter)="hoveredNode = node.id"
            (mouseleave)="hoveredNode = null"
          >
            <ng-container *ngIf="getNodeData(node) as nd">
              <!-- Glow -->
              <ellipse
                *ngIf="nd.isActive || nd.isCompleted"
                [attr.cx]="nd.cx"
                [attr.cy]="nd.cy"
                [attr.rx]="nodeW / 2 + 12"
                [attr.ry]="nodeH / 2 + 10"
                [attr.fill]="nd.colors.glow"
                filter="url(#glow-blur)"
              />

              <!-- Active pulse -->
              <ng-container *ngIf="nd.isActive">
                <circle
                  [attr.cx]="nd.cx"
                  [attr.cy]="nd.cy"
                  [attr.r]="nodeW / 2 + 6"
                  fill="none" stroke="#38bdf8" stroke-width="1.5" opacity="0.5"
                >
                  <animate attributeName="r" [attr.from]="nodeW / 2 + 4" [attr.to]="nodeW / 2 + 18" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite" />
                </circle>
              </ng-container>

              <!-- Shape: Circle for start/end -->
              <circle
                *ngIf="node.type === 'start' || node.type === 'end'"
                [attr.cx]="nd.cx"
                [attr.cy]="nd.cy"
                r="24"
                [attr.fill]="nd.colors.bg"
                [attr.stroke]="nd.colors.border"
                [attr.stroke-width]="nd.isActive ? 2.5 : 1.5"
                [attr.opacity]="nd.visible ? 1 : 0.5"
              />

              <!-- Shape: Decision (dashed rect) -->
              <rect
                *ngIf="node.type === 'decision'"
                [attr.x]="nd.cx - nodeW / 2 - 4"
                [attr.y]="nd.cy - nodeH / 2 + 2"
                [attr.width]="nodeW + 8"
                [attr.height]="nodeH - 4"
                rx="6"
                [attr.fill]="nd.colors.bg"
                [attr.stroke]="nd.colors.border"
                [attr.stroke-width]="nd.isActive ? 2.5 : 1.5"
                stroke-dasharray="6 3"
                [attr.opacity]="nd.visible ? 1 : 0.5"
              />

              <!-- Shape: Parallel (hexagon) -->
              <polygon
                *ngIf="node.type === 'parallel'"
                [attr.points]="nd.hexPoints"
                [attr.fill]="nd.colors.bg"
                [attr.stroke]="nd.colors.border"
                [attr.stroke-width]="nd.isActive ? 2.5 : 1.5"
                [attr.opacity]="nd.visible ? 1 : 0.5"
              />

              <!-- Shape: Loop (pill) -->
              <rect
                *ngIf="node.type === 'loop'"
                [attr.x]="nd.cx - nodeW / 2"
                [attr.y]="nd.cy - nodeH / 2"
                [attr.width]="nodeW"
                [attr.height]="nodeH"
                rx="22"
                [attr.fill]="nd.colors.bg"
                [attr.stroke]="nd.colors.border"
                [attr.stroke-width]="nd.isActive ? 2.5 : 1.5"
                [attr.opacity]="nd.visible ? 1 : 0.5"
              />

              <!-- Shape: Task (rounded rect) -->
              <rect
                *ngIf="node.type === 'task'"
                [attr.x]="nd.cx - nodeW / 2"
                [attr.y]="nd.cy - nodeH / 2"
                [attr.width]="nodeW"
                [attr.height]="nodeH"
                rx="10"
                [attr.fill]="nd.colors.bg"
                [attr.stroke]="nd.colors.border"
                [attr.stroke-width]="nd.isActive ? 2.5 : 1.5"
                [attr.opacity]="nd.visible ? 1 : 0.5"
              />

              <!-- Completed badge -->
              <ng-container *ngIf="nd.isCompleted">
                <circle [attr.cx]="nd.cx + nodeW / 2 - 6" [attr.cy]="nd.cy - nodeH / 2 + 6" r="8" fill="#10b981" />
                <text [attr.x]="nd.cx + nodeW / 2 - 6" [attr.y]="nd.cy - nodeH / 2 + 10" text-anchor="middle" fill="#fff" font-size="10" font-weight="bold">✓</text>
              </ng-container>

              <!-- Label lines -->
              <text
                *ngFor="let line of nd.lines; let i = index"
                [attr.x]="nd.cx"
                [attr.y]="nd.cy + (i - (nd.lines.length - 1) / 2) * 14"
                text-anchor="middle"
                dominant-baseline="central"
                [attr.fill]="nd.textColor"
                font-size="11"
                [attr.font-weight]="nd.isActive ? 700 : 500"
                font-family="'DM Sans', sans-serif"
                style="pointer-events: none"
              >{{ line }}</text>
            </ng-container>
          </g>
        </svg>
      </div>

      <!-- Footer info -->
      <div class="graph-footer">
        <div class="footer-hint">
          <span>🖱️</span>
          <span class="mono-text">Click a node to set active · Scroll to zoom · Drag to pan</span>
        </div>
        <div class="node-detail" *ngIf="hoveredNodeData as hnd">
          <span class="detail-type">{{ hnd.type | uppercase }}</span>
          <span class="detail-label">{{ hnd.label.replace('\\n', ' ') }}</span>
          <span class="detail-status">
            {{ completedNodes.has(hnd.id) ? '✓ Completed' : hnd.id === activeNodeId ? '◉ Active' : '○ Pending' }}
          </span>
        </div>
        <div class="node-detail" *ngIf="!hoveredNodeData">
          <span class="mono-text">Hover a node for details</span>
        </div>
      </div>
      </section>

      <app-activity-tasks
        *ngIf="selectedProjectId !== null && selectedNodeId"
        [projectId]="selectedProjectId"
        [activityId]="selectedNodeId"
        [activityLabel]="selectedNodeLabel"
        [actionType]="selectedNodeActionType"
        [inputSchema]="selectedNodeInputSchema"
        [isActive]="selectedNodeId === activeNodeId && !completedNodes.has(selectedNodeId)"
        (activityCompleted)="onActivityCompleted()"
      />

    </div>
  `,
  styles: [`
    .graph-container {
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
      animation: fadeIn 0.5s ease both;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Header */
    .graph-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 12px;
    }

    .top-badges {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    .badge {
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 2.5px;
      padding: 3px 10px;
      border-radius: 14px;
    }

    .badge.cyan {
      color: var(--accent-cyan);
      background: var(--accent-cyan-muted);
      border: 1px solid rgba(56, 189, 248, 0.15);
    }

    .chip {
      font-family: var(--font-mono);
      font-size: 10px;
      color: black;
      background: rgb(246, 246, 247);
      border: 1px solid rgba(100, 116, 139, 0.15);
      padding: 3px 10px;
      border-radius: 14px;
    }

    .graph-title {
      font-size: 26px;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.8px;
      line-height: 1.2;
    }

    .graph-subtitle {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .highlight { color: var(--accent-cyan); font-weight: 600; }
    .dim { color: var(--text-dim); }

    .zoom-controls {
      display: flex;
      gap: 6px;
    }

    .ctrl-btn {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-card);
      color: var(--text-secondary);
      font-size: 18px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-body);
      transition: all 0.2s ease;
    }

    .ctrl-btn:hover {
      border-color: var(--accent-cyan);
      color: var(--accent-cyan);
    }

    .ctrl-btn.small-text { font-size: 14px; }

    .header-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .toggle-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 34px;
      padding: 0 12px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-card);
      color: var(--text-dim);
      font-family: var(--font-mono);
      font-size: 11px;
      letter-spacing: 0.5px;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .toggle-btn:hover {
      border-color: var(--accent-cyan);
      color: var(--accent-cyan);
    }

    /* Legend row */
    .legend-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 16px;
      align-items: center;
      padding: 10px 0;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .legend-label {
      font-size: 11px;
      font-family: var(--font-mono);
      letter-spacing: 0.3px;
    }

    /* Canvas */
    .canvas-wrap {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 16px;
      overflow: hidden;
      height: 360px;
      position: relative;
    }

    .edge-path {
      transition: opacity 0.3s ease;
    }

    /* Footer */
    .graph-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 12px;
      padding: 0 4px;
      flex-wrap: wrap;
      gap: 8px;
    }

    .footer-hint {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
    }

    .mono-text {
      font-size: 11px;
      color: var(--text-dim);
      font-family: var(--font-mono);
    }

    .node-detail {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .detail-type {
      font-family: var(--font-mono);
      font-size: 9px;
      letter-spacing: 1.5px;
      color: var(--accent-violet);
      background: var(--accent-violet-muted);
      padding: 2px 8px;
      border-radius: 8px;
    }

    .detail-label {
      font-size: 13px;
      color: var(--text-primary);
      font-weight: 600;
    }

    .detail-status {
      font-size: 11px;
      color: var(--text-muted);
    }

    @media (max-width: 768px) {
      .canvas-wrap { height: 340px; }
      .graph-title { font-size: 20px; }
    }
  `],
})
export class WorkflowGraphComponent implements OnInit, OnDestroy {
  @ViewChild('canvasWrap', { static: true }) canvasWrap!: ElementRef<HTMLDivElement>;
  @ViewChild('svgEl', { static: true }) svgEl!: ElementRef<SVGElement>;

  nodes: WorkflowNode[] = [];
  edges: WorkflowEdge[] = [];

  graphVisible = true;
  showArtifacts() { this.router.navigate(['/artifacts']); }
  activeNodeId = 'start';
  selectedNodeId = '';   // node clicked by user — drives task panel only
  selectedProjectId: number | null = null;
  hoveredNode: string | null = null;
  completedNodes = new Set<string>();
  onPathNodes = new Set<string>();

  /* Layout */
  readonly cellW = CELL_W;
  readonly cellH = CELL_H;
  readonly nodeW = NODE_W;
  readonly nodeH = NODE_H;
  svgW = 0;
  svgH = 0;
  vb: ViewBox | null = null;
  zoom = 1;

  /* Pan */
  isPanning = false;
  panStart = { x: 0, y: 0 };

  private executionSub: Subscription | null = null;

  /* Color map */
  private colorMap: Record<string, { bg: string; border: string; glow: string }> = {
    start:    { bg: '#064e3b', border: '#10b981', glow: 'rgba(16,185,129,0.3)' },
    end:      { bg: '#064e3b', border: '#10b981', glow: 'rgba(16,185,129,0.3)' },
    task:     { bg: '#0c1a2e', border: '#1e40af', glow: 'rgba(59,130,246,0.25)' },
    decision: { bg: '#1c1017', border: '#be185d', glow: 'rgba(236,72,153,0.25)' },
    loop:     { bg: '#1a1505', border: '#d97706', glow: 'rgba(245,158,11,0.3)' },
    parallel: { bg: '#0f0c1e', border: '#7c3aed', glow: 'rgba(139,92,246,0.3)' },
  };

  legendItems = [
    { label: 'Start / End', shape: 'circle', color: '#10b981' },
    { label: 'Task', shape: 'rect', color: '#3b82f6' },
    { label: 'Decision', shape: 'diamond', color: '#ec4899' },
    { label: 'Loop / Iteration', shape: 'pill', color: '#f59e0b' },
    { label: 'Parallel Gate', shape: 'hex', color: '#8b5cf6' },
    { label: 'Loop-back', shape: 'line', color: '#f59e0b' },
  ];

  constructor(
    private workflowData: WorkflowDataService,
    private selectedProject: SelectedProjectService,
    private router: Router,
    private engine: EngineApiService,
    private execution: WorkflowExecutionService,
  ) {
    effect(() => {
      const project = selectedProject.selected();
      if (project) {
        this.selectedProjectId = project.id;
        this.selectedNodeId = project.activity;
        this.workflowData.loadWorkflow(project.workflowVersionId);
        this.setActive(project.activity);
        this.execution.connect(project.id);
      } else {
        this.selectedProjectId = null;
        this.selectedNodeId = '';
        this.workflowData.loadWorkflow();
        this.execution.disconnect();
      }
    });
  }

  ngOnInit(): void {
    this.workflowData.nodes$.subscribe((nodes) => {
      this.nodes = nodes;
      if (nodes.length > 0) {
        this.recalcLayout();
        this.updateCompletedNodes();
      }
    });
    this.workflowData.edges$.subscribe((edges) => {
      this.edges = edges;
      if (edges.length > 0) this.updateCompletedNodes();
    });

    // Live execution updates: when another client completes an activity, refresh
    this.executionSub = this.execution.event$.subscribe((event) => {
      if (event.projectId !== this.selectedProjectId) return;
      // Re-fetch the project so the graph reflects the new active activity
      this.engine
        .get<{ id: number; activity: string; workflowVersionId: number; accountNumber: string; accountName: string }>(
          `/api/projects/${this.selectedProjectId}`
        )
        .subscribe((project) => this.selectedProject.select(project));
    });
  }

  ngOnDestroy(): void {
    this.executionSub?.unsubscribe();
  }

  get loopCount(): number {
    return this.edges.filter((e) => e.type === 'loop').length;
  }

  get activeNodeLabel(): string {
    const n = this.nodes.find((n) => n.id === this.activeNodeId);
    return n ? n.label.replace('\n', ' ') : '';
  }

  get selectedNodeLabel(): string {
    const n = this.nodes.find((n) => n.id === this.selectedNodeId);
    return n ? n.label.replace('\n', ' ') : '';
  }

  get selectedNodeActionType() {
    const n = this.nodes.find((n) => n.id === this.selectedNodeId);
    return n?.actionType ?? 'manual';
  }

  get selectedNodeInputSchema() {
    const n = this.nodes.find((n) => n.id === this.selectedNodeId);
    return n?.inputSchema;
  }

  get hoveredNodeData(): WorkflowNode | null {
    return this.hoveredNode
      ? this.nodes.find((n) => n.id === this.hoveredNode) ?? null
      : null;
  }

  get viewBoxStr(): string {
    if (!this.vb) return `0 0 ${this.svgW} ${this.svgH}`;
    return `${this.vb.x} ${this.vb.y} ${this.vb.w} ${this.vb.h}`;
  }

  /* ── Recalc ── */
  private recalcLayout(): void {
    const maxCol = Math.max(...this.nodes.map((n) => n.col));
    const maxRow = Math.max(...this.nodes.map((n) => n.row));
    this.svgW = PAD * 2 + maxCol * CELL_W + NODE_W;
    this.svgH = PAD * 2 + maxRow * CELL_H + NODE_H;
    this.vb = { x: 0, y: 0, w: this.svgW, h: this.svgH };
  }

  private updateCompletedNodes(): void {
    this.completedNodes = this.workflowData.getCompletedNodes(this.activeNodeId);
    this.onPathNodes = new Set([...this.completedNodes, this.activeNodeId]);
  }

  setActive(id: string): void {
    this.activeNodeId = id;
    this.updateCompletedNodes();
  }

  onActivityCompleted(): void {
    if (this.selectedProjectId === null) return;
    this.engine
      .get<{ id: number; activity: string; workflowVersionId: number; accountNumber: string; accountName: string }>(
        `/api/projects/${this.selectedProjectId}`
      )
      .subscribe((project) => this.selectedProject.select(project));
  }

  setSelectedInProgress(): void {
    if (this.selectedProjectId === null || !this.selectedNodeId) return;
    if (!confirm(`Set "${this.selectedNodeLabel}" as the active activity?`)) return;
    this.engine
      .post(`/api/projects/${this.selectedProjectId}/activities/${this.selectedNodeId}/set-active`)
      .subscribe({
        next: () => this.onActivityCompleted(),
        error: (err) => alert(`Failed: ${err.error?.error ?? err.message}`),
      });
  }

  markSelectedComplete(): void {
    if (this.selectedProjectId === null || !this.selectedNodeId) return;
    if (!confirm(`Mark "${this.selectedNodeLabel}" as completed?`)) return;
    this.engine
      .post(`/api/projects/${this.selectedProjectId}/activities/${this.selectedNodeId}/complete`)
      .subscribe(() => this.onActivityCompleted());
  }

  /* ── Node data helper ── */
  getNodeData(node: WorkflowNode) {
    const center = getNodeCenter(node);
    const isActive = node.id === this.activeNodeId;
    const isCompleted = this.completedNodes.has(node.id);
    const isOnPath = this.onPathNodes.has(node.id);

    let colors = this.colorMap[node.type] || this.colorMap['task'];
    if (isActive) {
      colors = { border: '#38bdf8', bg: '#0c2d4a', glow: 'rgba(56,189,248,0.5)' };
    } else if (isCompleted) {
      colors = { border: '#10b981', bg: '#052e1c', glow: 'rgba(16,185,129,0.25)' };
    }

    const textColor = isActive ? '#e0f2fe' : isCompleted ? '#a7f3d0' : isOnPath ? '#cbd5e1' : '#64748b';

    const cx = center.x;
    const cy = center.y;
    const hexPoints = `${cx},${cy - 30} ${cx + 48},${cy - 12} ${cx + 48},${cy + 12} ${cx},${cy + 30} ${cx - 48},${cy + 12} ${cx - 48},${cy - 12}`;

    return {
      cx,
      cy,
      colors,
      textColor,
      hexPoints,
      isActive,
      isCompleted,
      visible: isOnPath || isActive || isCompleted,
      lines: node.label.split('\n'),
    };
  }

  /* ── Edge data helper ── */
  getEdgeData(edge: WorkflowEdge) {
    const fromNode = this.nodes.find((n) => n.id === edge.from);
    const toNode = this.nodes.find((n) => n.id === edge.to);
    if (!fromNode || !toNode) return null;

    const path = buildEdgePath(fromNode, toNode, edge);
    const isLoop = edge.type === 'loop';
    const isActive =
      (edge.from === this.activeNodeId || edge.to === this.activeNodeId) &&
      this.onPathNodes.has(edge.from) &&
      this.onPathNodes.has(edge.to);
    const isCompleted =
      this.completedNodes.has(edge.from) && this.completedNodes.has(edge.to);
    const onPath = this.onPathNodes.has(edge.from) || this.onPathNodes.has(edge.to);

    const color = isLoop ? '#f59e0b' : isActive ? '#38bdf8' : isCompleted ? '#10b981' : '#334155';
    const markerId = isLoop ? 'arr-loop' : isActive ? 'arr-active' : isCompleted ? 'arr-done' : 'arr';

    const a = getNodeCenter(fromNode);
    const b = getNodeCenter(toNode);

    let labelX = (a.x + b.x) / 2;
    let labelY = (a.y + b.y) / 2 - 8;

    if (isLoop) {
      if (fromNode.col === toNode.col || Math.abs(fromNode.col - toNode.col) <= 1) {
        // Curved side loop — label at the midpoint curve apex
        const goingUp = fromNode.row > toNode.row;
        labelX = a.x + (goingUp ? 50 : -50) + 16;
        labelY = (a.y + b.y) / 2;
      } else {
        // Rectangular loop over the top — label on the horizontal segment
        const loopY = Math.min(a.y, b.y) - 60;
        labelX = (a.x + b.x) / 2;
        labelY = loopY - 10;
      }
    }

    return {
      path,
      color,
      markerId,
      isLoop,
      isActive,
      onPath,
      labelX,
      labelY,
    };
  }

  /* ── Zoom ── */
  @HostListener('wheel', ['$event'])
  onWheel(e: WheelEvent): void {
    const el = this.canvasWrap?.nativeElement;
    if (!el || !el.contains(e.target as Node) || !this.vb) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.08 : 0.92;
    this.applyZoom(factor, e.clientX, e.clientY);
  }

  zoomIn(): void { this.applyZoomCenter(0.8); }
  zoomOut(): void { this.applyZoomCenter(1.25); }

  resetView(): void {
    this.vb = { x: 0, y: 0, w: this.svgW, h: this.svgH };
    this.zoom = 1;
  }

  private applyZoom(factor: number, clientX: number, clientY: number): void {
    if (!this.vb) return;
    const newZoom = Math.max(0.3, Math.min(3, this.zoom / factor));
    const rect = this.canvasWrap.nativeElement.getBoundingClientRect();
    const mx = ((clientX - rect.left) / rect.width) * this.vb.w + this.vb.x;
    const my = ((clientY - rect.top) / rect.height) * this.vb.h + this.vb.y;
    const newW = this.svgW / newZoom;
    const newH = this.svgH / newZoom;
    this.vb = {
      x: mx - ((clientX - rect.left) / rect.width) * newW,
      y: my - ((clientY - rect.top) / rect.height) * newH,
      w: newW,
      h: newH,
    };
    this.zoom = newZoom;
  }

  private applyZoomCenter(factor: number): void {
    if (!this.vb) return;
    const newZoom = Math.max(0.3, Math.min(3, this.zoom / factor));
    const cx = this.vb.x + this.vb.w / 2;
    const cy = this.vb.y + this.vb.h / 2;
    const newW = this.svgW / newZoom;
    const newH = this.svgH / newZoom;
    this.vb = { x: cx - newW / 2, y: cy - newH / 2, w: newW, h: newH };
    this.zoom = newZoom;
  }

  /* ── Pan ── */
  onPanStart(e: MouseEvent): void {
    this.isPanning = true;
    this.panStart = { x: e.clientX, y: e.clientY };
  }

  onPanMove(e: MouseEvent): void {
    if (!this.isPanning || !this.vb) return;
    const rect = this.canvasWrap.nativeElement.getBoundingClientRect();
    const dx = ((e.clientX - this.panStart.x) / rect.width) * this.vb.w;
    const dy = ((e.clientY - this.panStart.y) / rect.height) * this.vb.h;
    this.vb = { ...this.vb, x: this.vb.x - dx, y: this.vb.y - dy };
    this.panStart = { x: e.clientX, y: e.clientY };
  }

  onPanEnd(): void {
    this.isPanning = false;
  }

  /* ── Track-by ── */
  trackNode(_: number, node: WorkflowNode): string { return node.id; }
  trackEdge(i: number, _: WorkflowEdge): number { return i; }
}
