export type NodeType = 'start' | 'end' | 'task' | 'decision' | 'loop' | 'parallel';

export type ActionType = 'manual' | 'automated' | 'approval' | 'gate';

export interface InputField {
  key: string;
  label: string;
  type: 'text' | 'email' | 'number' | 'textarea';
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}

export interface WorkflowNode {
  id: string;
  label: string;
  type: NodeType;
  col: number;
  row: number;
  actionType: ActionType;
  inputSchema?: InputField[];
}

export interface WorkflowEdge {
  from: string;
  to: string;
  label?: string;
  type?: 'loop' | 'normal';
}

export interface Point {
  x: number;
  y: number;
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NodeColors {
  bg: string;
  border: string;
  glow: string;
}
