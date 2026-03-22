import { Injectable, OnDestroy, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { EngineApiService } from './engine-api.service';

export interface WorkflowEvent {
  type: 'activity.completed';
  projectId: number;
  activityId: string;
  activatedActivities: string[];
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class WorkflowExecutionService implements OnDestroy {
  private eventSource: EventSource | null = null;
  private currentProjectId: number | null = null;

  /** Emits whenever the backend broadcasts a workflow event for the connected project. */
  readonly event$ = new Subject<WorkflowEvent>();

  constructor(private ngZone: NgZone, private engine: EngineApiService) {}

  connect(projectId: number): void {
    if (this.currentProjectId === projectId) return;
    this.disconnect();
    this.currentProjectId = projectId;

    const url = `${this.engine.baseUrl}/api/workflow/stream?projectId=${projectId}`;
    this.eventSource = new EventSource(url);

    this.eventSource.onmessage = (e: MessageEvent) => {
      try {
        const event: WorkflowEvent = JSON.parse(e.data);
        // EventSource fires outside Angular's zone — run inside to trigger change detection
        this.ngZone.run(() => this.event$.next(event));
      } catch {
        // malformed message — ignore
      }
    };

    this.eventSource.onerror = () => {
      console.warn('[sse] workflow stream error — will reconnect automatically');
    };

    console.log(`[sse] workflow stream connected for project ${projectId}`);
  }

  disconnect(): void {
    this.eventSource?.close();
    this.eventSource = null;
    this.currentProjectId = null;
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
