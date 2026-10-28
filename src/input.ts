/** Pure input state, independently testable without a browser or game server. */
const movement: Record<string, number> = { w: 1, arrowup: 1, d: 2, arrowright: 2, s: 3, arrowdown: 3, a: 4, arrowleft: 4 };
export class InputState {
  private keys: string[] = [];
  private directions = new Map<number, number>();
  private firing = new Set<number>();
  pressKey(key: string): boolean {
    if (!(key in movement) && key !== ' ') return false;
    if (this.keys.includes(key)) return false;
    this.keys.push(key); return true;
  }
  releaseKey(key: string): boolean {
    const had = this.keys.includes(key);
    this.keys = this.keys.filter(item => item !== key); return had;
  }
  pressPointer(id: number, move?: number) {
    if (move !== undefined && move >= 1 && move <= 4) this.directions.set(id, move);
    else if (move === undefined) this.firing.add(id);
  }
  releasePointer(id: number) { this.directions.delete(id); this.firing.delete(id); }
  clear() { this.keys = []; this.directions.clear(); this.firing.clear(); }
  read(): { move: number; fire: boolean } {
    return {
      move: [...this.directions.values()].at(-1) || movement[[...this.keys].reverse().find(key => key in movement) || ''] || 0,
      fire: this.keys.includes(' ') || this.firing.size > 0,
    };
  }
}
