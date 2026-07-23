/**
 * Interactive Slicing Plane for 4D Hyperplane Control
 * Allows users to interactively control the 4D hyperplane position and orientation
 */

export class SlicingPlane {
  constructor(camera, options = {}) {
    this.camera = camera;
    
    // Hyperplane parameters
    this.normal = options.normal ?? { x: 0, y: 0, z: 0, w: 1 };
    this.distance = options.distance ?? 0;
    
    // Interaction settings
    this.enabled = options.enabled ?? true;
    this.sensitivity = options.sensitivity ?? 0.01;
    this.minDistance = options.minDistance ?? -5;
    this.maxDistance = options.maxDistance ?? 5;
    
    // Visualization
    this.showPlane = options.showPlane ?? true;
    this.planeColor = options.planeColor ?? 'rgba(100, 150, 255, 0.3)';
    this.planeSize = options.planeSize ?? 2;
    
    // Input state
    this.isDragging = false;
    this.dragMode = null; // 'translate' or 'rotate'
    this.lastMouse = { x: 0, y: 0 };
    this.startDistance = 0;
    this.startNormal = { x: 0, y: 0, z: 0, w: 1 };
  }
  
  /**
   * Get current hyperplane parameters
   */
  getHyperplane() {
    return {
      n: { ...this.normal },
      d: this.distance
    };
  }
  
  /**
   * Set hyperplane parameters
   */
  setHyperplane(normal, distance) {
    this.normal = this.normalize(normal);
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, distance));
    
    // Update camera hyperplane
    if (this.camera) {
      this.camera.setHyperplane(this.normal, this.distance);
    }
  }
  
  /**
   * Normalize a 4D vector
   */
  normalize(v) {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z + v.w * v.w);
    if (len === 0) return { x: 0, y: 0, z: 0, w: 1 };
    return {
      x: v.x / len,
      y: v.y / len,
      z: v.z / len,
      w: v.w / len
    };
  }
  
  /**
   * Attach mouse/touch events to an element
   */
  attach(element) {
    this.element = element;
    
    element.addEventListener('mousedown', this.onMouseDown.bind(this));
    element.addEventListener('mousemove', this.onMouseMove.bind(this));
    element.addEventListener('mouseup', this.onMouseUp.bind(this));
    element.addEventListener('mouseleave', this.onMouseUp.bind(this));
    element.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    
    element.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    element.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    element.addEventListener('touchend', this.onTouchEnd.bind(this));
    
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    
    return this;
  }
  
  detach() {
    if (!this.element) return;
    
    this.element.removeEventListener('mousedown', this.onMouseDown);
    this.element.removeEventListener('mousemove', this.onMouseMove);
    this.element.removeEventListener('mouseup', this.onMouseUp);
    this.element.removeEventListener('mouseleave', this.onMouseUp);
    this.element.removeEventListener('wheel', this.onWheel);
    this.element.removeEventListener('touchstart', this.onTouchStart);
    this.element.removeEventListener('touchmove', this.onTouchMove);
    this.element.removeEventListener('touchend', this.onTouchEnd);
    
    this.element = null;
  }
  
  onMouseDown(e) {
    if (!this.enabled) return;
    
    this.isDragging = true;
    this.lastMouse = { x: e.clientX, y: e.clientY };
    this.startDistance = this.distance;
    this.startNormal = { ...this.normal };
    
    // Determine mode based on modifier keys
    if (e.shiftKey || e.button === 2) {
      this.dragMode = 'rotate';
    } else {
      this.dragMode = 'translate';
    }
  }
  
  onMouseMove(e) {
    if (!this.enabled || !this.isDragging) return;
    
    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;
    
    if (this.dragMode === 'translate') {
      // Translate along normal
      const delta = (dx + dy) * this.sensitivity;
      this.distance = this.startDistance + delta;
      this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
    } else if (this.dragMode === 'rotate') {
      // Rotate normal
      const rotationSpeed = 0.01;
      
      // Rotate in XW plane
      const cosXW = Math.cos(dx * rotationSpeed);
      const sinXW = Math.sin(dx * rotationSpeed);
      const newNormal = {
        x: this.startNormal.x * cosXW - this.startNormal.w * sinXW,
        y: this.startNormal.y,
        z: this.startNormal.z,
        w: this.startNormal.x * sinXW + this.startNormal.w * cosXW
      };
      
      // Rotate in YW plane
      const cosYW = Math.cos(dy * rotationSpeed);
      const sinYW = Math.sin(dy * rotationSpeed);
      this.normal = {
        x: newNormal.x,
        y: newNormal.y * cosYW - newNormal.w * sinYW,
        z: newNormal.z,
        w: newNormal.y * sinYW + newNormal.w * cosYW
      };
      
      this.normal = this.normalize(this.normal);
    }
    
    this.lastMouse = { x: e.clientX, y: e.clientY };
    
    // Update camera
    if (this.camera) {
      this.camera.setHyperplane(this.normal, this.distance);
    }
  }
  
  onMouseUp() {
    this.isDragging = false;
    this.dragMode = null;
  }
  
  onWheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? -1 : 1;
    this.distance += delta * this.sensitivity * 5;
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
    
    if (this.camera) {
      this.camera.setHyperplane(this.normal, this.distance);
    }
  }
  
  onTouchStart(e) {
    if (!this.enabled) return;
    e.preventDefault();
    
    if (e.touches.length === 1) {
      this.isDragging = true;
      this.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      this.startDistance = this.distance;
      this.startNormal = { ...this.normal };
      this.dragMode = 'translate';
    } else if (e.touches.length === 2) {
      this.isDragging = true;
      this.dragMode = 'rotate';
      this.startNormal = { ...this.normal };
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.lastMouse = { x: dx, y: dy };
    }
  }
  
  onTouchMove(e) {
    if (!this.enabled || !this.isDragging) return;
    e.preventDefault();
    
    if (e.touches.length === 1 && this.dragMode === 'translate') {
      const dx = e.touches[0].clientX - this.lastMouse.x;
      const dy = e.touches[0].clientY - this.lastMouse.y;
      
      const delta = (dx + dy) * this.sensitivity;
      this.distance = this.startDistance + delta;
      this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
      
      this.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && this.dragMode === 'rotate') {
      const dx = (e.touches[0].clientX - e.touches[1].clientX) - this.lastMouse.x;
      const dy = (e.touches[0].clientY - e.touches[1].clientY) - this.lastMouse.y;
      
      const rotationSpeed = 0.01;
      
      const cosXW = Math.cos(dx * rotationSpeed);
      const sinXW = Math.sin(dx * rotationSpeed);
      const newNormal = {
        x: this.startNormal.x * cosXW - this.startNormal.w * sinXW,
        y: this.startNormal.y,
        z: this.startNormal.z,
        w: this.startNormal.x * sinXW + this.startNormal.w * cosXW
      };
      
      const cosYW = Math.cos(dy * rotationSpeed);
      const sinYW = Math.sin(dy * rotationSpeed);
      this.normal = {
        x: newNormal.x,
        y: newNormal.y * cosYW - newNormal.w * sinYW,
        z: newNormal.z,
        w: newNormal.y * sinYW + newNormal.w * cosYW
      };
      
      this.normal = this.normalize(this.normal);
      
      this.lastMouse = {
        x: e.touches[0].clientX - e.touches[1].clientX,
        y: e.touches[0].clientY - e.touches[1].clientY
      };
    }
    
    if (this.camera) {
      this.camera.setHyperplane(this.normal, this.distance);
    }
  }
  
  onTouchEnd() {
    this.isDragging = false;
    this.dragMode = null;
  }
  
  /**
   * Animate hyperplane to target parameters
   */
  animateTo(targetNormal, targetDistance, duration = 1.0) {
    const startNormal = { ...this.normal };
    const startDistance = this.distance;
    const startTime = performance.now();
    
    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const t = Math.min(elapsed / duration, 1.0);
      const eased = this.easeInOutCubic(t);
      
      // Interpolate normal (slerp-like)
      this.normal = this.slerp(startNormal, targetNormal, eased);
      
      // Interpolate distance
      this.distance = startDistance + (targetDistance - startDistance) * eased;
      
      if (this.camera) {
        this.camera.setHyperplane(this.normal, this.distance);
      }
      
      if (t < 1.0) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  }
  
  /**
   * Spherical linear interpolation for 4D vectors
   */
  slerp(a, b, t) {
    const dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    
    if (dot > 0.9995) {
      // Linear interpolation for very close vectors
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        w: a.w + (b.w - a.w) * t
      };
    }
    
    const theta = Math.acos(Math.max(-1, Math.min(1, dot)));
    const sinTheta = Math.sin(theta);
    
    if (sinTheta < 0.001) {
      return { ...a };
    }
    
    const w1 = Math.sin((1 - t) * theta) / sinTheta;
    const w2 = Math.sin(t * theta) / sinTheta;
    
    return {
      x: a.x * w1 + b.x * w2,
      y: a.y * w1 + b.y * w2,
      z: a.z * w1 + b.z * w2,
      w: a.w * w1 + b.w * w2
    };
  }
  
  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  
  /**
   * Reset to default hyperplane
   */
  reset() {
    this.normal = { x: 0, y: 0, z: 0, w: 1 };
    this.distance = 0;
    
    if (this.camera) {
      this.camera.setHyperplane(this.normal, this.distance);
    }
  }
  
  /**
   * Enable/disable interaction
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
  
  /**
   * Get visualization data for rendering the plane
   */
  getVisualizationData() {
    if (!this.showPlane) return null;
    
    // Generate a 3D slice of the 4D hyperplane for visualization
    // This is a simplified representation
    const size = this.planeSize;
    const steps = 10;
    
    const vertices = [];
    const edges = [];
    
    // Generate grid in the plane perpendicular to normal
    // This is a simplified 2D representation
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps; j++) {
        const u = (i / steps - 0.5) * 2 * size;
        const v = (j / steps - 0.5) * 2 * size;
        
        // Project to 3D based on normal
        const vertex = this.projectTo3D(u, v);
        vertices.push(vertex);
      }
    }
    
    // Generate edges
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps; j++) {
        const idx = i * (steps + 1) + j;
        
        if (i < steps) {
          edges.push([idx, idx + steps + 1]);
        }
        if (j < steps) {
          edges.push([idx, idx + 1]);
        }
      }
    }
    
    return {
      vertices,
      edges,
      color: this.planeColor
    };
  }
  
  projectTo3D(u, v) {
    // Simplified projection - assumes normal is mostly in W direction
    // A full implementation would use the actual 4D hyperplane equation
    return {
      x: u,
      y: v,
      z: this.distance,
      w: 0
    };
  }
}

/**
 * Preset hyperplane configurations
 */
export const hyperplanePresets = {
  wSlice: { normal: { x: 0, y: 0, z: 0, w: 1 }, distance: 0 },
  xSlice: { normal: { x: 1, y: 0, z: 0, w: 0 }, distance: 0 },
  ySlice: { normal: { x: 0, y: 1, z: 0, w: 0 }, distance: 0 },
  zSlice: { normal: { x: 0, y: 0, z: 1, w: 0 }, distance: 0 },
  diagonal: { normal: { x: 0.5, y: 0.5, z: 0.5, w: 0.5 }, distance: 0 },
  offAxis: { normal: { x: 0.3, y: 0.3, z: 0.3, w: 0.9 }, distance: 1 }
};

export function createSlicingPlane(camera, options = {}) {
  return new SlicingPlane(camera, options);
}
