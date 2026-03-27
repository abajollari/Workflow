# Styling

## Theme

The app uses a **dark theme** with cyan/green/violet accent colors. All design tokens are CSS custom properties defined in `src/styles.css`.

---

## CSS Custom Properties

### Colors

```css
--accent-cyan:    #22d3ee    /* Primary interactive elements, active states */
--accent-green:   #4ade80    /* Success, completed states */
--accent-violet:  #a78bfa    /* Secondary highlights */
--accent-amber:   #fbbf24    /* Warnings, in-progress states */
```

### Text

```css
--text-primary:    #f1f5f9   /* Main body text */
--text-secondary:  #94a3b8   /* Supporting text */
--text-muted:      #64748b   /* Placeholder, disabled text */
--text-dim:        #475569   /* Very subdued text */
```

### Backgrounds

```css
--bg-dark:         #0f172a   /* Page background */
--bg-card:         #1e293b   /* Card / panel background */
--bg-elevated:     #334155   /* Hover states, elevated elements */
```

### Borders

```css
--border-subtle:   rgba(148, 163, 184, 0.1)   /* Hairline separators */
--border-medium:   rgba(148, 163, 184, 0.2)   /* Card borders */
```

### Typography

```css
--font-sans:  system-ui, -apple-system, sans-serif
--font-mono:  'Fira Code', 'Cascadia Code', monospace
```

### Animation

```css
--ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1)
```

### Layout

```css
--header-height:  56px
--footer-height:  48px
```

---

## Layout Structure

```
html, body
└── app-root
    ├── app-header          (height: var(--header-height), position: fixed)
    ├── <router-outlet>     (padding-top: var(--header-height), padding-bottom: var(--footer-height))
    └── app-footer          (height: var(--footer-height), position: fixed, bottom)
```

The header and footer are fixed. The main content area accounts for both with padding.

---

## Background

`AppComponent` renders an ambient background effect using CSS radial gradients — two large colored glows positioned at top-left and bottom-right of the viewport, on top of `--bg-dark`. This creates the characteristic "deep space" appearance.

---

## Component Styling

All components use Angular's **component-scoped styles** (`:host` scope, `encapsulation: ViewEncapsulation.Emulated`). No global CSS class collisions.

Common patterns used across components:

### Cards

```css
background: var(--bg-card);
border: 1px solid var(--border-medium);
border-radius: 12px;
padding: 16px 20px;
```

### Buttons

Primary:
```css
background: var(--accent-cyan);
color: #0f172a;
border-radius: 8px;
padding: 8px 16px;
font-weight: 600;
```

Danger:
```css
background: transparent;
border: 1px solid #ef4444;
color: #ef4444;
```

### Status Badges

```css
/* Active */
background: rgba(34, 211, 238, 0.15);
color: var(--accent-cyan);
border: 1px solid rgba(34, 211, 238, 0.3);

/* Completed */
background: rgba(74, 222, 128, 0.15);
color: var(--accent-green);
border: 1px solid rgba(74, 222, 128, 0.3);

/* Pending */
background: rgba(100, 116, 139, 0.15);
color: var(--text-muted);
border: 1px solid var(--border-subtle);
```

---

## Workflow Graph Node Colors

Defined in `WorkflowGraphComponent` as a function of node type and status:

| Node Type | Active Color | Completed Color | Pending Color |
|-----------|-------------|-----------------|---------------|
| start/end | cyan | green (dim) | slate |
| task | cyan | green (dim) | slate |
| decision | violet | violet (dim) | slate |
| loop | amber | amber (dim) | slate |
| parallel | green | green (dim) | slate |

Active nodes have a colored glow (CSS `filter: drop-shadow`).
