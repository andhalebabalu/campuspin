'use client';

import { useEffect, useRef } from 'react';

/** Pin and dot colours: the brand's category tints, so the background speaks the map's language. */
const PALETTES = {
  light: {
    nodes: ['#0b63cf', '#2c963c', '#d9650b', '#6d3fd6', '#d62c4a', '#0e8a83'],
    line: '11, 99, 207',
    glow: '44, 150, 60',
    lineAlpha: 0.16,
    nodeAlpha: 0.42,
  },
  dark: {
    nodes: ['#8abcf9', '#7fd18b', '#ffb36b', '#b9a2f5', '#ff9fb0', '#7fd6cf'],
    line: '186, 215, 251',
    glow: '127, 209, 139',
    lineAlpha: 0.14,
    nodeAlpha: 0.55,
  },
} as const;

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Pins are drawn as map markers, the rest as small dots. */
  pin: boolean;
  size: number;
  color: string;
  phase: number;
  /** How far the cursor's line to this node has grown (0..1). */
  link: number;
}

interface Packet {
  from: number;
  to: number;
  t: number;
  speed: number;
}

interface Ripple {
  x: number;
  y: number;
  age: number;
}

const LINK = 150; // node <-> node
const REACH = 190; // cursor -> node
const TRAIL_MS = 650;

function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  const r = size * 0.42;
  const cy = y - size * 0.25;
  ctx.beginPath();
  ctx.arc(x, cy, r, Math.PI * 0.78, Math.PI * 0.22);
  ctx.lineTo(x, cy + r * 2.05);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, cy, r * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill();
}

/**
 * A living map in the background: little map pins and dots drift, joined by faint lines into a
 * network, with lights travelling along some of the links. The cursor joins in: lines grow out from
 * wherever it is to the pins nearby, it leaves a fading trail as it moves, and a soft ring pulses
 * at each new spot.
 *
 * One canvas, drawn by hand (no library); it never takes clicks, pauses when hidden or off screen,
 * and is a still picture with reduced motion.
 */
export function MapNetwork({
  tone = 'light',
  fixed = false,
  className = '',
}: {
  tone?: keyof typeof PALETTES;
  /** Fixed behind the whole page (otherwise it fills its positioned parent). */
  fixed?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const palette = PALETTES[tone];
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let nodes: Node[] = [];
    let packets: Packet[] = [];
    const ripples: Ripple[] = [];
    const trail: Array<{ x: number; y: number; at: number }> = [];
    const pointer = { x: 0, y: 0, active: false, lastRippleX: -999, lastRippleY: -999 };
    let frame = 0;
    let visible = true;

    const makeNode = (index: number): Node => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      pin: index % 3 === 0,
      size: 11 + Math.random() * 6,
      color: palette.nodes[index % palette.nodes.length] ?? palette.nodes[0],
      phase: Math.random() * Math.PI * 2,
      link: 0,
    });

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = box.width;
      height = box.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const wanted = Math.max(18, Math.min(90, Math.round((width * height) / 22000)));
      nodes = nodes.filter((node) => node.x <= width && node.y <= height).slice(0, wanted);
      while (nodes.length < wanted) nodes.push(makeNode(nodes.length));
      packets = [];
    };

    const neighbours = (index: number) => {
      const a = nodes[index];
      if (!a) return [];
      const out: number[] = [];
      nodes.forEach((b, j) => {
        if (j !== index && Math.hypot(a.x - b.x, a.y - b.y) < LINK) out.push(j);
      });
      return out;
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height);

      // Drift.
      if (!still)
        for (const node of nodes) {
          node.x += node.vx;
          node.y += node.vy;
          if (node.x < -20) node.x = width + 20;
          if (node.x > width + 20) node.x = -20;
          if (node.y < -20) node.y = height + 20;
          if (node.y > height + 20) node.y = -20;
          // Pins near the cursor lean towards it a little.
          if (pointer.active) {
            const d = Math.hypot(pointer.x - node.x, pointer.y - node.y);
            if (d < REACH) {
              node.x += (pointer.x - node.x) * 0.002;
              node.y += (pointer.y - node.y) * 0.002;
            }
          }
        }

      // Node <-> node links.
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]!;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]!;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d >= LINK) continue;
          ctx.strokeStyle = `rgba(${palette.line}, ${(1 - d / LINK) * palette.lineAlpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // Lights travelling along links.
      if (!still) {
        while (packets.length < Math.min(8, Math.floor(nodes.length / 8))) {
          const from = Math.floor(Math.random() * nodes.length);
          const options = neighbours(from);
          const to = options[Math.floor(Math.random() * options.length)];
          if (to === undefined) break;
          packets.push({ from, to, t: 0, speed: 0.006 + Math.random() * 0.008 });
        }
        packets = packets.filter((packet) => {
          const a = nodes[packet.from];
          const b = nodes[packet.to];
          if (!a || !b || Math.hypot(a.x - b.x, a.y - b.y) > LINK * 1.2) return false;
          packet.t += packet.speed;
          if (packet.t >= 1) return false;
          const x = a.x + (b.x - a.x) * packet.t;
          const y = a.y + (b.y - a.y) * packet.t;
          const glow = ctx.createRadialGradient(x, y, 0, x, y, 6);
          glow.addColorStop(0, `rgba(${palette.glow}, 0.9)`);
          glow.addColorStop(1, `rgba(${palette.glow}, 0)`);
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fill();
          return true;
        });
      }

      // The cursor: a trail, growing lines to nearby pins, and ripples.
      if (!still) {
        while (trail.length && now - trail[0]!.at > TRAIL_MS) trail.shift();
        if (trail.length > 1) {
          ctx.lineCap = 'round';
          for (let k = 1; k < trail.length; k++) {
            const p = trail[k - 1]!;
            const q = trail[k]!;
            const life = 1 - (now - q.at) / TRAIL_MS;
            ctx.strokeStyle = `rgba(${palette.line}, ${life * 0.45})`;
            ctx.lineWidth = 1 + life * 2.5;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }

        for (const node of nodes) {
          const d = pointer.active ? Math.hypot(pointer.x - node.x, pointer.y - node.y) : Infinity;
          const target = d < REACH ? 1 : 0;
          node.link += (target - node.link) * (target ? 0.07 : 0.12);
          if (node.link < 0.01) continue;
          const ex = pointer.x + (node.x - pointer.x) * node.link;
          const ey = pointer.y + (node.y - pointer.y) * node.link;
          const strength = (1 - Math.min(d, REACH) / REACH) * 0.75 + 0.15;
          const gradient = ctx.createLinearGradient(pointer.x, pointer.y, ex, ey);
          gradient.addColorStop(0, `rgba(${palette.glow}, ${0.85 * strength})`);
          gradient.addColorStop(1, `rgba(${palette.line}, ${0.6 * strength * node.link})`);
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }

        for (let k = ripples.length - 1; k >= 0; k--) {
          const ripple = ripples[k]!;
          ripple.age += 1;
          const life = 1 - ripple.age / 50;
          if (life <= 0) {
            ripples.splice(k, 1);
            continue;
          }
          ctx.strokeStyle = `rgba(${palette.glow}, ${life * 0.5})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(ripple.x, ripple.y, 6 + (1 - life) * 38, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (pointer.active) {
          const halo = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 16);
          halo.addColorStop(0, `rgba(${palette.glow}, 0.55)`);
          halo.addColorStop(1, `rgba(${palette.glow}, 0)`);
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(pointer.x, pointer.y, 16, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Nodes on top: pins grow and brighten while connected to the cursor.
      for (const node of nodes) {
        const twinkle = still ? 1 : 0.75 + Math.sin(now / 900 + node.phase) * 0.25;
        ctx.globalAlpha = Math.min(1, palette.nodeAlpha * twinkle + node.link * 0.5);
        if (node.pin) drawPin(ctx, node.x, node.y, node.size * (1 + node.link * 0.35), node.color);
        else {
          ctx.fillStyle = node.color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 2 + node.link * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      frame = 0;
      if (!visible || document.hidden) return;
      draw(now);
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!still && !frame && visible && !document.hidden) frame = requestAnimationFrame(loop);
    };

    const onMove = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      const inside = x >= 0 && y >= 0 && x <= box.width && y <= box.height;
      pointer.active = inside;
      if (!inside) return;
      pointer.x = x;
      pointer.y = y;
      trail.push({ x, y, at: performance.now() });
      if (Math.hypot(x - pointer.lastRippleX, y - pointer.lastRippleY) > 140) {
        ripples.push({ x, y, age: 0 });
        pointer.lastRippleX = x;
        pointer.lastRippleY = y;
      }
    };
    const onLeave = () => {
      pointer.active = false;
    };

    resize();
    if (still) draw(0);
    else {
      start();
      window.addEventListener('pointermove', onMove, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave);
      window.addEventListener('blur', onLeave);
      document.addEventListener('visibilitychange', start);
    }
    const sizes = new ResizeObserver(() => {
      resize();
      if (still) draw(0);
    });
    sizes.observe(canvas);
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      start();
    });
    seen.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      seen.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      document.removeEventListener('visibilitychange', start);
    };
  }, [tone]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none ${fixed ? 'fixed inset-0 -z-10 h-dvh w-screen' : 'absolute inset-0 size-full'} ${className}`}
    />
  );
}
