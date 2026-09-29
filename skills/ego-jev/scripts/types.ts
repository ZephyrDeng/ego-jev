// Shared types for jev-loop.ts / record.ts. Type-only: erased at load time.

export interface SnapshotOptions {
  scope?: "viewport" | "full_page" | "subtree";
  root?: string;
}

export interface CdpEvent {
  method: string;
  // CDP payloads are protocol-defined and read defensively by the recorder.
  params: any;
}

// The subset of the ego-browser Page API the loop and recorder use.
export interface Page {
  snapshot(options?: SnapshotOptions): Promise<string>;
  evaluate<R = unknown, A = undefined>(fn: (arg: A) => R | Promise<R>, arg?: A): Promise<R>;
  url(): Promise<string>;
  click(selector: string, options?: { label?: string }): Promise<unknown>;
  fill(selector: string, value: string): Promise<unknown>;
  hover(selector: string, options?: { label?: string }): Promise<unknown>;
  selectOption(selector: string, value: string): Promise<unknown>;
  waitForTimeout(ms: number): Promise<unknown>;
  mouse: { click(x: number, y: number, options?: { label?: string }): Promise<unknown> };
  keyboard: { insertText(text: string): Promise<unknown> };
  cdp(method: string, params?: object): Promise<any>;
  events(): Promise<CdpEvent[]>;
}

export type RecordPage = Pick<Page, "url" | "cdp" | "events">;
