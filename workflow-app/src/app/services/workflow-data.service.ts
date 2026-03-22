import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { WorkflowNode, WorkflowEdge, ActionType, InputField } from '../models/workflow.model';
import { EngineApiService } from './engine-api.service';

interface ActivityDefinition {
  id: number;
  activityKey: string;
  versionId: number;
  label: string;
  nodeType: string;
  col: number;
  row: number;
  teamId: number | null;
  actionType: string;
  slaHours: number | null;
  handler: string | null;
  inputSchema: string | null;
}

interface ActivityTransition {
  id: number;
  fromActivityId: number;
  fromActivityKey: string;
  toActivityId: number;
  toActivityKey: string;
  condition: string | null;
  edgeType: string;
}

@Injectable({ providedIn: 'root' })
export class WorkflowDataService {
  private engine = inject(EngineApiService);

  readonly nodes$ = new BehaviorSubject<WorkflowNode[]>([]);
  readonly edges$ = new BehaviorSubject<WorkflowEdge[]>([]);

  get nodes(): WorkflowNode[] { return this.nodes$.value; }
  get edges(): WorkflowEdge[] { return this.edges$.value; }

  constructor() {
    this.loadWorkflow();
  }

  loadWorkflow(versionId?: number): void {
    const param = versionId ? `?versionId=${versionId}` : '';

    this.engine.get<ActivityDefinition[]>(`/api/workflow/activities${param}`).subscribe((activities) => {
      this.nodes$.next(
        activities.map((s) => {
          let inputSchema: InputField[] | undefined;
          if (s.inputSchema) {
            try {
              const parsed = JSON.parse(s.inputSchema);
              if (Array.isArray(parsed)) inputSchema = parsed;
            } catch { /* ignore malformed inputSchema */ }
          }
          return {
            id: s.activityKey,
            label: s.label,
            type: s.nodeType as WorkflowNode['type'],
            col: s.col,
            row: s.row,
            actionType: (s.actionType ?? 'manual') as ActionType,
            inputSchema,
          };
        })
      );
    });

    this.engine.get<ActivityTransition[]>(`/api/workflow/transitions${param}`).subscribe((transitions) => {
      this.edges$.next(
        transitions.map((t) => ({
          from: t.fromActivityKey,
          to: t.toActivityKey,
          label: t.condition ? this.formatLabel(t.condition) : undefined,
          type: t.edgeType === 'loop' ? ('loop' as const) : undefined,
        }))
      );
    });
  }

  private formatLabel(condition: string): string {
    return condition.charAt(0).toUpperCase() + condition.slice(1);
  }

  getCompletedNodes(activeNodeId: string): Set<string> {
    const visited = new Set<string>();
    const queue = ['start'];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current) || current === activeNodeId) continue;
      visited.add(current);
      this.edges.filter((e) => e.from === current).forEach((e) => queue.push(e.to));
    }
    return visited;
  }
}
