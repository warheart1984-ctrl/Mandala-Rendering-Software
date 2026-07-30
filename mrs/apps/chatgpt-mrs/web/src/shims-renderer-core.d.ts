declare module "@mrs/renderer-core/render/canvas" {
  export class CanvasRenderer {
    constructor(
      canvas: HTMLCanvasElement,
      options: {
        profile: string;
        d4: number;
        d3: number;
        rotationWeights: Record<string, number>;
        background: string;
        renderMode: string;
      }
    );

    d4: number;
    d3: number;
    rotationWeights: Record<string, number>;

    clear(): void;
    renderFrame(
      mesh: unknown,
      time: number,
      options?: { stroke?: string }
    ): void;
    setViewSize(width: number, height: number): void;
  }
}

declare module "@mrs/renderer-core/surfaces" {
  export function getSurface(id: string): unknown;
  export function sampleSurface(surface: unknown, resolution: number): unknown;
}
