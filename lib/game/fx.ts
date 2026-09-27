/**
 * Efectos visuales del juego (chispas, anillos, destellos de fallo).
 * Vive fuera de React: se actualiza y dibuja en el mismo requestAnimationFrame del canvas.
 */

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }
interface Ring { x: number; y: number; life: number; max: number; color: string; big: boolean }
interface Puff { x: number; y: number; life: number; max: number }

export class Fx {
  sparks: Spark[] = [];
  rings: Ring[] = [];
  puffs: Puff[] = [];
  /** Tiempo (performance.now/1000) del último fallo por carril, para teñir el receptor de rojo. */
  missAt: number[] = new Array(6).fill(-99);
  /** Sacudida de pantalla tras un fallo (0..1). */
  shake = 0;
  private last = 0;
  /** Modo liviano (teléfonos): menos chispas y sin destellos con degradado. */
  low = false;

  hit(x: number, y: number, color: string, perfect: boolean) {
    const n = this.low ? (perfect ? 5 : 3) : perfect ? 18 : 10;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const sp = 180 + Math.random() * (perfect ? 380 : 240);
      this.sparks.push({
        x: x + (Math.random() - 0.5) * 20, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: 0.35 + Math.random() * 0.35, size: 1.5 + Math.random() * (perfect ? 3 : 2),
        color: Math.random() < 0.35 ? '#FFFFFF' : Math.random() < 0.5 ? '#FFD23F' : color
      });
    }
    this.rings.push({ x, y, life: 0, max: perfect ? 0.32 : 0.24, color, big: perfect });
    const cap = this.low ? 80 : 500;
    if (this.sparks.length > cap) this.sparks.splice(0, this.sparks.length - cap);
  }

  /** Chispas continuas mientras se mantiene una nota larga. */
  sustain(x: number, y: number, color: string) {
    if (Math.random() < (this.low ? 0.85 : 0.5)) return;
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
    const sp = 120 + Math.random() * 160;
    this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.25 + Math.random() * 0.2, size: 1.2 + Math.random() * 1.8, color: Math.random() < 0.4 ? '#FFFFFF' : color });
  }

  miss(lane: number, x: number, y: number) {
    this.missAt[lane] = performance.now() / 1000;
    this.puffs.push({ x, y, life: 0, max: 0.4 });
    if (!this.low) this.shake = Math.min(1, this.shake + 0.35);
  }

  step() {
    const now = performance.now() / 1000;
    const dt = this.last ? Math.min(0.05, now - this.last) : 0.016;
    this.last = now;
    for (const s of this.sparks) { s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 900 * dt; s.vx *= 0.985; }
    this.sparks = this.sparks.filter((s) => s.life < s.max);
    for (const r of this.rings) r.life += dt;
    this.rings = this.rings.filter((r) => r.life < r.max);
    for (const p of this.puffs) p.life += dt;
    this.puffs = this.puffs.filter((p) => p.life < p.max);
    this.shake = Math.max(0, this.shake - dt * 4);
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const k = r.life / r.max;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.lineWidth = (r.big ? 6 : 4) * (1 - k) + 1;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, 30 + k * (r.big ? 70 : 50), (30 + k * (r.big ? 70 : 50)) * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (r.big && k < 0.4 && !this.low) {
        const g = ctx.createRadialGradient(r.x, r.y - 20, 0, r.x, r.y - 20, 90);
        g.addColorStop(0, `rgba(255,255,255,${0.6 * (1 - k / 0.4)})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.fillRect(r.x - 90, r.y - 110, 180, 180);
      }
    }
    for (const s of this.sparks) {
      const k = s.life / s.max;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      // Chispa alargada en la dirección del movimiento
      const len = Math.min(14, Math.hypot(s.vx, s.vy) * 0.02);
      const ang = Math.atan2(s.vy, s.vx);
      ctx.ellipse(s.x, s.y, s.size + len, s.size * 0.7, ang, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    for (const p of this.puffs) {
      const k = p.life / p.max;
      ctx.globalAlpha = (1 - k) * 0.5;
      ctx.fillStyle = '#6B5E8F';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(p.x + (i - 1) * 14 * (1 + k), p.y - k * 30 - i * 4, 10 + k * 16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
