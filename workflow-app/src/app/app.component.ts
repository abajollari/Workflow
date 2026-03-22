import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent],
  template: `
    <div class="app-shell">
      <app-header />
      <main class="app-main">
        <router-outlet />
      </main>
      <app-footer />
    </div>
  `,
  styles: [`
    .app-shell {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      position: relative;
    }

    .app-main {
      flex: 1;
      padding-top: var(--header-height);
      padding-bottom: var(--footer-height);
      position: relative;
      z-index: 1;
    }

    /* Ambient background glow */
    .app-shell::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background:
        radial-gradient(ellipse at 15% 20%, rgba(56, 189, 248, 0.03) 0%, transparent 55%),
        radial-gradient(ellipse at 85% 80%, rgba(139, 92, 246, 0.03) 0%, transparent 55%),
        radial-gradient(ellipse at 50% 50%, rgba(16, 185, 129, 0.02) 0%, transparent 60%);
      pointer-events: none;
      z-index: 0;
    }
  `],
})
export class AppComponent {
  title = 'Workflow Engine';
}
