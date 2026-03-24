import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { EngineApiService } from './engine-api.service';

export interface AppNotification {
  id:                  number;
  message:             string;
  timestamp:           string;
  read:                boolean;
  projectId:           number;
  activityId:          string;
  activityLabel:       string;
  activatedActivities: string[];
}

const MAX_NOTIFICATIONS = 50;
const STORAGE_KEY      = 'workflow_notifications';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private engine = inject(EngineApiService);
  readonly notifications = signal<AppNotification[]>(this.load());
  readonly unreadCount   = computed(() => this.notifications().filter(n => !n.read).length);

  private nextId = (this.notifications().at(0)?.id ?? 0) + 1;
  private es: EventSource | null = null;

  constructor() {
    // Persist to localStorage whenever notifications change
    effect(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.notifications()));
    });

    this.connect();
  }

  private load(): AppNotification[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private connect(): void {
    this.es?.close();
    this.es = new EventSource(`${this.engine.baseUrl}/api/workflow/stream/global`);

    this.es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        this.push(event);
      } catch { /* malformed message — ignore */ }
    };

    this.es.onerror = () => {
      this.es?.close();
      setTimeout(() => this.connect(), 5000);
    };
  }

  private push(event: { type: string; projectId: number; activityId: string; activityLabel?: string; activatedActivities: string[]; timestamp: string }): void {
    const activated = event.activatedActivities?.length
      ? ` → ${event.activatedActivities.join(', ')}`
      : '';

    const label = event.activityLabel ?? event.activityId;

    const n: AppNotification = {
      id:                  this.nextId++,
      message:             `[Project ${event.projectId}] ${label} completed${activated}`,
      timestamp:           event.timestamp,
      read:                false,
      projectId:           event.projectId,
      activityId:          event.activityId,
      activityLabel:       label,
      activatedActivities: event.activatedActivities ?? [],
    };

    this.notifications.update(ns => [n, ...ns].slice(0, MAX_NOTIFICATIONS));
  }

  markAllRead(): void {
    this.notifications.update(ns => ns.map(n => ({ ...n, read: true })));
  }

  clear(): void {
    this.notifications.set([]);
  }
}
