import type { Level, Point, State, Tank } from './types';
import { LocalizedError } from './api';

const FLOOR = '#172124';
const GOLD = '#f0c778';
const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 0.06) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
}

function tile(ctx: CanvasRenderingContext2D, char: string, x: number, y: number, time: number, detail: boolean) {
  if (char === '+') {
    ctx.fillStyle = '#a45d43'; ctx.fillRect(x + 0.025, y + 0.025, 0.95, 0.95);
    if (!detail) return;
    ctx.fillStyle = '#c17c57'; ctx.fillRect(x + 0.06, y + 0.06, 0.88, 0.1);
    ctx.fillStyle = '#683e32'; ctx.fillRect(x, y + 0.47, 1, 0.06);
    ctx.fillRect(x + 0.47, y, 0.06, 0.47); ctx.fillRect(x + 0.22, y + 0.53, 0.06, 0.47);
  } else if (char === '#') {
    ctx.fillStyle = '#627275'; ctx.fillRect(x + 0.025, y + 0.025, 0.95, 0.95);
    if (!detail) return;
    ctx.fillStyle = '#829295'; ctx.fillRect(x + 0.07, y + 0.07, 0.86, 0.08);
    ctx.fillStyle = '#35474c'; ctx.fillRect(x + 0.07, y + 0.85, 0.86, 0.08);
    ctx.strokeStyle = '#45595d'; ctx.lineWidth = 0.035;
    ctx.strokeRect(x + 0.2, y + 0.22, 0.6, 0.53);
  } else if (char === '~') {
    ctx.fillStyle = '#194b5a'; ctx.fillRect(x, y, 1, 1);
    if (!detail) return;
    ctx.strokeStyle = '#337888'; ctx.lineWidth = 0.035;
    for (let row = 0; row < 2; row++) {
      const shift = Math.sin(time * 1.2 + x + y * 2 + row) * 0.07;
      ctx.beginPath(); ctx.moveTo(x + 0.12, y + 0.3 + row * 0.45 + shift);
      ctx.lineTo(x + 0.45, y + 0.25 + row * 0.45 + shift); ctx.lineTo(x + 0.8, y + 0.3 + row * 0.45 + shift); ctx.stroke();
    }
  } else if (char === 'g') {
    ctx.fillStyle = detail ? 'rgba(73,107,66,.85)' : '#4d6949'; ctx.fillRect(x + 0.025, y + 0.025, 0.95, 0.95);
    if (!detail) return;
    ctx.strokeStyle = '#789064'; ctx.lineWidth = 0.045;
    for (let n = 0; n < 3; n++) {
      ctx.beginPath(); ctx.moveTo(x + 0.2 + n * 0.27, y + 0.8); ctx.lineTo(x + 0.13 + n * 0.27, y + 0.26); ctx.stroke();
    }
  }
}

export function drawTank(ctx: CanvasRenderingContext2D, tank: Tank, position: Point, time: number, large = false) {
  if (tank.hp <= 0) return;
  const player = tank.kind === 'player';
  const colour = player ? GOLD : tank.kind === 'heavy' ? '#d6b58d' : tank.kind === 'striker' ? '#d97458' : '#96afb0';
  const light = player ? '#ffe4a1' : tank.kind === 'heavy' ? '#f2d6ae' : tank.kind === 'striker' ? '#f99b72' : '#c4d6d3';
  ctx.save(); ctx.translate(position.x, position.y); ctx.rotate(tank.dir * Math.PI / 2);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; rounded(ctx, -.42, -.35, .88, .9);
  ctx.fillStyle = '#11191b'; rounded(ctx, -.42, -.4, .23, .84); rounded(ctx, .19, -.4, .23, .84);
  ctx.strokeStyle = '#556166'; ctx.lineWidth = .055;
  const treadOffset = large ? 0 : (Math.floor(time * 14) % 2) * .035;
  for (let y = -.34; y < .4; y += .13) {
    ctx.beginPath(); ctx.moveTo(-.39, y + treadOffset); ctx.lineTo(-.22, y + treadOffset); ctx.moveTo(.22, y + treadOffset); ctx.lineTo(.39, y + treadOffset); ctx.stroke();
  }
  ctx.fillStyle = colour; rounded(ctx, -.24, -.35, .48, .69, .07);
  ctx.fillStyle = light; ctx.fillRect(-.19, -.32, .38, .07);
  ctx.fillStyle = '#384243'; rounded(ctx, -.12, -.62, .24, .42, .025);
  ctx.fillStyle = light; ctx.fillRect(-.07, -.59, .14, .35);
  ctx.fillStyle = light; rounded(ctx, -.19, -.18, .38, .36, .1);
  ctx.fillStyle = colour; rounded(ctx, -.11, -.1, .22, .22, .07);
  ctx.fillStyle = player ? '#4e4933' : '#455354'; ctx.fillRect(-.1, .23, .2, .045);
  if (tank.kind === 'heavy' && tank.hp > 1) {
    ctx.strokeStyle = '#efdbbc'; ctx.lineWidth = .045; ctx.strokeRect(-.24, -.35, .48, .69);
  }
  ctx.restore();
  if (tank.shield) {
    ctx.strokeStyle = `rgba(139,219,220,${.5 + Math.sin(time * 9) * .15})`; ctx.lineWidth = .045;
    ctx.beginPath(); ctx.arc(position.x, position.y, .62, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawBase(ctx: CanvasRenderingContext2D, base: Point & { hp?: number; maxHp?: number }) {
  ctx.save(); ctx.translate(base.x, base.y);
  ctx.fillStyle = '#293c3b'; rounded(ctx, -.48, -.48, .96, .96, .08);
  ctx.strokeStyle = (base.hp ?? 1) > 0 ? GOLD : '#744b40'; ctx.lineWidth = .05;
  ctx.beginPath(); ctx.moveTo(0, -.36); ctx.lineTo(.3, -.22); ctx.lineTo(.27, .18); ctx.lineTo(0, .35); ctx.lineTo(-.27, .18); ctx.lineTo(-.3, -.22); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = (base.hp ?? 1) > 0 ? GOLD : '#744b40';
  ctx.fillRect(-.035, -.2, .07, .38); ctx.fillRect(-.18, -.04, .36, .07);
  ctx.restore();
}

export function drawMinimap(canvas: HTMLCanvasElement, level: Level) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const width = 144; canvas.width = width * dpr; canvas.height = width * dpr;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.scale(width * dpr / level.grid.length, width * dpr / level.grid.length);
  ctx.fillStyle = FLOOR; ctx.fillRect(0, 0, 24, 24);
  level.grid.forEach((row, y) => [...row].forEach((char, x) => tile(ctx, char, x, y, 0, false)));
  ctx.fillStyle = '#eb916b';
  level.enemySpawns.forEach(p => ctx.fillRect(p.x - .55, p.y - .55, 1.1, 1.1));
  ctx.fillStyle = GOLD; ctx.fillRect(level.playerSpawn.x - .7, level.playerSpawn.y - .7, 1.4, 1.4);
  ctx.fillStyle = '#b8d9c9'; ctx.fillRect(level.base.x - .65, level.base.y - .65, 1.3, 1.3);
}

/** Renderer interpolates remote entities. Gameplay always uses authoritative Go state.
 * Future client prediction must share movement constants/collision semantics and replay
 * unacknowledged input sequences, never overwrite authoritative score or outcomes. */
export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private frame = 0;
  private current?: State;
  private previous?: State;
  private receivedAt = 0;
  private interval = 67;
  private observer: ResizeObserver;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private level: Level;
  private move = 0;
  private inputAt = 0;

  constructor(private canvas: HTMLCanvasElement, level: Level) {
    this.level = level;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new LocalizedError('error.canvas');
    this.ctx = context;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas); this.resize(); this.draw(performance.now());
  }
  private resize() {
    const size = Math.max(240, this.canvas.clientWidth);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(size * dpr); this.canvas.height = Math.round(size * dpr);
  }
  push(state: State) {
    const now = performance.now();
    this.previous = this.current;
    if (this.receivedAt) this.interval = Math.min(150, Math.max(30, now - this.receivedAt));
    this.receivedAt = now; this.current = state;
  }
  setInput(move: number) { if (move !== this.move) { this.move = move; this.inputAt = performance.now(); } }
  private playerPosition(state: State, now: number): Point {
    // Bounded visual extrapolation improves local responsiveness; each snapshot resets
    // the origin. Full rollback prediction is deliberately not a source of game truth.
    if (!this.move || state.player.hp <= 0 || state.status !== 'playing') return state.player;
    const [dx, dy] = DIRECTIONS[this.move - 1];
    const seconds = Math.max(0, Math.min(80, now - this.receivedAt, now - this.inputAt)) / 1000;
    const next = { x: state.player.x + dx * 3.15 * seconds, y: state.player.y + dy * 3.15 * seconds };
    for (let y = Math.floor(next.y - .36); y <= Math.floor(next.y + .36); y++) {
      for (let x = Math.floor(next.x - .36); x <= Math.floor(next.x + .36); x++) {
        const cell = state.grid[y]?.[x];
        if (!cell || cell === '#' || cell === '+' || cell === '~') return state.player;
      }
    }
    if ((state.enemies || []).some(enemy => enemy.hp > 0 && Math.abs(next.x - enemy.x) < .72 && Math.abs(next.y - enemy.y) < .72)) return state.player;
    if (Math.abs(next.x - state.base.x) < .86 && Math.abs(next.y - state.base.y) < .86) return state.player;
    return next;
  }
  private position(entity: Point & { id: number }, old: (Point & { id: number })[] | undefined, alpha: number): Point {
    const prior = old?.find(e => e.id === entity.id);
    if (!prior || Math.hypot(entity.x - prior.x, entity.y - prior.y) > 2) return entity;
    return { x: prior.x + (entity.x - prior.x) * alpha, y: prior.y + (entity.y - prior.y) * alpha };
  }
  private draw = (now: number) => {
    const ctx = this.ctx, state = this.current;
    const time = this.reducedMotion ? 0 : now / 1000;
    const alpha = Math.min(1, Math.max(0, (now - this.receivedAt) / this.interval));
    const scale = this.canvas.width / 24;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = FLOOR; ctx.fillRect(0, 0, 24, 24);
    ctx.strokeStyle = '#1c2a2d'; ctx.lineWidth = .025;
    for (let i = 0; i <= 24; i++) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 24); ctx.moveTo(0, i); ctx.lineTo(24, i); ctx.stroke(); }
    const grid = state?.grid || this.level.grid;
    grid.forEach((row, y) => [...row].forEach((char, x) => { if (char !== 'g') tile(ctx, char, x, y, time, true); }));
    drawBase(ctx, state?.base || this.level.base);
    if (state) {
      for (const enemy of state.enemies || []) drawTank(ctx, enemy, this.position(enemy, this.previous?.enemies, alpha), time);
      // Render local player from the most recent authoritative snapshot for minimum latency.
      drawTank(ctx, { ...state.player, dir: this.move && state.status === 'playing' ? this.move - 1 : state.player.dir }, this.playerPosition(state, now), time);
      for (const bullet of state.bullets || []) {
        const p = this.position(bullet, this.previous?.bullets, alpha);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(bullet.dir * Math.PI / 2);
        ctx.fillStyle = bullet.owner === 'player' ? '#ffeab4' : '#ff956d';
        ctx.fillRect(-.065, -.16, .13, .3);
        ctx.fillStyle = bullet.owner === 'player' ? '#b79c5b55' : '#dd765344'; ctx.fillRect(-.065, .14, .13, .2);
        ctx.restore();
      }
      grid.forEach((row, y) => [...row].forEach((char, x) => { if (char === 'g') tile(ctx, char, x, y, time, true); }));
      for (const effect of state.effects || []) {
        const radius = effect.kind === 'explosion' ? .65 : effect.kind === 'spawn' ? .6 : .22;
        const phase = Math.max(.1, Math.min(1, effect.ttl / .35));
        ctx.globalAlpha = phase;
        ctx.strokeStyle = effect.kind === 'spawn' ? '#a6d8cf' : '#f8b074'; ctx.lineWidth = .055;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, radius * (1.4 - phase * .65), 0, Math.PI * 2); ctx.stroke();
        if (effect.kind !== 'spawn') {
          for (const [dx, dy] of DIRECTIONS) { ctx.beginPath(); ctx.moveTo(effect.x + dx * .12, effect.y + dy * .12); ctx.lineTo(effect.x + dx * radius, effect.y + dy * radius); ctx.stroke(); }
        }
        ctx.globalAlpha = 1;
      }
    } else {
      drawTank(ctx, { id: 0, ...this.level.playerSpawn, dir: 0, hp: 1, maxHp: 1, kind: 'player', shield: false }, this.level.playerSpawn, time);
    }
    this.frame = requestAnimationFrame(this.draw);
  };
  destroy() { cancelAnimationFrame(this.frame); this.observer.disconnect(); }
}
