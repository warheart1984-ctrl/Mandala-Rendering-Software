/**
 * GLB preview — three.js viewer for RT4D fixture GLBs.
 * Status: partial. Loads convex/energy hull GLB, not a production sculpt.
 */

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export interface GLBPreviewProps {
  glbBytes?: Uint8Array | null;
  glbUrl?: string | null;
  animationClip?: THREE.AnimationClip | null;
  autoRotate?: boolean;
  backgroundColor?: number;
  onModelLoaded?: (root: THREE.Object3D) => void;
}

export function GLBPreviewViewer({
  glbBytes,
  glbUrl,
  animationClip,
  autoRotate = true,
  backgroundColor = 0x0e1418,
  onModelLoaded,
}: GLBPreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onModelLoadedRef = useRef(onModelLoaded);
  onModelLoadedRef.current = onModelLoaded;
  const animationClipRef = useRef(animationClip);
  animationClipRef.current = animationClip;
  const stateRef = useRef<{
    scene: THREE.Scene | null;
    mixer: THREE.AnimationMixer | null;
    action: THREE.AnimationAction | null;
    renderer: THREE.WebGLRenderer | null;
    camera: THREE.PerspectiveCamera | null;
    controls: OrbitControls | null;
    clock: THREE.Clock;
    rafId: number;
    model: THREE.Object3D | null;
  }>({
    scene: null,
    mixer: null,
    action: null,
    renderer: null,
    camera: null,
    controls: null,
    clock: new THREE.Clock(),
    rafId: 0,
    model: null,
  });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = Math.max(mount.clientWidth, 16);
    const height = Math.max(mount.clientHeight, 16);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgroundColor);

    scene.add(new THREE.AmbientLight(0x404040, 0.6));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
    fillLight.position.set(-3, 2, -2);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffffcc, 0.3);
    rimLight.position.set(0, 3, -5);
    scene.add(rimLight);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    camera.position.set(0, 1.5, 4);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.5, 0);
    controls.enableDamping = true;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.5;
    controls.update();

    stateRef.current = {
      scene,
      mixer: null,
      action: null,
      renderer,
      camera,
      controls,
      clock: new THREE.Clock(),
      rafId: 0,
      model: null,
    };

    const animate = () => {
      stateRef.current.rafId = requestAnimationFrame(animate);
      const delta = stateRef.current.clock.getDelta();
      stateRef.current.mixer?.update(delta);
      stateRef.current.controls?.update();
      if (stateRef.current.renderer && stateRef.current.scene && stateRef.current.camera) {
        stateRef.current.renderer.render(stateRef.current.scene, stateRef.current.camera);
      }
    };
    animate();

    const onResize = () => {
      if (!mount || !stateRef.current.camera || !stateRef.current.renderer) return;
      const w = Math.max(mount.clientWidth, 16);
      const h = Math.max(mount.clientHeight, 16);
      stateRef.current.camera.aspect = w / h;
      stateRef.current.camera.updateProjectionMatrix();
      stateRef.current.renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(stateRef.current.rafId);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      stateRef.current.scene = null;
    };
  }, [backgroundColor, autoRotate]);

  const playClip = useCallback((clip: THREE.AnimationClip | null) => {
    const mixer = stateRef.current.mixer;
    if (!mixer) return;
    stateRef.current.action?.stop();
    stateRef.current.action = null;
    if (!clip) return;
    const action = mixer.clipAction(clip);
    action.play();
    stateRef.current.action = action;
  }, []);

  const loadGLB = useCallback(
    (bytes?: Uint8Array | null, url?: string | null) => {
      const scene = stateRef.current.scene;
      if (!scene) return;
      const loader = new GLTFLoader();

      const existing = scene.getObjectByName("rt4d-model");
      if (existing) {
        existing.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            const mat = child.material;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else mat?.dispose();
          }
        });
        scene.remove(existing);
      }
      stateRef.current.mixer?.stopAllAction();
      stateRef.current.mixer = null;
      stateRef.current.model = null;

      const onLoad = (gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }) => {
        const model = gltf.scene;
        model.name = "rt4d-model";
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
        const scale = 2.0 / maxDim;
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
        model.position.y -= box.min.y * scale;
        scene.add(model);

        const mixer = new THREE.AnimationMixer(model);
        stateRef.current.mixer = mixer;
        stateRef.current.model = model;

        if (gltf.animations.length > 0) {
          playClip(gltf.animations[0]);
        } else if (animationClipRef.current) {
          playClip(animationClipRef.current);
        }

        onModelLoadedRef.current?.(model);
      };

      if (bytes && bytes.length > 0) {
        const copy = bytes.slice().buffer as ArrayBuffer;
        loader.parse(copy, "", onLoad, (err) => {
          console.error("GLB parse failed", err);
        });
      } else if (url) {
        loader.load(url, onLoad);
      }
    },
    [playClip]
  );

  useEffect(() => {
    playClip(animationClip ?? null);
  }, [animationClip, playClip]);

  useEffect(() => {
    const timer = setTimeout(() => loadGLB(glbBytes, glbUrl), 80);
    return () => clearTimeout(timer);
  }, [glbBytes, glbUrl, loadGLB]);

  return (
    <div
      ref={mountRef}
      className="viewer-stage"
      style={{
        width: "100%",
        height: "100%",
        minHeight: 400,
        borderRadius: 8,
        overflow: "hidden",
      }}
    />
  );
}

export function downloadGLB(bytes: Uint8Array, filename = "rt4d-fixture.glb") {
  const blob = new Blob([bytes.slice()], { type: "model/gltf-binary" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
