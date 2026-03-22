import { Component, signal, computed, inject, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SelectedProjectService } from '../../services/selected-project.service';
import { EngineApiService } from '../../services/engine-api.service';

type ArtifactSubType = 'document' | 'email' | 'message' | 'communication';
type ArtifactType = 'all' | ArtifactSubType;
type AzOp = 'upload' | 'create' | 'list' | 'download' | 'delete' | 'sas-upload' | 'sas-download' | 'sas-container';

interface ArtifactCategory {
  key: ArtifactType;
  label: string;
  icon: string;
}

interface ArtifactSubCategory {
  key: ArtifactSubType;
  label: string;
  icon: string;
}

interface Artifact {
  id: number;
  projectId: number;
  type: ArtifactSubType;
  title: string;
  content: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string;
}

interface AzureBlob {
  name: string;
  contentLength: number | undefined;
  lastModified: Date;
  contentType: string | undefined;
}

const CATEGORIES: ArtifactCategory[] = [
  { key: 'all',           label: 'All',            icon: 'M3 6h18M3 12h18M3 18h18' },
  { key: 'document',      label: 'Documents',      icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'email',         label: 'Emails',         icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { key: 'message',       label: 'Messages',       icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { key: 'communication', label: 'Communications', icon: 'M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z' },
];

const TYPE_COLORS: Record<string, string> = {
  document:      '#3b82f6',
  email:         '#10b981',
  message:       '#f59e0b',
  communication: '#8b5cf6',
};


@Component({
  selector: 'app-artifacts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">

      <!-- Top bar -->
      <div class="topbar">
        <button class="back-btn" (click)="goBack()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Back
        </button>

        <div class="topbar-center">
          <span class="page-label">ARTIFACTS</span>
          <ng-container *ngIf="selectedProject.selected() as p">
            <span class="sep">—</span>
            <span class="project-name">{{ p.accountName }}</span>
          </ng-container>
        </div>

        <button class="add-btn" (click)="openDialog()" [disabled]="!selectedProject.selected()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          New Artifact
        </button>
      </div>

      <!-- Azure Storage Toolbar -->
      <div class="az-toolbar">
        <div class="az-brand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                  stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          AZURE STORAGE
        </div>

        <div class="az-divider"></div>

        <label class="az-label">Container</label>
        <input class="az-input" [(ngModel)]="azContainer" placeholder="my-container"/>

        <div class="az-divider"></div>

        <span class="az-group-label">BLOBS</span>

        <button class="az-btn" title="Upload file to Azure" (click)="openAzDialog('upload')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 15V3m0 0l-4 4m4-4l4 4M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2"
                  stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Upload
        </button>

        <button class="az-btn" title="Create a text or JSON blob" (click)="openAzDialog('create')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Create
        </button>

        <button class="az-btn" title="List blobs in container" (click)="openAzDialog('list')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
          </svg>
          List
        </button>

        <button class="az-btn" title="Download blob through server" (click)="openAzDialog('download')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2"
                  stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Download
        </button>

        <button class="az-btn az-btn-danger" title="Delete a blob" (click)="openAzDialog('delete')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Delete
        </button>

        <div class="az-divider"></div>

        <span class="az-group-label">SAS</span>

        <button class="az-btn az-btn-sas" title="Generate upload SAS URL" (click)="openAzDialog('sas-upload')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
          </svg>
          Upload URL
        </button>

        <button class="az-btn az-btn-sas" title="Generate download SAS URL" (click)="openAzDialog('sas-download')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
          </svg>
          Download URL
        </button>

        <button class="az-btn az-btn-sas" title="Generate container-level SAS URL" (click)="openAzDialog('sas-container')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
          </svg>
          Container URL
        </button>
      </div>

      <div class="layout">

        <!-- Sidebar -->
        <aside class="sidebar">
          <div class="sidebar-section">
            <p class="sidebar-title">TYPE</p>
            <ul class="nav-list">
              <li *ngFor="let cat of categories"
                  class="nav-item"
                  [class.active]="activeFilter() === cat.key"
                  (click)="activeFilter.set(cat.key)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path [attr.d]="cat.icon" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                {{ cat.label }}
                <span class="nav-count" *ngIf="countFor(cat.key) > 0">{{ countFor(cat.key) }}</span>
              </li>
            </ul>
          </div>
        </aside>

        <!-- Main content -->
        <main class="main">

          <!-- No project selected -->
          <div class="empty-state" *ngIf="!selectedProject.selected()">
            <div class="empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <path d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" stroke-width="1.4"/>
              </svg>
            </div>
            <p class="empty-title">No project selected</p>
            <p class="empty-desc">Select a project from the header to view its artifacts.</p>
          </div>

          <!-- Loading -->
          <div class="empty-state" *ngIf="selectedProject.selected() && loading()">
            <span class="spinner"></span>
            <p class="empty-desc">Loading artifacts…</p>
          </div>

          <!-- Empty artifacts -->
          <div class="empty-state" *ngIf="selectedProject.selected() && !loading() && filteredArtifacts().length === 0">
            <div class="empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <p class="empty-title">No artifacts yet</p>
            <p class="empty-desc">Store documents, emails, messages, and communications<br>related to this project in one place.</p>
            <button class="add-btn" (click)="openDialog()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              Add your first artifact
            </button>
          </div>

          <!-- Artifact list -->
          <div class="artifact-list" *ngIf="selectedProject.selected() && !loading() && filteredArtifacts().length > 0">
            <div class="artifact-card" *ngFor="let a of filteredArtifacts()">
              <div class="card-accent" [style.background]="typeColor(a.type)"></div>
              <div class="card-body">
                <div class="card-header">
                  <span class="card-type" [style.color]="typeColor(a.type)">{{ a.type | uppercase }}</span>
                  <span class="card-date">{{ a.createdAt | date:'MMM d, y' }}</span>
                </div>
                <div class="card-title">{{ a.title }}</div>
                <div class="card-content" *ngIf="a.content">{{ a.content }}</div>
                <div class="card-file" *ngIf="a.fileName">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <path d="M15.172 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8.828a2 2 0 00-.586-1.414l-3.828-3.828A2 2 0 0015.172 2z" stroke="currentColor" stroke-width="1.6"/>
                  </svg>
                  {{ a.fileName }}
                  <span *ngIf="a.fileSize">· {{ formatSize(a.fileSize) }}</span>
                </div>
              </div>
              <button class="download-btn" *ngIf="a.fileName" (click)="downloadArtifact(a)" title="Download">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <button class="delete-btn" (click)="deleteArtifact(a)" title="Delete">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          </div>

        </main>
      </div>

      <!-- New artifact dialog -->
      <div class="dialog-backdrop" *ngIf="dialogOpen()" (click)="closeDialog()">
        <div class="dialog" (click)="$event.stopPropagation()">
          <div class="dialog-header">
            <span class="dialog-title">New Artifact</span>
            <button class="dialog-close" (click)="closeDialog()">✕</button>
          </div>

          <div class="dialog-body">
            <label class="field-label">Type</label>
            <div class="type-grid">
              <button
                *ngFor="let cat of artifactTypes"
                class="type-btn"
                [class.selected]="newType === cat.key"
                [style.--type-color]="typeColor(cat.key)"
                (click)="newType = cat.key">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path [attr.d]="cat.icon" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                {{ cat.label }}
              </button>
            </div>

            <label class="field-label">Title</label>
            <input
              class="field-input"
              [(ngModel)]="newTitle"
              placeholder="e.g. Requirements Document v1.2"
              (keydown.enter)="save()"
            />

            <label class="field-label">Content <span class="field-optional">(optional)</span></label>
            <textarea
              class="field-textarea"
              [(ngModel)]="newContent"
              placeholder="Notes, body, or summary…"
              rows="4"
            ></textarea>

            <label class="field-label">File <span class="field-optional">(optional)</span></label>
            <div class="file-drop" (click)="fileInput.click()" (dragover)="$event.preventDefault()" (drop)="onDrop($event)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span *ngIf="!selectedFile">Drop a file or click to browse</span>
              <span *ngIf="selectedFile" class="file-selected">{{ selectedFile.name }} <em>({{ formatSize(selectedFile.size) }})</em></span>
              <input #fileInput type="file" style="display:none" (change)="onFileChange($event)"/>
            </div>

            <p class="dialog-error" *ngIf="saveError">{{ saveError }}</p>
          </div>

          <div class="dialog-footer">
            <button class="cancel-btn" (click)="closeDialog()">Cancel</button>
            <button class="save-btn" (click)="save()" [disabled]="saving()">
              {{ saving() ? 'Saving…' : 'Save Artifact' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Azure Storage dialog -->
      <div class="dialog-backdrop" *ngIf="azOp" (click)="closeAzDialog()">
        <div class="dialog az-dialog" (click)="$event.stopPropagation()">
          <div class="dialog-header">
            <div class="az-dialog-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                      stroke="#0078d4" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>{{ azDialogTitle() }}</span>
            </div>
            <button class="dialog-close" (click)="closeAzDialog()">✕</button>
          </div>

          <div class="dialog-body">

            <!-- Container display -->
            <div class="az-info-row">
              <span class="az-info-label">Container</span>
              <span class="az-info-value">{{ azContainer || '(none set)' }}</span>
            </div>

            <!-- Blob name (most ops) -->
            <ng-container *ngIf="azNeedsBlobName()">
              <label class="field-label">
                Blob Name
                <span class="field-optional" *ngIf="azOp === 'upload'">(optional — defaults to file name)</span>
              </label>
              <input class="field-input" [(ngModel)]="azBlobName" placeholder="path/to/file.txt"/>
            </ng-container>

            <!-- File picker (upload) -->
            <ng-container *ngIf="azOp === 'upload'">
              <label class="field-label">File</label>
              <div class="file-drop" (click)="azFileInput.click()" (dragover)="$event.preventDefault()" (drop)="onAzDrop($event)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 15V3m0 0l-4 4m4-4l4 4M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2"
                        stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span *ngIf="!azFile">Drop a file or click to browse</span>
                <span *ngIf="azFile" class="file-selected">{{ azFile.name }} <em>({{ formatSize(azFile.size) }})</em></span>
                <input #azFileInput type="file" style="display:none" (change)="onAzFileChange($event)"/>
              </div>
            </ng-container>

            <!-- Content (create) -->
            <ng-container *ngIf="azOp === 'create'">
              <label class="field-label">Content Type</label>
              <input class="field-input" [(ngModel)]="azContentType" placeholder="text/plain"/>
              <label class="field-label">Content</label>
              <textarea class="field-textarea" [(ngModel)]="azContent" rows="5" placeholder="Blob content…"></textarea>
            </ng-container>

            <!-- Prefix (list) -->
            <ng-container *ngIf="azOp === 'list'">
              <label class="field-label">Prefix <span class="field-optional">(optional)</span></label>
              <input class="field-input" [(ngModel)]="azPrefix" placeholder="folder/subfolder/"/>
            </ng-container>

            <!-- Permissions (sas-container) -->
            <ng-container *ngIf="azOp === 'sas-container'">
              <label class="field-label">Permissions</label>
              <input class="field-input" [(ngModel)]="azPermissions" placeholder="rl"/>
              <p class="az-hint">r=read &nbsp; a=add &nbsp; c=create &nbsp; w=write &nbsp; d=delete &nbsp; l=list</p>
            </ng-container>

            <!-- Expires (all SAS ops) -->
            <ng-container *ngIf="azIsSasOp()">
              <label class="field-label">Expires in (minutes)</label>
              <input class="field-input" type="number" [(ngModel)]="azExpires" min="1" max="10080"/>
            </ng-container>

            <!-- SAS URL result -->
            <ng-container *ngIf="azResult() && azOp !== 'delete'">
              <label class="field-label">Result URL</label>
              <div class="az-result-box">
                <span class="az-result-url">{{ azResult() }}</span>
                <button class="az-copy-btn" (click)="copyAzResult()" title="Copy to clipboard">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
            </ng-container>

            <!-- Delete success -->
            <div class="az-success" *ngIf="azResult() && azOp === 'delete'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              {{ azResult() }}
            </div>

            <!-- Upload success -->
            <div class="az-success" *ngIf="azResult() && azOp === 'upload'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Uploaded — <span class="az-result-url-inline">{{ azResult() }}</span>
            </div>

            <!-- Blob list results -->
            <ng-container *ngIf="azOp === 'list' && azBlobs().length > 0">
              <label class="field-label">{{ azBlobs().length }} blob(s) found</label>
              <div class="az-blob-list">
                <div class="az-blob-row" *ngFor="let b of azBlobs()">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <path d="M15.172 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8.828a2 2 0 00-.586-1.414l-3.828-3.828A2 2 0 0015.172 2z"
                          stroke="currentColor" stroke-width="1.5"/>
                  </svg>
                  <span class="az-blob-name">{{ b.name }}</span>
                  <span class="az-blob-meta" *ngIf="b.contentLength !== undefined">{{ formatSize(b.contentLength) }}</span>
                  <span class="az-blob-meta">{{ b.contentType ?? '—' }}</span>
                </div>
              </div>
            </ng-container>

            <div class="az-empty-list" *ngIf="azOp === 'list' && azBlobs().length === 0 && !azWorking() && azResult() === null && !azError()">
              Run List to see blobs in this container.
            </div>

            <div class="az-empty-list" *ngIf="azOp === 'list' && azBlobs().length === 0 && !azWorking() && azListRan()">
              No blobs found.
            </div>

            <p class="dialog-error" *ngIf="azError()">{{ azError() }}</p>
          </div>

          <div class="dialog-footer">
            <button class="cancel-btn" (click)="closeAzDialog()">Close</button>
            <button class="az-action-btn" (click)="runAzOp()" [disabled]="azWorking()">
              <span class="spinner-sm" *ngIf="azWorking()"></span>
              {{ azWorking() ? 'Working…' : azActionLabel() }}
            </button>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .page {
      display: flex;
      flex-direction: column;
      height: calc(100vh - var(--header-height));
      background: var(--bg-deepest);
    }

    /* ── Top bar ── */
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      height: 52px;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-deep);
      flex-shrink: 0;
    }

    .back-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      background: none;
      border: none;
      color: var(--text-dim);
      font-family: var(--font-mono);
      font-size: 11px;
      letter-spacing: 0.5px;
      cursor: pointer;
      padding: 6px 10px;
      border-radius: 6px;
      transition: color 0.2s, background 0.2s;
    }
    .back-btn:hover { color: var(--text-secondary); background: var(--border-subtle); }

    .topbar-center {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--font-mono);
      font-size: 12px;
      letter-spacing: 1px;
    }
    .page-label { color: var(--accent-cyan); font-weight: 700; }
    .sep { color: var(--text-dim); }
    .project-name { color: var(--text-secondary); }

    .add-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 14px;
      border-radius: 8px;
      border: 1px solid var(--border-medium);
      background: var(--bg-card);
      color: var(--text-secondary);
      font-family: var(--font-mono);
      font-size: 11px;
      letter-spacing: 0.5px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .add-btn:hover:not(:disabled) { border-color: var(--accent-cyan); color: var(--accent-cyan); }
    .add-btn:disabled { opacity: 0.4; cursor: default; }

    /* ── Azure Storage Toolbar ── */
    .az-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 16px;
      height: 42px;
      border-bottom: 1px solid rgba(0,120,212,0.2);
      background: rgba(0,120,212,0.04);
      flex-shrink: 0;
      overflow-x: auto;
      overflow-y: hidden;
    }
    .az-toolbar::-webkit-scrollbar { height: 3px; }
    .az-toolbar::-webkit-scrollbar-thumb { background: rgba(0,120,212,0.3); border-radius: 2px; }

    .az-brand {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      color: #0078d4;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .az-divider {
      width: 1px;
      height: 20px;
      background: rgba(0,120,212,0.2);
      flex-shrink: 0;
      margin: 0 4px;
    }

    .az-label {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-dim);
      letter-spacing: 0.5px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .az-group-label {
      font-family: var(--font-mono);
      font-size: 9px;
      letter-spacing: 0.8px;
      color: rgba(0,120,212,0.6);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .az-input {
      height: 26px;
      padding: 0 9px;
      border-radius: 6px;
      border: 1px solid rgba(0,120,212,0.3);
      background: rgba(0,120,212,0.06);
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 11px;
      width: 160px;
      flex-shrink: 0;
      transition: border-color 0.15s;
    }
    .az-input:focus { outline: none; border-color: #0078d4; }
    .az-input::placeholder { color: var(--text-dim); }

    .az-btn {
      display: flex;
      align-items: center;
      gap: 5px;
      height: 26px;
      padding: 0 10px;
      border-radius: 6px;
      border: 1px solid rgba(0,120,212,0.3);
      background: rgba(0,120,212,0.07);
      color: #4da3e8;
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 0.3px;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
      transition: all 0.15s ease;
    }
    .az-btn:hover { background: rgba(0,120,212,0.15); border-color: #0078d4; color: #60b4f5; }

    .az-btn-danger {
      border-color: rgba(239,68,68,0.3);
      background: rgba(239,68,68,0.06);
      color: #f87171;
    }
    .az-btn-danger:hover { background: rgba(239,68,68,0.14); border-color: #ef4444; color: #fca5a5; }

    .az-btn-sas {
      border-color: rgba(139,92,246,0.3);
      background: rgba(139,92,246,0.07);
      color: #a78bfa;
    }
    .az-btn-sas:hover { background: rgba(139,92,246,0.15); border-color: #8b5cf6; color: #c4b5fd; }

    /* ── Layout ── */
    .layout { display: flex; flex: 1; overflow: hidden; }

    /* ── Sidebar ── */
    .sidebar {
      width: 200px;
      flex-shrink: 0;
      border-right: 1px solid var(--border-subtle);
      background: var(--bg-deep);
      padding: 20px 12px;
      overflow-y: auto;
    }

    .sidebar-section { margin-bottom: 24px; }

    .sidebar-title {
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 1.2px;
      color: var(--text-dim);
      padding: 0 10px;
      margin-bottom: 6px;
    }

    .nav-list { list-style: none; display: flex; flex-direction: column; gap: 2px; }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 7px 10px;
      border-radius: 7px;
      font-size: 13px;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .nav-item:hover { background: var(--border-subtle); color: var(--text-primary); }
    .nav-item.active { background: var(--accent-cyan-muted); color: var(--accent-cyan); }
    .nav-item svg { flex-shrink: 0; }

    .nav-count {
      margin-left: auto;
      font-family: var(--font-mono);
      font-size: 10px;
      background: var(--border-subtle);
      padding: 1px 6px;
      border-radius: 10px;
    }

    /* ── Main ── */
    .main { flex: 1; overflow-y: auto; padding: 24px; }

    /* ── Empty state ── */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      text-align: center;
      padding: 48px 24px;
      margin: auto;
      max-width: 400px;
    }

    .empty-icon {
      width: 72px;
      height: 72px;
      border-radius: 18px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-card);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-dim);
      margin-bottom: 8px;
    }

    .empty-title { font-size: 16px; font-weight: 600; color: var(--text-primary); }
    .empty-desc { font-size: 13px; color: var(--text-muted); line-height: 1.65; margin-bottom: 8px; }

    .spinner {
      width: 20px; height: 20px;
      border: 2px solid var(--border-subtle);
      border-top-color: var(--accent-cyan);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: inline-block;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Artifact list ── */
    .artifact-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 760px;
    }

    .artifact-card {
      display: flex;
      align-items: stretch;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      overflow: hidden;
      transition: border-color 0.15s ease;
    }
    .artifact-card:hover { border-color: var(--border-medium); }

    .card-accent { width: 4px; flex-shrink: 0; }

    .card-body { flex: 1; padding: 14px 16px; min-width: 0; }

    .card-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
    }

    .card-type {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.8px;
    }

    .card-date {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-dim);
      margin-left: auto;
    }

    .card-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }

    .card-content {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 6px;
      line-height: 1.55;
      white-space: pre-wrap;
      max-height: 120px;
      overflow-y: auto;
    }

    .card-file {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 6px;
      font-size: 11px;
      color: var(--text-dim);
      font-family: var(--font-mono);
    }

    .download-btn {
      flex-shrink: 0;
      width: 36px;
      background: none;
      border: none;
      border-left: 1px solid var(--border-subtle);
      color: var(--text-dim);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s, background 0.15s;
    }
    .download-btn:hover { color: var(--accent-cyan); background: rgba(56,189,248,0.06); }

    .delete-btn {
      flex-shrink: 0;
      width: 36px;
      background: none;
      border: none;
      border-left: 1px solid var(--border-subtle);
      color: var(--text-dim);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s, background 0.15s;
    }
    .delete-btn:hover { color: #ef4444; background: rgba(239,68,68,0.06); }

    .file-drop {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 18px;
      border: 1px dashed var(--border-medium);
      border-radius: 8px;
      color: var(--text-dim);
      font-size: 12px;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
      text-align: center;
    }
    .file-drop:hover { border-color: var(--accent-cyan); color: var(--accent-cyan); }
    .file-selected { color: var(--text-primary); font-family: var(--font-mono); font-size: 11px; }
    .file-selected em { color: var(--text-dim); font-style: normal; }

    /* ── Dialog ── */
    .dialog-backdrop {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.15s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    .dialog {
      background: var(--bg-card);
      border: 1px solid var(--border-medium);
      border-radius: 14px;
      width: 480px;
      max-width: calc(100vw - 48px);
      box-shadow: 0 24px 48px rgba(0,0,0,0.4);
      animation: slideUp 0.2s ease;
    }
    @keyframes slideUp { from { transform: translateY(12px); opacity: 0; } to { transform: none; opacity: 1; } }

    .dialog-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 20px 0;
    }

    .dialog-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }

    .dialog-close {
      background: none; border: none; color: var(--text-dim);
      cursor: pointer; font-size: 14px; padding: 4px 6px; border-radius: 5px;
      transition: color 0.15s, background 0.15s;
    }
    .dialog-close:hover { color: var(--text-primary); background: var(--border-subtle); }

    .dialog-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }

    .field-label {
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 0.8px;
      color: var(--text-dim);
      margin-bottom: 4px;
      display: block;
    }
    .field-optional { color: var(--text-dim); font-size: 9px; }

    .type-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .type-btn {
      display: flex; align-items: center; gap: 8px;
      padding: 9px 12px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-surface);
      color: var(--text-secondary);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .type-btn:hover { border-color: var(--type-color, var(--accent-cyan)); color: var(--type-color, var(--accent-cyan)); }
    .type-btn.selected {
      border-color: var(--type-color, var(--accent-cyan));
      color: var(--type-color, var(--accent-cyan));
      background: color-mix(in srgb, var(--type-color, var(--accent-cyan)) 10%, transparent);
    }

    .field-input, .field-textarea {
      width: 100%;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 9px 12px;
      color: var(--text-primary);
      font-size: 13px;
      font-family: inherit;
      box-sizing: border-box;
      transition: border-color 0.15s;
      resize: vertical;
    }
    .field-input:focus, .field-textarea:focus {
      outline: none;
      border-color: var(--accent-cyan);
    }

    .dialog-error {
      font-size: 12px;
      color: #ef4444;
      font-family: var(--font-mono);
    }

    .dialog-footer {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 12px 20px 18px;
      border-top: 1px solid var(--border-subtle);
    }

    .cancel-btn {
      padding: 8px 16px; border-radius: 8px;
      border: 1px solid var(--border-subtle);
      background: none; color: var(--text-secondary);
      font-size: 13px; cursor: pointer;
      transition: all 0.15s;
    }
    .cancel-btn:hover { border-color: var(--border-medium); color: var(--text-primary); }

    .save-btn {
      padding: 8px 18px; border-radius: 8px;
      border: none;
      background: var(--accent-cyan);
      color: #000;
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: opacity 0.15s;
    }
    .save-btn:hover:not(:disabled) { opacity: 0.85; }
    .save-btn:disabled { opacity: 0.5; cursor: default; }

    /* ── Azure dialog specifics ── */
    .az-dialog { border-color: rgba(0,120,212,0.3); max-height: 80vh; display: flex; flex-direction: column; }
    .az-dialog .dialog-body { overflow-y: auto; }

    .az-dialog-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .az-action-btn {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 8px 18px;
      border-radius: 8px;
      border: none;
      background: #0078d4;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .az-action-btn:hover:not(:disabled) { opacity: 0.85; }
    .az-action-btn:disabled { opacity: 0.5; cursor: default; }

    .az-info-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 10px;
      background: rgba(0,120,212,0.06);
      border: 1px solid rgba(0,120,212,0.15);
      border-radius: 7px;
    }
    .az-info-label {
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 0.5px;
      color: rgba(0,120,212,0.7);
    }
    .az-info-value {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-primary);
    }

    .az-hint {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-dim);
      margin: 0;
    }

    .az-result-box {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-surface);
      border: 1px solid rgba(0,120,212,0.25);
      border-radius: 8px;
      padding: 8px 10px;
    }
    .az-result-url {
      flex: 1;
      font-family: var(--font-mono);
      font-size: 10px;
      color: #4da3e8;
      word-break: break-all;
      line-height: 1.5;
    }
    .az-result-url-inline {
      font-family: var(--font-mono);
      font-size: 11px;
      color: #4da3e8;
      word-break: break-all;
    }
    .az-copy-btn {
      flex-shrink: 0;
      background: none;
      border: 1px solid rgba(0,120,212,0.3);
      border-radius: 6px;
      color: #4da3e8;
      cursor: pointer;
      padding: 4px 6px;
      display: flex;
      align-items: center;
      transition: background 0.15s;
    }
    .az-copy-btn:hover { background: rgba(0,120,212,0.12); }

    .az-success {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 12px;
      color: #34d399;
      font-family: var(--font-mono);
      padding: 8px 10px;
      border-radius: 7px;
      background: rgba(52,211,153,0.07);
      border: 1px solid rgba(52,211,153,0.2);
    }

    .az-blob-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-height: 240px;
      overflow-y: auto;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 6px;
    }
    .az-blob-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 8px;
      border-radius: 6px;
      transition: background 0.1s;
    }
    .az-blob-row:hover { background: var(--border-subtle); }
    .az-blob-name {
      flex: 1;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-primary);
      word-break: break-all;
    }
    .az-blob-meta {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-dim);
      white-space: nowrap;
    }

    .az-empty-list {
      text-align: center;
      font-size: 12px;
      color: var(--text-dim);
      padding: 12px;
    }

    .spinner-sm {
      width: 12px; height: 12px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: inline-block;
    }
  `],
})
export class ArtifactsComponent implements OnInit {
  private http = inject(EngineApiService);
  private router = inject(Router);
  readonly selectedProject = inject(SelectedProjectService);

  readonly categories = CATEGORIES;
  readonly artifactTypes: ArtifactSubCategory[] = CATEGORIES.filter(c => c.key !== 'all') as ArtifactSubCategory[];
  readonly activeFilter = signal<ArtifactType>('all');
  readonly loading = signal(false);
  readonly dialogOpen = signal(false);
  readonly saving = signal(false);

  artifacts = signal<Artifact[]>([]);

  newType: ArtifactSubType = 'document';
  newTitle = '';
  newContent = '';
  saveError = '';
  selectedFile: File | null = null;

  // Azure Storage state
  azOp: AzOp | null = null;
  azContainer = '';

  constructor() {
    effect(() => {
      const p = this.selectedProject.selected();
      if (p) this.azContainer = p.accountNumber;
    });
  }
  azBlobName = '';
  azContent = '';
  azContentType = 'text/plain';
  azPermissions = 'rl';
  azExpires = 60;
  azPrefix = '';
  azFile: File | null = null;
  readonly azWorking = signal(false);
  readonly azError = signal<string | null>(null);
  readonly azResult = signal<string | null>(null);
  readonly azBlobs = signal<AzureBlob[]>([]);
  readonly azListRan = signal(false);

  readonly filteredArtifacts = computed(() => {
    const f = this.activeFilter();
    return f === 'all' ? this.artifacts() : this.artifacts().filter(a => a.type === f);
  });

  ngOnInit(): void {
    const project = this.selectedProject.selected();
    if (project) this.loadArtifacts(project.id);
  }

  countFor(type: ArtifactType): number {
    if (type === 'all') return this.artifacts().length;
    return this.artifacts().filter(a => a.type === type).length;
  }

  typeColor(type: string): string {
    return TYPE_COLORS[type] ?? '#64748b';
  }

  loadArtifacts(projectId: number): void {
    this.loading.set(true);
    this.engine.get<Artifact[]>(`/api/projects/${projectId}/artifacts`).subscribe({
      next: (data) => { this.artifacts.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openDialog(): void {
    this.newType = 'document';
    this.newTitle = '';
    this.newContent = '';
    this.saveError = '';
    this.selectedFile = null;
    this.dialogOpen.set(true);
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.selectedFile = event.dataTransfer?.files?.[0] ?? null;
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  downloadArtifact(artifact: Artifact): void {
    const project = this.selectedProject.selected();
    if (!project) return;
    window.open(`/api/projects/${project.id}/artifacts/${artifact.id}/file`, '_blank');
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  save(): void {
    if (!this.newTitle.trim()) { this.saveError = 'Title is required.'; return; }
    const project = this.selectedProject.selected();
    if (!project) return;

    this.saving.set(true);
    this.saveError = '';

    const body = new FormData();
    body.append('type', this.newType);
    body.append('title', this.newTitle.trim());
    if (this.newContent.trim()) body.append('content', this.newContent.trim());
    if (this.selectedFile) body.append('file', this.selectedFile);

    this.engine.post<Artifact>(`/api/projects/${project.id}/artifacts`, body).subscribe({
      next: (created) => {
        this.artifacts.update(list => [created, ...list]);
        this.saving.set(false);
        this.closeDialog();
      },
      error: (err) => {
        this.saveError = err.error?.error ?? 'Failed to save.';
        this.saving.set(false);
      },
    });
  }

  deleteArtifact(artifact: Artifact): void {
    if (!confirm(`Delete "${artifact.title}"?`)) return;
    const project = this.selectedProject.selected();
    if (!project) return;

    this.engine.delete(`/api/projects/${project.id}/artifacts/${artifact.id}`).subscribe(() => {
      this.artifacts.update(list => list.filter(a => a.id !== artifact.id));
    });
  }

  goBack(): void {
    this.router.navigate(['/']);
  }

  // ── Azure Storage ──

  openAzDialog(op: AzOp): void {
    this.azOp = op;
    this.azBlobName = '';
    this.azContent = '';
    this.azContentType = 'text/plain';
    this.azPermissions = 'rl';
    this.azExpires = 60;
    this.azPrefix = '';
    this.azFile = null;
    this.azWorking.set(false);
    this.azError.set(null);
    this.azResult.set(null);
    this.azBlobs.set([]);
    this.azListRan.set(false);
  }

  closeAzDialog(): void {
    this.azOp = null;
  }

  azNeedsBlobName(): boolean {
    return this.azOp !== 'list' && this.azOp !== 'sas-container';
  }

  azIsSasOp(): boolean {
    return this.azOp === 'sas-upload' || this.azOp === 'sas-download' || this.azOp === 'sas-container';
  }

  azDialogTitle(): string {
    const titles: Record<AzOp, string> = {
      'upload': 'Upload File',
      'create': 'Create Blob',
      'list': 'List Blobs',
      'download': 'Download Blob',
      'delete': 'Delete Blob',
      'sas-upload': 'Generate Upload SAS URL',
      'sas-download': 'Generate Download SAS URL',
      'sas-container': 'Generate Container SAS URL',
    };
    return this.azOp ? titles[this.azOp] : '';
  }

  azActionLabel(): string {
    const labels: Record<AzOp, string> = {
      'upload': 'Upload',
      'create': 'Create',
      'list': 'List',
      'download': 'Download',
      'delete': 'Delete',
      'sas-upload': 'Generate URL',
      'sas-download': 'Generate URL',
      'sas-container': 'Generate URL',
    };
    return this.azOp ? labels[this.azOp] : '';
  }

  onAzFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.azFile = input.files?.[0] ?? null;
  }

  onAzDrop(event: DragEvent): void {
    event.preventDefault();
    this.azFile = event.dataTransfer?.files?.[0] ?? null;
  }

  copyAzResult(): void {
    const url = this.azResult();
    if (url) navigator.clipboard.writeText(url);
  }

  runAzOp(): void {
    if (!this.azContainer.trim()) {
      this.azError.set('Container name is required — fill in the Container field in the toolbar.');
      return;
    }

    this.azWorking.set(true);
    this.azError.set(null);
    this.azResult.set(null);
    this.azBlobs.set([]);

    const container = this.azContainer.trim();

    switch (this.azOp) {
      case 'upload': {
        if (!this.azFile) { this.azError.set('A file is required.'); this.azWorking.set(false); return; }
        const form = new FormData();
        form.append('file', this.azFile);
        if (this.azBlobName.trim()) form.append('blobName', this.azBlobName.trim());
        this.engine.post<{ blobUrl: string }>(`/api/storage/${container}/upload`, form).subscribe({
          next: (r) => { this.azResult.set(r.blobUrl); this.azWorking.set(false); },
          error: (e) => { this.azError.set(e.error?.error ?? 'Upload failed.'); this.azWorking.set(false); },
        });
        break;
      }
      case 'create': {
        if (!this.azBlobName.trim()) { this.azError.set('Blob name is required.'); this.azWorking.set(false); return; }
        this.engine.post<{ blobUrl: string }>(`/api/storage/${container}/create`, {
          blobName: this.azBlobName.trim(),
          content: this.azContent,
          contentType: this.azContentType || 'text/plain',
        }).subscribe({
          next: (r) => { this.azResult.set(r.blobUrl); this.azWorking.set(false); },
          error: (e) => { this.azError.set(e.error?.error ?? 'Create failed.'); this.azWorking.set(false); },
        });
        break;
      }
      case 'list': {
        const qs = this.azPrefix ? `?prefix=${encodeURIComponent(this.azPrefix)}` : '';
        this.engine.get<AzureBlob[]>(`/api/storage/${container}/list${qs}`).subscribe({
          next: (r) => { this.azBlobs.set(r); this.azListRan.set(true); this.azWorking.set(false); },
          error: (e) => { this.azError.set(e.error?.error ?? 'List failed.'); this.azWorking.set(false); },
        });
        break;
      }
      case 'download': {
        if (!this.azBlobName.trim()) { this.azError.set('Blob name is required.'); this.azWorking.set(false); return; }
        window.open(`/api/storage/${container}/download/${encodeURIComponent(this.azBlobName.trim())}`, '_blank');
        this.azWorking.set(false);
        this.closeAzDialog();
        break;
      }
      case 'delete': {
        if (!this.azBlobName.trim()) { this.azError.set('Blob name is required.'); this.azWorking.set(false); return; }
        this.engine.delete(`/api/storage/${container}/${encodeURIComponent(this.azBlobName.trim())}`).subscribe({
          next: () => { this.azResult.set('Blob deleted successfully.'); this.azWorking.set(false); },
          error: (e) => { this.azError.set(e.error?.error ?? 'Delete failed.'); this.azWorking.set(false); },
        });
        break;
      }
      case 'sas-upload': {
        if (!this.azBlobName.trim()) { this.azError.set('Blob name is required.'); this.azWorking.set(false); return; }
        this.engine.post<{ sasUrl: string }>(`/api/storage/sas/upload`, {
          container, blobName: this.azBlobName.trim(), expiresInMinutes: this.azExpires,
        }).subscribe({
          next: (r) => { this.azResult.set(r.sasUrl); this.azWorking.set(false); },
          error: (e) => { this.azError.set(e.error?.error ?? 'SAS generation failed.'); this.azWorking.set(false); },
        });
        break;
      }
      case 'sas-download': {
        if (!this.azBlobName.trim()) { this.azError.set('Blob name is required.'); this.azWorking.set(false); return; }
        this.engine.post<{ sasUrl: string }>(`/api/storage/sas/download`, {
          container, blobName: this.azBlobName.trim(), expiresInMinutes: this.azExpires,
        }).subscribe({
          next: (r) => { this.azResult.set(r.sasUrl); this.azWorking.set(false); },
          error: (e) => { this.azError.set(e.error?.error ?? 'SAS generation failed.'); this.azWorking.set(false); },
        });
        break;
      }
      case 'sas-container': {
        this.engine.post<{ sasUrl: string }>(`/api/storage/sas/container`, {
          container, permissions: this.azPermissions || 'rl', expiresInMinutes: this.azExpires,
        }).subscribe({
          next: (r) => { this.azResult.set(r.sasUrl); this.azWorking.set(false); },
          error: (e) => { this.azError.set(e.error?.error ?? 'SAS generation failed.'); this.azWorking.set(false); },
        });
        break;
      }
    }
  }
}
