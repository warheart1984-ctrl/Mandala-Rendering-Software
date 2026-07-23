import {
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Scene4DDTO } from "@mrs/scene-schema";
import { createRenderer } from "./createRenderer.js";
import type { MeshClickHandler, RendererHandle } from "./types.js";

export interface CanvasHostProps {
  spec: Scene4DDTO;
  className?: string;
  style?: CSSProperties;
  onMeshClick?: MeshClickHandler;
  onBackend?: (backend: string) => void;
}

/**
 * React host: mounts &lt;canvas&gt;, drives rAF, drag rotation, wheel d4, resize.
 * Renders via Canvas2D. WebGPU is probed only for labeling — not claimed as active.
 */
export function CanvasHost({
  spec,
  className,
  style,
  onMeshClick,
  onBackend,
}: CanvasHostProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<RendererHandle | null>(null);
  const specRef = useRef(spec);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const timeRef = useRef(spec.time);

  specRef.current = spec;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    let alive = true;

    void (async () => {
      const handle = await createRenderer(canvas, specRef.current);
      if (!alive) {
        handle.destroy();
        return;
      }
      handleRef.current = handle;
      onBackend?.(handle.getBackend());

      const parent = canvas.parentElement ?? canvas;
      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        handle.resize(width, height, window.devicePixelRatio || 1);
      });
      ro.observe(parent);
      const rect = parent.getBoundingClientRect();
      handle.resize(rect.width || 640, rect.height || 480, window.devicePixelRatio || 1);

      const loop = (now: number) => {
        if (!alive) return;
        timeRef.current = specRef.current.time + now * 0.0004;
        handle.render(timeRef.current);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      return () => {
        ro.disconnect();
      };
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [spec.surface, spec.resolution, onBackend]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.setD4(spec.projection.distance4d);
  }, [spec.projection.distance4d]);

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    dragRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current || !handleRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    handleRef.current.adjustRotation(dx, dy);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onClick(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!onMeshClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onMeshClick(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      null
    );
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const handle = handleRef.current;
    if (!handle) return;
    const state = handle.getState();
    handle.setD4(Math.max(1.2, state.d4 + e.deltaY * 0.002));
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: "block", width: "100%", height: "100%", touchAction: "none", ...style }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onClick}
      onWheel={onWheel}
    />
  );
}
