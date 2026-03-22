export interface HandlerContext {
  projectId:         number;
  activityKey:       string;
  projectActivityId: number;
  versionId:         number;
  inputData:         Record<string, unknown> | null;
}

export interface HandlerResult {
  outcome?: string;
  payload?: Record<string, unknown>;
}

export type ActivityHandler = (ctx: HandlerContext) => Promise<HandlerResult>;

class ActivityHandlerRegistry {
  private handlers = new Map<string, ActivityHandler>();

  register(name: string, handler: ActivityHandler): void {
    this.handlers.set(name, handler);
    console.log(`[handlers] registered '${name}'`);
  }

  get(name: string): ActivityHandler | undefined {
    return this.handlers.get(name);
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }
}

export const registry = new ActivityHandlerRegistry();
