import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildTesseractGeometry, type PlaneAngles } from "./tesseract";

export type RT4DViewerProps = {
  angles: PlaneAngles;
  distance4d: number;
  playing: boolean;
  previewUrl?: string | null;
  showOverlayPreview: boolean;
};

/**
 * WebGL projected tesseract — dimensional preview, not AnimeStylizer.
 * Optional engine PNG overlay when previewUrl is set.
 */
export function RT4DViewer({
  angles,
  distance4d,
  playing,
  previewUrl,
  showOverlayPreview,
}: RT4DViewerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({
    angles,
    distance4d,
    playing,
    yaw: 0.35,
    pitch: 0.25,
    zoom: 4.5,
  });

  stateRef.current.distance4d = distance4d;
  stateRef.current.playing = playing;
  // While playing, the rAF loop owns angles; sync from props only when paused.
  if (!playing) {
    stateRef.current.angles = angles;
  }

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1418);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(0, 0, stateRef.current.zoom);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const material = new THREE.LineBasicMaterial({
      color: 0x3d9e8f,
      transparent: true,
      opacity: 0.95,
    });
    let lines = new THREE.LineSegments(
      buildTesseractGeometry(angles, distance4d),
      material
    );
    scene.add(lines);

    const grid = new THREE.GridHelper(6, 12, 0x1f3a42, 0x16262c);
    grid.position.y = -1.6;
    scene.add(grid);

    let drag = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (ev: PointerEvent) => {
      drag = true;
      lastX = ev.clientX;
      lastY = ev.clientY;
      mount.setPointerCapture(ev.pointerId);
    };
    const onPointerUp = (ev: PointerEvent) => {
      drag = false;
      mount.releasePointerCapture(ev.pointerId);
    };
    const onPointerMove = (ev: PointerEvent) => {
      if (!drag) return;
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      stateRef.current.yaw += dx * 0.008;
      stateRef.current.pitch = Math.max(
        -1.2,
        Math.min(1.2, stateRef.current.pitch + dy * 0.008)
      );
    };
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      stateRef.current.zoom = Math.max(
        2,
        Math.min(12, stateRef.current.zoom + ev.deltaY * 0.01)
      );
    };

    mount.addEventListener("pointerdown", onPointerDown);
    mount.addEventListener("pointerup", onPointerUp);
    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("wheel", onWheel, { passive: false });

    const resize = () => {
      const w = mount.clientWidth || 320;
      const h = mount.clientHeight || 240;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      if (st.playing) {
        st.angles = {
          xw: st.angles.xw + dt * 0.55,
          yw: st.angles.yw + dt * 0.38,
          zw: st.angles.zw + dt * 0.22,
        };
      }
      scene.remove(lines);
      lines.geometry.dispose();
      lines = new THREE.LineSegments(
        buildTesseractGeometry(st.angles, st.distance4d),
        material
      );
      scene.add(lines);

      const r = st.zoom;
      camera.position.set(
        r * Math.sin(st.yaw) * Math.cos(st.pitch),
        r * Math.sin(st.pitch),
        r * Math.cos(st.yaw) * Math.cos(st.pitch)
      );
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mount.removeEventListener("pointerdown", onPointerDown);
      mount.removeEventListener("pointerup", onPointerUp);
      mount.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("wheel", onWheel);
      lines.geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
    // Mount once; live angles/play via stateRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="viewer-stage">
      <div className="viewer-canvas" ref={mountRef} />
      <div className="viewer-label">
        Dimensional preview (projected tesseract) — not AnimeStylizer / photoreal
      </div>
      {showOverlayPreview && previewUrl ? (
        <div className="preview-overlay">
          <img src={previewUrl} alt="RT4D engine or placeholder preview" />
        </div>
      ) : null}
    </div>
  );
}
