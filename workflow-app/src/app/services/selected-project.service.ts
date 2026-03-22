import { Injectable, signal } from '@angular/core';

export interface Project {
  id: number;
  accountNumber: string;
  accountName: string;
  activity: string;
  workflowVersionId: number;
}

@Injectable({ providedIn: 'root' })
export class SelectedProjectService {
  readonly selected = signal<Project | null>(null);

  select(project: Project | null): void {
    this.selected.set(project);
  }
}