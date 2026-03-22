import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { ArtifactsComponent } from './pages/artifacts/artifacts.component';
import { WorkflowsComponent } from './pages/workflows/workflows.component';
import { WorkflowCreateComponent } from './pages/workflows/workflow-create.component';
import { WorkflowEditComponent } from './pages/workflows/workflow-edit.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'artifacts', component: ArtifactsComponent },
  { path: 'workflows', component: WorkflowsComponent },
  { path: 'workflows/create', component: WorkflowCreateComponent },
  { path: 'workflows/:id/edit', component: WorkflowEditComponent },
  { path: '**', redirectTo: '' },
];
