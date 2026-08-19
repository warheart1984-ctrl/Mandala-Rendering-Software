/**
 * GLB Preview Viewer — three.js-based viewer for RT4D → Rig GLB exports.
 * Loads GLB bytes, displays with armature, supports pose animation.
 */

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export interface GLBPreviewProps {
  /** GLB bytes from export_rt4d_asset or sovereign-sculptor */
  glbBytes?: Uint8Array | null;
  /** URL to fetch GLB from */
  glbUrl?: string | null;
  /** Optional animation clip to play (from pose animation) */
  animationClip?: THREE.AnimationClip | null;
  /** Auto-rotate the model */
  autoRotate?: boolean;
  /** Background color */
  backgroundColor?: number;
}

export function GLBPreviewViewer({
  glbBytes,
  glbUrl,
  animationClip,
  autoRotate = true,
  backgroundColor = 0x0e1418,
}: GLBPreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<{
    scene: THREE.Scene | null;
    mixer: THREE.AnimationMixer | null;
    action: THREE.AnimationAction | null;
    renderer: THREE.WebGLRenderer | null;
    camera: THREE.PerspectiveCamera | null;
    controls: OrbitControls | null;
    clock: THREE.Clock;
    rafId: number;
  }>({
    scene: null,
    mixer: null,
    action: null,
    renderer: null,
    camera: null,
    controls: null,
    clock: new THREE.Clock(),
    rafId: 0,
  });

  // Initialize three.js scene
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgroundColor);

    // Lighting — three-point setup for character display
    const ambient = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(3, 5, 4);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
    fillLight.position.set(-3, 2, -2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffcc, 0.3);
    rimLight.position.set(0, 3, -5);
    scene.add(rimLight);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(10, 10);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.5;
    ground.receiveShadow = true;
    scene.add(ground);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    camera.position.set(0, 1.5, 4);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.5, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.5;
    controls.update();

    const mixer = new THREE.AnimationMixer(scene);

    stateRef.current = {
      scene,
      mixer,
      action: null,
      renderer,
      camera,
      controls,
      clock: new THREE.Clock(),
      rafId: 0,
    };

    // Animation loop
    const animate = () => {
      stateRef.current.rafId = requestAnimationFrame(animate);
      const delta = stateRef.current.clock.getDelta();
      stateRef.current.mixer?.update(delta);
      stateRef.current.controls?.update();
      stateRef.current.renderer?.render(
        stateRef.current.scene!,
        stateRef.current.camera!
      );
    };
    animate();

    // Resize handler
    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(stateRef.current.rafId);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      stateRef.current.scene = null;
    };
  }, [backgroundColor, autoRotate]);

  // Load GLB when bytes or URL change
  const loadGLB = useCallback(
    (bytes?: Uint8Array | null, url?: string | null) => {
      const scene = stateRef.current.scene;
      if (!scene) return;

      const loader = new GLTFLoader();

      // Remove previous model
      const existing = scene.getObjectByName("rt4d-model");
      if (existing) {
        existing.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            child.material?.dispose();
          }
        });
        scene.remove(existing);
      }

      const onLoad = (gltf: any) => {
        const model = gltf.scene;
        model.name = "rt4d-model";

        // Enable shadows on all meshes
        model.traverse((child: any) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            // Ensure PBR material looks good
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.envMapIntensity = 0.5;
            }
          }
        });

        // Center and scale model
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2.0 / maxDim;
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
        model.position.y -= (box.min.y * scale);

        scene.add(model);

        // Add armature skeleton helper if present
        model.traverse((child: any) => {
          if (child instanceof THREE.SkeletonHelper) {
            child.visible = true;
          }
        });

        // Apply animation if provided
        if (stateRef.current.mixer && gltf.animations.length > 0) {
          const clip = gltf.animations[0];
          const action = stateRef.current.mixer.clipAction(clip);
          action.play();
          stateRef.current.action = action;
        }
      };

      if (bytes && bytes.length > 0) {
        const blob = new Blob([bytes], { type: "model/gltf-binary" });
        const objectUrl = URL.createObjectURL(blob);
        loader.load(objectUrl, (gltf) => {
          URL.revokeObjectURL(objectUrl);
          onLoad(gltf);
        });
      } else if (url) {
        loader.load(url, onLoad);
      }
    },
    []
  );

  // Apply animation clip
  useEffect(() => {
    if (!animationClip || !stateRef.current.mixer) return;

    // Stop previous action
    stateRef.current.action?.stop();

    const action = stateRef.current.mixer.clipAction(animationClip);
    action.play();
    stateRef.current.action = action;
  }, [animationClip]);

  // Load GLB when props change
  useEffect(() => {
    // Small delay to ensure scene is initialized
    const timer = setTimeout(() => loadGLB(glbBytes, glbUrl), 100);
    return () => clearTimeout(timer);
  }, [glbBytes, glbUrl, loadGLB]);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 400,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid #2a2a3e",
      }}
    />
  );
}

/**
 * Export GLB bytes to a downloadable .glb file.
 */
export function downloadGLB(bytes: Uint8Array, filename = "rt4d-character.glb") {
  const blob = new Blob([bytes], { type: "model/gltf-binary" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
