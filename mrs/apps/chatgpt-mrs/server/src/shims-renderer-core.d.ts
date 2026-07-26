declare module "@mrs/renderer-core/scene-spec" {
  export function parseSceneSpecification(value: unknown): {
    ok: boolean;
    value?: { id?: string; [key: string]: unknown };
    errors: Array<{ path?: string; message: string }>;
  };
  export function validateSceneCapabilities(
    value: unknown,
    options?: { target?: string }
  ): {
    ok: boolean;
    errors: Array<{ path?: string; message: string }>;
  };
  export const RT4D_SURFACE_IDS: readonly string[];
  export const SUPPORTED_OBSERVATION_MODES: readonly string[];
  export const MAX_WIDTH: number;
  export const MAX_HEIGHT: number;
  export const MAX_SAMPLES: number;
  export const MAX_DEPTH: number;
  export const MAX_ANIMATION_FRAMES: number;
  export function normalizeSurfaceId(id: string | null | undefined): string | null;
}

declare module "@mrs/renderer-core/surfaces";
declare module "@mrs/renderer-core/inspector";
declare module "@mrs/renderer-core/pipeline/ExportManager";
