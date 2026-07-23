export class RigidBody4D {
  constructor(options = {}) {
    this.mass = options.mass ?? 1;
    this.position = options.position ?? { x: 0, y: 0, z: 0, w: 0 };
    this.velocity = options.velocity ?? { x: 0, y: 0, z: 0, w: 0 };
    this.acceleration = { x: 0, y: 0, z: 0, w: 0 };
    this.forceAccum = { x: 0, y: 0, z: 0, w: 0 };
    this.restitution = options.restitution ?? 0.5;
    this.friction = options.friction ?? 0.3;
    this.isStatic = options.isStatic ?? false;
    this.lockedAxes = options.lockedAxes ?? {};
    this.collider = null;
    this.userData = {};
  }

  applyForce(fx, fy, fz, fw) {
    this.forceAccum.x += fx;
    this.forceAccum.y += fy;
    this.forceAccum.z += fz;
    this.forceAccum.w += fw;
  }

  applyImpulse(fx, fy, fz, fw) {
    if (this.isStatic) return;
    const inv = 1 / this.mass;
    this.velocity.x += fx * inv;
    this.velocity.y += fy * inv;
    this.velocity.z += fz * inv;
    this.velocity.w += fw * inv;
  }

  integrate(dt) {
    if (this.isStatic) return;
    const inv = 1 / this.mass;
    this.acceleration.x = this.forceAccum.x * inv;
    this.acceleration.y = this.forceAccum.y * inv;
    this.acceleration.z = this.forceAccum.z * inv;
    this.acceleration.w = this.forceAccum.w * inv;
    this.forceAccum = { x: 0, y: 0, z: 0, w: 0 };

    if (!this.lockedAxes.x) { this.velocity.x += this.acceleration.x * dt; this.position.x += this.velocity.x * dt; }
    if (!this.lockedAxes.y) { this.velocity.y += this.acceleration.y * dt; this.position.y += this.velocity.y * dt; }
    if (!this.lockedAxes.z) { this.velocity.z += this.acceleration.z * dt; this.position.z += this.velocity.z * dt; }
    if (!this.lockedAxes.w) { this.velocity.w += this.acceleration.w * dt; this.position.w += this.velocity.w * dt; }
  }

  setPosition(x, y, z, w) {
    this.position = { x, y, z, w };
  }

  setVelocity(x, y, z, w) {
    this.velocity = { x, y, z, w };
  }
}
