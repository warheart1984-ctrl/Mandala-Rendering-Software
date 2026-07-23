/**
 * Interactive Camera Controls for 4D Renderer
 * Supports orbit, pan, zoom with mouse and touch input
 */

export class CameraControls {
  constructor(camera, options = {}) {
    this.camera = camera;
    this.enabled = true;
    
    // Control settings
    this.rotateSpeed = options.rotateSpeed ?? 0.005;
    this.panSpeed = options.panSpeed ?? 0.5;
    this.zoomSpeed = options.zoomSpeed ?? 0.1;
    this.damping = options.damping ?? 0.1;
    this.minDistance = options.minDistance ?? 2.0;
    this.maxDistance = options.maxDistance ?? 20.0;
    
    // State
    this.targetRotation = { x: 0, y: 0, z: 0, w: 0 };
    this.targetDistance = camera.d4 ?? 4.0;
    this.targetPan = { x: 0, y: 0 };
    this.currentRotation = { ...this.targetRotation };
    this.currentDistance = this.targetDistance;
    this.currentPan = { ...this.targetPan };
    
    // Input state
    this.isDragging = false;
    this.isPanning = false;
    this.lastMouse = { x: 0, y: 0 };
    this.pinchStartDistance = 0;
    
    // Bind methods
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
  }
  
  attach(element) {
    this.element = element;
    
    // Mouse events
    element.addEventListener('mousedown', this.onMouseDown);
    element.addEventListener('mousemove', this.onMouseMove);
    element.addEventListener('mouseup', this.onMouseUp);
    element.addEventListener('mouseleave', this.onMouseUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    
    // Touch events
    element.addEventListener('touchstart', this.onTouchStart, { passive: false });
    element.addEventListener('touchmove', this.onTouchMove, { passive: false });
    element.addEventListener('touchend', this.onTouchEnd);
    element.addEventListener('touchcancel', this.onTouchEnd);
    
    // Prevent context menu
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
    this.element.removeEventListener('touchcancel', this.onTouchEnd);
    
    this.element = null;
  }
  
  onMouseDown(e) {
    if (!this.enabled) return;
    
    this.isDragging = true;
    this.lastMouse = { x: e.clientX, y: e.clientY };
    
    // Middle mouse or shift+click for panning
    this.isPanning = e.button === 1 || e.shiftKey;
  }
  
  onMouseMove(e) {
    if (!this.enabled || !this.isDragging) return;
    
    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;
    
    if (this.isPanning) {
      // Pan
      this.targetPan.x += dx * this.panSpeed;
      this.targetPan.y += dy * this.panSpeed;
    } else {
      // Orbit rotation
      this.targetRotation.y += dx * this.rotateSpeed; // Yaw
      this.targetRotation.x += dy * this.rotateSpeed; // Pitch
    }
    
    this.lastMouse = { x: e.clientX, y: e.clientY };
  }
  
  onMouseUp() {
    this.isDragging = false;
    this.isPanning = false;
  }
  
  onWheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? 1 : -1;
    this.targetDistance += delta * this.zoomSpeed * this.targetDistance;
    this.targetDistance = Math.max(this.minDistance, Math.min(this.maxDistance, this.targetDistance));
  }
  
  onTouchStart(e) {
    if (!this.enabled) return;
    e.preventDefault();
    
    if (e.touches.length === 1) {
      // Single touch - orbit
      this.isDragging = true;
      this.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      // Two touch - pinch zoom
      this.isPanning = true;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.pinchStartDistance = Math.sqrt(dx * dx + dy * dy);
    }
  }
  
  onTouchMove(e) {
    if (!this.enabled) return;
    e.preventDefault();
    
    if (e.touches.length === 1 && this.isDragging) {
      // Orbit
      const dx = e.touches[0].clientX - this.lastMouse.x;
      const dy = e.touches[0].clientY - this.lastMouse.y;
      
      this.targetRotation.y += dx * this.rotateSpeed;
      this.targetRotation.x += dy * this.rotateSpeed;
      
      this.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      const delta = (this.pinchStartDistance - distance) * 0.01;
      this.targetDistance += delta * this.targetDistance;
      this.targetDistance = Math.max(this.minDistance, Math.min(this.maxDistance, this.targetDistance));
      
      this.pinchStartDistance = distance;
    }
  }
  
  onTouchEnd() {
    this.isDragging = false;
    this.isPanning = false;
  }
  
  update(deltaTime = 1/60) {
    if (!this.enabled) return;
    
    // Apply damping
    const dampingFactor = 1 - Math.pow(this.damping, deltaTime * 60);
    
    this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * dampingFactor;
    this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * dampingFactor;
    this.currentRotation.z += (this.targetRotation.z - this.currentRotation.z) * dampingFactor;
    this.currentRotation.w += (this.targetRotation.w - this.currentRotation.w) * dampingFactor;
    
    this.currentDistance += (this.targetDistance - this.currentDistance) * dampingFactor;
    this.currentPan.x += (this.targetPan.x - this.currentPan.x) * dampingFactor;
    this.currentPan.y += (this.targetPan.y - this.currentPan.y) * dampingFactor;
    
    // Apply to camera
    this.camera.d4 = this.currentDistance;
    this.camera.d3 = this.currentDistance;
    
    // Apply rotation via orbit
    this.camera.orbit(this.currentRotation.y, 1.0); // Yaw
    this.camera.orbit(this.currentRotation.x, 0.5); // Pitch
    
    // Apply pan as position offset
    this.camera.position.x = this.currentPan.x * 0.01;
    this.camera.position.y = this.currentPan.y * 0.01;
  }
  
  reset() {
    this.targetRotation = { x: 0, y: 0, z: 0, w: 0 };
    this.targetDistance = this.camera.d4 ?? 4.0;
    this.targetPan = { x: 0, y: 0 };
  }
  
  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

export function createCameraControls(camera, options = {}) {
  return new CameraControls(camera, options);
}
