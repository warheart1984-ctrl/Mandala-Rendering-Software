declare module "@mrs/director" {
  export class DirectorAgent {
    execute(request: Record<string, unknown>): Promise<{ success: boolean; result?: unknown; provenance?: Record<string, unknown> }>;
    invokeMCP(toolName: string, params: Record<string, unknown>): Promise<{ success: boolean; tool?: string; result?: unknown; provenance?: Record<string, unknown> }>;
  }
}