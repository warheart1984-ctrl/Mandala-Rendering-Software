import { createCanvas } from "canvas";
import { mulberry32 } from "../render/rt4d/environment/SkyField.js";

/**
 * Salt Map Anime Renderer
 * Japanese anime style: white salt crystals on dark paper, ink wash, cel shading, screen tones
 */
export class SaltMapRenderer {
  constructor(width = 1280, height = 720, seed = 0x5EED4D00) {
    this.W = width;
    this.H = height;
    this.canvas = createCanvas(width, height);
    this.ctx = this.canvas.getContext("2d");
    this.rand = mulberry32(seed);
    this.frame = 0;
    
    // Paper & ink params
    this.paperColor = "#0d0d0d";      // near-black paper
    this.saltColor = "#f0f0e8";       // warm white salt
    this.inkColor = "#1a1a1a";        // dark ink lines
    this.accentColor = "#c8b8a0";     // aged paper tint
    
    // Animation state
    this.strokes = [];
    this.crystals = [];
    this.inkWashes = [];
    this.screenTones = [];
    this.paperTexture = null;
    
    this.initPaper();
    this.generateMapStrokes();
  }
  
  initPaper() {
    // Generate paper texture once
    const imgData = this.ctx.createImageData(this.W, this.H);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (this.rand() - 0.5) * 0.1;
      const base = 13;
      data[i] = base + noise * 255;     // R
      data[i+1] = base + noise * 255;   // G
      data[i+2] = base + noise * 255;   // B
      data[i+3] = 255;
    }
    this.paperTexture = imgData;
  }
  
  generateMapStrokes() {
    // Generate the map as a series of strokes (coastlines, mountains, rivers, cities)
    // These will be drawn progressively over the 450 frames
    
    const strokeCount = 120;
    const centerX = this.W / 2;
    const centerY = this.H / 2;
    const mapRadius = Math.min(this.W, this.H) * 0.38;
    
    for (let i = 0; i < strokeCount; i++) {
      const type = this.rand() < 0.45 ? "coast" : 
                   this.rand() < 0.7 ? "mountain" : 
                   this.rand() < 0.85 ? "river" : "city";
      
      let stroke = { type, points: [], progress: 0, startFrame: 0, duration: 0, delay: 0 };
      
      if (type === "coast") {
        // Organic coastline - bezier curves around the map
        const segments = 8 + Math.floor(this.rand() * 6);
        const angleOffset = this.rand() * Math.PI * 2;
        const radiusVariation = 0.15 + this.rand() * 0.25;
        
        for (let s = 0; s <= segments; s++) {
          const angle = (s / segments) * Math.PI * 2 + angleOffset;
          const r = mapRadius * (1 + (this.rand() - 0.5) * radiusVariation);
          const x = this.W/2 + Math.cos(angle) * r;
          const y = this.H/2 + Math.sin(angle) * r;
          stroke.points.push({ x, y, pressure: 0.5 + this.rand() * 0.5 });
        }
        stroke.duration = 30 + Math.floor(this.rand() * 40);
        stroke.delay = Math.floor(this.rand() * 120);
        
      } else if (type === "mountain") {
        // Mountain range - jagged lines
        const peaks = 3 + Math.floor(this.rand() * 4);
        const baseAngle = this.rand() * Math.PI * 2;
        const distance = mapRadius * (0.15 + this.rand() * 0.5);
        
        let px = this.W/2 + Math.cos(baseAngle) * distance * 0.7;
        let py = this.H/2 + Math.sin(baseAngle) * distance * 0.7;
        stroke.points.push({ x: px, y: py, pressure: 0.3 });
        
        for (let p = 1; p <= peaks; p++) {
          const angle = baseAngle + (this.rand() - 0.5) * 0.8;
          const dist = distance * (0.8 + this.rand() * 0.4);
          px = this.W/2 + Math.cos(angle) * dist;
          py = this.H/2 + Math.sin(angle) * dist;
          stroke.points.push({ x: px, y: py, pressure: 0.2 + this.rand() * 0.6 });
        }
        stroke.duration = 20 + Math.floor(this.rand() * 30);
        stroke.delay = 60 + Math.floor(this.rand() * 180);
        
      } else if (type === "river") {
        // River - organic flow from mountains to coast
        const segments = 6 + Math.floor(this.rand() * 5);
        const startAngle = this.rand() * Math.PI * 2;
        let px = this.W/2 + Math.cos(startAngle) * mapRadius * (0.2 + this.rand() * 0.3);
        let py = this.H/2 + Math.sin(startAngle) * mapRadius * (0.2 + this.rand() * 0.3);
        stroke.points.push({ x: px, y: py, pressure: 0.15 });
        
        for (let s = 1; s <= segments; s++) {
          const angle = startAngle + (this.rand() - 0.5) * 1.2;
          const step = mapRadius * (0.05 + this.rand() * 0.08);
          px += Math.cos(angle) * step;
          py += Math.sin(angle) * step;
          // Curve toward coast
          const toCenterX = this.W/2 - px;
          const toCenterY = this.H/2 - py;
          const centerDist = Math.hypot(toCenterX, toCenterY);
          if (centerDist > mapRadius * 0.85) {
            px += toCenterX * 0.15;
            py += toCenterY * 0.15;
          }
          stroke.points.push({ x: px, y: py, pressure: 0.1 + this.rand() * 0.3 });
        }
        stroke.duration = 25 + Math.floor(this.rand() * 35);
        stroke.delay = 30 + Math.floor(this.rand() * 150);
        
      } else {
        // City - cluster of dots
        const cx = this.W/2 + (this.rand() - 0.5) * mapRadius * 1.2;
        const cy = this.H/2 + (this.rand() - 0.5) * mapRadius * 1.2;
        const count = 3 + Math.floor(this.rand() * 5);
        for (let c = 0; c < count; c++) {
          stroke.points.push({ 
            x: cx + (this.rand() - 0.5) * 15, 
            y: cy + (this.rand() - 0.5) * 15, 
            pressure: 0.6 
          });
        }
        stroke.duration = 15 + Math.floor(this.rand() * 20);
        stroke.delay = 100 + Math.floor(this.rand() * 200);
      }
      
      // Stagger start frames
      stroke.startFrame = stroke.delay;
      this.strokes.push(stroke);
    }
    
    // Sort by start frame
    this.strokes.sort((a, b) => a.startFrame - b.startFrame);
    
    // Generate salt crystals for sparkle effect
    this.generateCrystals();
    this.generateInkWashes();
    this.generateScreenTones();
  }
  
  generateCrystals() {
    // Salt crystals that sparkle on drawn lines
    for (let i = 0; i < 300; i++) {
      this.crystals.push({
        x: this.rand() * this.W,
        y: this.rand() * this.H,
        size: 0.5 + this.rand() * 2,
        phase: this.rand() * Math.PI * 2,
        speed: 0.02 + this.rand() * 0.05,
        alpha: 0.3 + this.rand() * 0.7,
        attached: false,
        attachStroke: -1,
        attachProgress: 0
      });
    }
  }
  
  generateInkWashes() {
    // Ink wash / watercolor bleed effects
    for (let i = 0; i < 25; i++) {
      this.inkWashes.push({
        x: this.rand() * this.W,
        y: this.rand() * this.H,
        radius: 40 + this.rand() * 80,
        intensity: 0.05 + this.rand() * 0.15,
        phase: this.rand() * Math.PI * 2,
        growSpeed: 0.005 + this.rand() * 0.01,
        maxRadius: 80 + this.rand() * 120,
        attached: false,
        attachStroke: -1
      });
    }
  }
  
  generateScreenTones() {
    // Manga-style screen tones (halftone dots)
    for (let i = 0; i < 15; i++) {
      this.screenTones.push({
        x: this.rand() * this.W * 0.8 + this.W * 0.1,
        y: this.rand() * this.H * 0.8 + this.H * 0.1,
        w: 60 + this.rand() * 120,
        h: 60 + this.rand() * 120,
        density: 0.1 + this.rand() * 0.3,
        dotSize: 1 + Math.floor(this.rand() * 3),
        angle: this.rand() * Math.PI * 0.5,
        attached: false,
        attachStroke: -1
      });
    }
  }
  
  update(frame) {
    this.frame = frame;
    
    // Update stroke progress
    for (const stroke of this.strokes) {
      if (frame >= stroke.startFrame && frame < stroke.startFrame + stroke.duration) {
        stroke.progress = (frame - stroke.startFrame) / stroke.duration;
        
        // Attach crystals to active strokes
        if (!stroke.crystalsAttached) {
          for (const crystal of this.crystals) {
            if (!crystal.attached && this.rand() < 0.3) {
              crystal.attached = true;
              crystal.attachStroke = this.strokes.indexOf(stroke);
              crystal.attachProgress = this.rand();
            }
          }
          stroke.crystalsAttached = true;
        }
        
        // Attach ink washes
        if (!stroke.washAttached && this.rand() < 0.15) {
          for (const wash of this.inkWashes) {
            if (!wash.attached) {
              wash.attached = true;
              wash.attachStroke = this.strokes.indexOf(stroke);
              wash.x = stroke.points[0]?.x ?? this.W/2;
              wash.y = stroke.points[0]?.y ?? this.H/2;
              break;
            }
          }
          stroke.washAttached = true;
        }
        
        // Attach screen tones to mountain/city strokes
        if (!stroke.toneAttached && (stroke.type === "mountain" || stroke.type === "city") && this.rand() < 0.1) {
          for (const tone of this.screenTones) {
            if (!tone.attached) {
              tone.attached = true;
              tone.attachStroke = this.strokes.indexOf(stroke);
              break;
            }
          }
          stroke.toneAttached = true;
        }
      }
    }
    
    // Update crystal animation
    for (const crystal of this.crystals) {
      crystal.phase += crystal.speed;
      if (crystal.attached && crystal.attachStroke >= 0) {
        const stroke = this.strokes[crystal.attachStroke];
        if (stroke && stroke.points.length > 0) {
          const idx = Math.floor(crystal.attachProgress * (stroke.points.length - 1));
          const pt = stroke.points[Math.min(idx, stroke.points.length - 1)];
          crystal.x = pt.x + (this.rand() - 0.5) * 8;
          crystal.y = pt.y + (this.rand() - 0.5) * 8;
        }
      }
    }
    
    // Update ink washes
    for (const wash of this.inkWashes) {
      if (wash.attached && wash.attachStroke >= 0) {
        const stroke = this.strokes[wash.attachStroke];
        if (stroke && stroke.progress > 0.3) {
          wash.radius = Math.min(wash.maxRadius, wash.radius + wash.growSpeed * 30);
        }
      }
    }
  }
  
  draw() {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    
    // 1. Paper background
    ctx.putImageData(this.paperTexture, 0, 0);
    
    // Subtle paper tint
    ctx.fillStyle = this.accentColor;
    ctx.globalAlpha = 0.02;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    
    // 2. Ink washes (behind strokes)
    for (const wash of this.inkWashes) {
      if (wash.radius > 1) {
        const grad = ctx.createRadialGradient(wash.x, wash.y, 0, wash.x, wash.y, wash.radius);
        grad.addColorStop(0, `rgba(20,20,20,${wash.intensity})`);
        grad.addColorStop(0.5, `rgba(30,30,30,${wash.intensity * 0.5})`);
        grad.addColorStop(1, "rgba(40,40,40,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(wash.x, wash.y, wash.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // 3. Screen tones (manga halftone)
    for (const tone of this.screenTones) {
      if (tone.attached) {
        this.drawScreenTone(tone);
      }
    }
    
    // 4. Draw strokes progressively
    for (const stroke of this.strokes) {
      if (this.frame < stroke.startFrame) continue;
      const progress = Math.min(1, Math.max(0, stroke.progress));
      const visiblePoints = Math.max(1, Math.floor(stroke.points.length * progress));
      
      if (visiblePoints < 2) continue;
      
      ctx.strokeStyle = stroke.type === "city" ? this.saltColor : 
                        stroke.type === "river" ? "#a8c8e0" :
                        stroke.type === "mountain" ? "#d8c8b0" : "#e8e0d0";
      ctx.lineWidth = stroke.type === "city" ? 1.5 : 
                      stroke.type === "river" ? 1.2 : 
                      stroke.type === "mountain" ? 2.0 : 1.8;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = 0.9;
      
      ctx.beginPath();
      const pts = stroke.points;
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < visiblePoints; i++) {
        const pt = pts[i];
        const prev = pts[i-1];
        // Smooth curve
        const cx = (prev.x + pt.x) / 2;
        const cy = (prev.y + pt.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, cx, cy);
      }
      ctx.stroke();
      
      // Pressure-based width variation (subtle)
      if (stroke.type === "coast" || stroke.type === "mountain") {
        ctx.globalAlpha = 0.4;
        ctx.lineWidth *= 0.6;
        ctx.strokeStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < visiblePoints; i++) {
          const cx = (pts[i-1].x + pts[i].x) / 2;
          const cy = (pts[i-1].y + pts[i].y) / 2;
          ctx.quadraticCurveTo(pts[i-1].x, pts[i-1].y, cx, cy);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    
    // 5. Salt crystals (sparkle on top)
    for (const crystal of this.crystals) {
      if (!crystal.attached) continue;
      const alpha = crystal.alpha * (0.5 + 0.5 * Math.sin(crystal.phase * 3));
      if (alpha < 0.1) continue;
      
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ffffff";
      const size = crystal.size * (0.8 + 0.4 * Math.sin(crystal.phase * 2));
      
      // Diamond sparkle
      ctx.beginPath();
      ctx.moveTo(crystal.x, crystal.y - size);
      ctx.lineTo(crystal.x + size * 0.6, crystal.y);
      ctx.lineTo(crystal.x, crystal.y + size);
      ctx.lineTo(crystal.x - size * 0.6, crystal.y);
      ctx.closePath();
      ctx.fill();
      
      // Cross sparkle
      if (Math.sin(crystal.phase * 4) > 0.5) {
        ctx.globalAlpha = alpha * 0.6;
        ctx.beginPath();
        ctx.moveTo(crystal.x - size * 1.5, crystal.y);
        ctx.lineTo(crystal.x + size * 1.5, crystal.y);
        ctx.moveTo(crystal.x, crystal.y - size * 1.5);
        ctx.lineTo(crystal.x, crystal.y + size * 1.5);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    
    // 6. Cel shading outline pass (anime style)
    this.drawCelOutlines();
    
    // 7. Vignette
    this.drawVignette();
    
    // 8. HUD
    this.drawHUD();
  }
  
  drawScreenTone(tone) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(tone.x, tone.y);
    ctx.rotate(tone.angle);
    ctx.translate(-tone.w/2, -tone.h/2);
    
    const dotSize = tone.dotSize;
    const spacing = dotSize / tone.density;
    const cols = Math.ceil(tone.w / spacing);
    const rows = Math.ceil(tone.h / spacing);
    
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    for (let ry = 0; ry < rows; ry++) {
      for (let rx = 0; rx < cols; rx++) {
        const x = rx * spacing + (ry % 2) * spacing * 0.5;
        const y = ry * spacing;
        if (x >= 0 && x <= tone.w && y >= 0 && y <= tone.h) {
          ctx.beginPath();
          ctx.arc(x, y, dotSize * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }
  
  drawCelOutlines() {
    // Anime-style cel shading: dark outlines on key shapes
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(10,10,10,0.6)";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    for (const stroke of this.strokes) {
      if (this.frame < stroke.startFrame) continue;
      const progress = Math.min(1, Math.max(0, stroke.progress));
      const visiblePoints = Math.max(2, Math.floor(stroke.points.length * progress));
      if (visiblePoints < 3) continue;
      
      const pts = stroke.points;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < visiblePoints; i++) {
        const cx = (pts[i-1].x + pts[i].x) / 2;
        const cy = (pts[i-1].y + pts[i].y) / 2;
        ctx.quadraticCurveTo(pts[i-1].x, pts[i-1].y, cx, cy);
      }
      ctx.stroke();
    }
  }
  
  drawVignette() {
    const ctx = this.ctx;
    const grad = ctx.createRadialGradient(this.W/2, this.H/2, 0, this.W/2, this.H/2, Math.max(this.W, this.H) * 0.7);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.7, "rgba(0,0,0,0.15)");
    grad.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.W, this.H);
  }
  
  drawHUD() {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = "10px 'Courier New', monospace";
    ctx.fillStyle = "rgba(200,200,180,0.7)";
    const time = (this.frame / 30).toFixed(1);
    ctx.fillText(`SALT MAP ANIME  ${time}s / 15s`, 12, 18);
    ctx.fillText(`FRAME ${this.frame} / 450`, 12, 34);
    ctx.fillText(`STROKES: ${this.strokes.filter(s => this.frame >= s.startFrame).length}/${this.strokes.length}`, 12, 50);
    ctx.restore();
  }
  
  renderFrame() {
    this.update(this.frame);
    this.draw();
    this.frame++;
    return this.canvas.toBuffer("image/png");
  }
}

export function renderSaltMapAnime(totalFrames = 450, width = 1280, height = 720, seed = 0x5EED4D00) {
  const renderer = new SaltMapRenderer(width, height, seed);
  const result = [];
  
  for (let i = 0; i < totalFrames; i++) {
    const png = renderer.renderFrame();
    result.push(png);
    if (i % 30 === 0) process.stdout.write(".");
  }
  console.log();
  return result;
}