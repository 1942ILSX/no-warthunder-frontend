import './styles.css';
import { api, LocalizedError, serverError } from './api';
import { applyTranslations, getLocale, normalizeLocale, setLocale, t, updateDocumentLanguage } from './i18n';
import type { MessageKey, Params } from './i18n';
import { AudioEngine } from './audio';
import { drawMinimap, GameRenderer } from './renderer';
import { InputState } from './input';
import { normalizePlayerID } from './validation';
import { difficultyStorageKey, isDifficulty, multiplierText, resolveDifficulty } from './difficulty';
import type { Difficulty, DifficultyProfile, RunDifficulty, Input, Level, RunResult, ScoreRecord, ServerMessage, State } from './types';
import { shell, icon, escapeHTML, languageSelect } from './shell';

const number = (n: number) => new Intl.NumberFormat('en-US').format(n);
const clock = (ms: number, hundredths = false) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}${hundredths ? `.${Math.floor(ms % 1000 / 10).toString().padStart(2, '0')}` : ''}`;
};
const l = (key: MessageKey, params: Params = {}) => `<span data-i18n="${key}" data-i18n-params="${escapeHTML(JSON.stringify(params))}">${escapeHTML(t(key, params))}</span>`;
const levelKey = (id: number, part: 'name' | 'subtitle' | 'description'): MessageKey => `level.${id}.${part}` as MessageKey;
const errorMarkup = (error: unknown) => error instanceof LocalizedError ? l(error.key, error.params) : l('error.generic');
const message = (element: HTMLElement, key: MessageKey, params: Params = {}) => {
  element.dataset.i18n = key; element.dataset.i18nParams = JSON.stringify(params); element.textContent = t(key, params);
};
document.querySelector<HTMLDivElement>('#app')!.innerHTML = shell;

class BattleCity {
  private levels: Level[] = [];
  private selected = 1;
  private difficulties: DifficultyProfile[] = [];
  private difficulty: Difficulty = 'expert';
  private leaderboardRequest = 0;
  private generation = 0;
  private socket?: WebSocket;
  private renderer?: GameRenderer;
  private interval?: number;
  private handshakeTimeout?: number;
  private seq = 0;
  private controls = new InputState();
  private lastInput = '';
  private state?: State;
  private result?: RunResult;
  private inGame = false;
  private submitting = false;
  private audio = new AudioEngine();
  private lastBullet = -1;

  constructor() { this.bind(); this.refreshLocale(); void this.load(); }
  private el<T extends HTMLElement = HTMLElement>(id: string) { return document.getElementById(id) as T; }
  private refreshLocale() {
    updateDocumentLanguage(); applyTranslations(); this.updateSound();
    document.querySelectorAll<HTMLSelectElement>('[data-language-select]').forEach(select => { select.value = getLocale(); });
    for (const level of this.levels) {
      document.querySelector(`[data-action="level"][data-level="${level.id}"]`)?.setAttribute('aria-label', t('mission.cardLabel', { id: level.id, name: t(levelKey(level.id, 'name')), difficulty: level.difficulty }));
    }
    const level = this.levels.find(item => item.id === this.selected);
    if (level) this.el('record-level-label').textContent = t('mission.labelName', { id: this.selected.toString().padStart(2, '0'), name: t(levelKey(this.selected, 'name')) });
    if (this.inGame && level) {
      this.el('game-mission-number').textContent = t('mission.numberOf', { id: level.id.toString().padStart(2, '0') });
      this.el('game-mission-name').textContent = t(levelKey(level.id, 'name'));
    }
    if (this.state) this.el('hud-base').setAttribute('aria-label', t('game.baseHP', { hp: this.state.base.hp, maxHp: this.state.base.maxHp }));
  }
  private bind() {
    document.addEventListener('change', event => {
      const select = event.target as HTMLSelectElement;
      if (!select.matches('[data-language-select]')) return;
      const locale = normalizeLocale(select.value);
      if (locale) { setLocale(locale); this.refreshLocale(); }
    });
    document.addEventListener('click', event => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target) return;
      switch (target.dataset.action) {
        case 'home': case 'missions': if (this.inGame) this.askLeave(); else this.el('missions').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); break;
        case 'manual': this.clearInput(); this.el<HTMLDialogElement>('manual-dialog').showModal(); break;
        case 'close-manual': this.el<HTMLDialogElement>('manual-dialog').close(); this.focusGame(); break;
        case 'sound': this.audio.toggle(); this.updateSound(); break;
        case 'difficulty': if (!this.inGame && isDifficulty(target.dataset.difficulty)) this.selectDifficulty(target.dataset.difficulty); break;
        case 'level': this.select(Number(target.dataset.level)); break;
        case 'deploy': case 'retry': void this.start(); break;
        case 'retry-load': void this.load(); break;
        case 'retry-records': void this.loadRecords(); break;
        case 'leave': this.askLeave(); break;
        case 'cancel-leave': this.el<HTMLDialogElement>('leave-dialog').close(); this.focusGame(); break;
        case 'confirm-leave': case 'return-home': this.home(); break;
      }
    });
    document.addEventListener('keydown', event => {
      if (!this.inGame || this.result || document.querySelector('dialog[open]') || (event.target as HTMLElement).closest('input, select, textarea, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') { event.preventDefault(); this.askLeave(); return; }
      if (!['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', ' '].includes(key)) return;
      event.preventDefault(); this.audio.unlock();
      if (this.controls.pressKey(key)) this.sendInput(true);
    });
    document.addEventListener('keyup', event => {
      const key = event.key.toLowerCase();
      if (this.controls.releaseKey(key)) { event.preventDefault(); this.sendInput(true); }
    });
    window.addEventListener('blur', () => this.clearInput());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearInput(); });
    window.addEventListener('pagehide', () => this.cleanup());
    document.querySelectorAll<HTMLButtonElement>('[data-move], [data-fire]').forEach(button => {
      button.addEventListener('pointerdown', event => {
        if (!this.inGame || this.result) return;
        event.preventDefault(); button.setPointerCapture(event.pointerId); button.classList.add('pressed'); this.audio.unlock();
        this.controls.pressPointer(event.pointerId, button.dataset.move ? Number(button.dataset.move) : undefined);
        this.sendInput(true);
      });
      const release = (event: PointerEvent) => { this.controls.releasePointer(event.pointerId); button.classList.remove('pressed'); this.sendInput(true); };
      button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
      button.addEventListener('contextmenu', event => event.preventDefault());
    });
    this.el('result-dialog').addEventListener('submit', event => { event.preventDefault(); void this.submit(); });
    this.el('result-dialog').addEventListener('cancel', event => { event.preventDefault(); this.home(); });
    this.el('manual-dialog').addEventListener('close', () => this.focusGame());
    this.el('leave-dialog').addEventListener('close', () => this.focusGame());
  }
  private async load() {
    this.el('server-status').innerHTML = `<i></i> ${l('header.connecting')}`;
    this.el('server-status').classList.remove('online', 'offline');
    this.el('difficulty-picker').hidden = true;
    this.el('level-grid').innerHTML = `<div class="loading-placeholder"><span class="spinner"></span> ${l('campaign.loading')}</div>`;
    try {
      const [{ levels }, settings] = await Promise.all([api.levels(), api.difficulties()]);
      const profiles = settings.difficulties.filter(profile => isDifficulty(profile.id) && Number.isFinite(profile.scoreMultiplier) && profile.scoreMultiplier > 0);
      if (!profiles.length) throw new LocalizedError('error.policyUnavailable');
      this.difficulties = profiles;
      let saved: string | null = null;
      try { saved = localStorage.getItem(difficultyStorageKey); } catch { /* Optional preference. */ }
      this.difficulty = resolveDifficulty(saved, profiles, settings.defaultDifficulty);
      this.renderDifficulties();
      if (!levels.length) throw new LocalizedError('error.noLevels');
      this.levels = levels;
      this.el('server-status').innerHTML = `<i></i> ${l('header.online')}`; this.el('server-status').classList.add('online');
      this.selected = levels.some(level => level.id === this.selected) ? this.selected : levels[0].id;
      this.renderLevels(); this.select(this.selected, false);
    } catch (error) {
      this.el('server-status').innerHTML = `<i></i> ${l('header.offline')}`; this.el('server-status').classList.add('offline');
      this.el('level-grid').innerHTML = `<div class="load-error">${icon('target')}<h3>${l('campaign.errorTitle')}</h3><p>${errorMarkup(error)}</p><button class="button secondary" data-action="retry-load">${l('campaign.reconnect')} ${icon('restart')}</button></div>`;
    }
  }
  private renderDifficulties() {
    this.el('difficulty-picker').hidden = false;
    this.el('difficulty-options').innerHTML = this.difficulties.map(profile => `<button type="button" class="difficulty-option ${profile.id === this.difficulty ? 'selected' : ''}" data-action="difficulty" data-difficulty="${profile.id}" aria-pressed="${profile.id === this.difficulty}"><span class="difficulty-option-heading"><strong>${l(`ai.${profile.id}`)}</strong><span class="score-multiplier">${multiplierText(profile.scoreMultiplier)}</span></span><span class="difficulty-description">${l(`ai.${profile.id}Description`)}</span></button>`).join('');
  }
  private selectDifficulty(difficulty: Difficulty) {
    if (!this.difficulties.some(profile => profile.id === difficulty)) return;
    this.difficulty = difficulty;
    document.querySelectorAll<HTMLButtonElement>('[data-action="difficulty"]').forEach(button => {
      const active = button.dataset.difficulty === difficulty;
      button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
    });
    try { localStorage.setItem(difficultyStorageKey, difficulty); } catch { /* Optional preference. */ }
    this.audio.play('select');
  }
  private showRunDifficulty(run: RunDifficulty | DifficultyProfile) {
    const difficulty = 'difficulty' in run ? run.difficulty : run.id;
    this.el('game-difficulty').innerHTML = `${l('ai.label')} <strong>${l(`ai.${difficulty}`)}</strong><span class="score-multiplier">${multiplierText(run.scoreMultiplier)}</span>`;
  }
  private renderLevels() {
    this.el('level-grid').innerHTML = this.levels.map(level => `<button class="level-card ${level.id === this.selected ? 'selected' : ''}" data-action="level" data-level="${level.id}" aria-pressed="${level.id === this.selected}" aria-label="${escapeHTML(t('mission.cardLabel', { id: level.id, name: t(levelKey(level.id, 'name')), difficulty: level.difficulty }))}"><span class="level-card-top"><span>${level.id.toString().padStart(2, '0')}</span><span class="difficulty" aria-hidden="true">${Array.from({ length: 5 }, (_, i) => `<i class="${i < level.difficulty ? 'filled' : ''}"></i>`).join('')}</span></span><canvas class="mini-map" data-map="${level.id}" aria-hidden="true"></canvas><span class="level-name">${l(levelKey(level.id, 'name'))}</span><span class="level-subtitle">${l(levelKey(level.id, 'subtitle'))}</span><span class="selected-indicator" aria-hidden="true">${icon('arrow')}</span></button>`).join('');
    document.querySelectorAll<HTMLCanvasElement>('[data-map]').forEach(canvas => {
      const level = this.levels.find(item => item.id === Number(canvas.dataset.map)); if (level) drawMinimap(canvas, level);
    });
  }
  private select(id: number, sound = true) {
    const level = this.levels.find(item => item.id === id); if (!level) return;
    this.selected = id;
    document.querySelectorAll<HTMLButtonElement>('.level-card').forEach(card => { const active = Number(card.dataset.level) === id; card.classList.toggle('selected', active); card.setAttribute('aria-pressed', String(active)); });
    this.el('selected-mission').innerHTML = `<div class="mission-number">${id.toString().padStart(2, '0')}<span>/ 10</span></div><div class="mission-brief"><div class="eyebrow">${l('mission.next')}</div><h3>${l(levelKey(level.id, 'name'))}</h3><p>${l(levelKey(level.id, 'description'))}</p><span class="mission-brief-meta">${l('mission.enemyCount', {count: level.enemyCount})} <span>·</span> ${l('mission.threat')} ${l(`difficulty.${level.difficulty}` as MessageKey)}</span></div><button class="button primary deploy-button" data-action="deploy">${l('mission.deploy')} ${icon('arrow')}</button>`;
    this.el('record-level-label').textContent = t('mission.labelName', {id: id.toString().padStart(2, '0'), name: t(levelKey(id, 'name'))});
    if (sound) this.audio.play('select'); void this.loadRecords();
  }
  private async loadRecords() {
    const request = ++this.leaderboardRequest;
    this.el('leaderboard').innerHTML = `<div class="records-loading"><span class="spinner"></span> ${l('records.loading')}</div>`;
    try {
      const { entries } = await api.leaderboard(this.selected);
      if (request !== this.leaderboardRequest) return; this.renderRecords(entries || []);
    } catch (error) {
      if (request !== this.leaderboardRequest) return;
      this.el('leaderboard').innerHTML = `<div class="record-empty"><p>${errorMarkup(error)}</p><button class="text-button" data-action="retry-records">${l('records.retry')} ${icon('restart')}</button></div>`;
    }
  }
  private renderRecords(entries: ScoreRecord[]) {
    if (!entries.length) {
      this.el('leaderboard').innerHTML = `<div class="record-empty"><div class="empty-medal">${icon('trophy')}</div><h3>${l('records.emptyTitle')}</h3><p>${l('records.emptyDescription')}</p><div class="empty-lines"><span></span><span></span><span></span></div></div>`; return;
    }
    this.el('leaderboard').innerHTML = `<table class="record-table"><caption class="sr-only">${l('records.caption')}</caption><thead><tr><th scope="col">#</th><th scope="col">${l('records.playerID')}</th><th scope="col">${l('records.score')}</th><th scope="col">${l('records.time')}</th></tr></thead><tbody>${entries.slice(0, 10).map((record, index) => `<tr class="${index === 0 ? 'first-record' : ''}"><td>${(index + 1).toString().padStart(2, '0')}</td><th scope="row" title="${escapeHTML(record.id)}">${escapeHTML(record.id)}<span class="record-difficulty">${isDifficulty(record.difficulty) ? `${l(`ai.${record.difficulty}`)}${record.scoreMultiplier ? ` <span>${multiplierText(record.scoreMultiplier)}</span>` : ''}` : l('records.legacy')}</span></th><td>${number(record.score)}</td><td>${clock(record.durationMs, true)}</td></tr>`).join('')}</tbody></table>`;
  }
  private async start() {
    const level = this.levels.find(item => item.id === this.selected); if (!level) return;
    const selectedProfile = this.difficulties.find(profile => profile.id === this.difficulty); if (!selectedProfile) return;
    this.cleanup(); const generation = ++this.generation;
    this.showRunDifficulty(selectedProfile);
    this.result = undefined; this.state = undefined; this.seq = 0; this.lastBullet = -1; this.inGame = true; this.submitting = false;
    document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog => dialog.close());
    this.el('home-view').hidden = true; this.el('game-view').hidden = false; document.body.classList.add('playing');
    this.el('game-mission-number').textContent = t('mission.numberOf', {id: level.id.toString().padStart(2, '0')});
    this.el('game-mission-name').textContent = t(levelKey(level.id, 'name'));
    this.el('game-connection').innerHTML = `<i></i> ${l('game.connecting')}`; this.el('game-connection').classList.remove('online');
    this.el('arena-loading').hidden = false; this.el('arena-loading').innerHTML = `<span class="spinner"></span><strong>${l('game.deploying')}</strong>${l('game.establishing')}`;
    this.el('hud-score').textContent = '000000'; this.el('hud-enemies').textContent = String(level.enemyCount); this.el('hud-lives').textContent = '03'; this.el('hud-time').textContent = '00:00'; this.el('hud-base').textContent = '—';
    try { this.renderer = new GameRenderer(this.el<HTMLCanvasElement>('arena'), level); } catch (error) { this.connectionError(error); return; }
    window.scrollTo({ top: 0, behavior: 'instant' }); this.audio.unlock();
    try {
      const room = await api.room(level.id, selectedProfile.id);
      if (generation !== this.generation || !this.inGame) return;
      this.showRunDifficulty(room);
      const url = new URL(room.wsUrl, location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(url); this.socket = socket;
      this.handshakeTimeout = window.setTimeout(() => { if (generation === this.generation && !this.state) this.connectionError(new LocalizedError('error.connectionTimeout')); }, 12_000);
      socket.addEventListener('message', event => {
        if (generation !== this.generation) return;
        try {
          const message = JSON.parse(event.data) as ServerMessage;
          if (message.type === 'welcome') {
            this.showRunDifficulty(message);
            window.clearTimeout(this.handshakeTimeout); this.el('arena-loading').hidden = true;
            this.el('game-connection').innerHTML = `<i></i> ${l('game.live')}`; this.el('game-connection').classList.add('online');
            this.acceptState(message.state); this.focusGame(); this.interval = window.setInterval(() => this.sendInput(), 50);
          } else if (message.type === 'state') this.acceptState(message.state);
          else if (message.type === 'finished') this.finished(message.result);
          else if (message.type === 'error') this.connectionError(serverError(503, message));
        } catch { this.connectionError(new LocalizedError('error.invalidUpdate')); }
      });
      socket.addEventListener('close', () => { if (generation === this.generation && this.inGame && !this.result) this.connectionError(new LocalizedError('error.disconnected')); });
      socket.addEventListener('error', () => { if (generation === this.generation && this.inGame && !this.result) this.connectionError(new LocalizedError('error.connection')); });
    } catch (error) { if (generation === this.generation) this.connectionError(error); }
  }
  private acceptState(state: State) {
    if (this.result) return;
    if (this.state && (state.kills > this.state.kills || state.lives < this.state.lives)) this.audio.play('hit');
    const newest = Math.max(-1, ...(state.bullets || []).filter(bullet => bullet.owner === 'player').map(bullet => bullet.id));
    if (newest > this.lastBullet && this.state) this.audio.play('shoot');
    this.lastBullet = Math.max(newest, this.lastBullet); this.state = state; this.renderer?.push(state);
    this.el('hud-score').textContent = state.score.toString().padStart(6, '0'); this.el('hud-enemies').textContent = state.enemiesRemaining.toString().padStart(2, '0');
    this.el('hud-lives').textContent = Math.max(0, state.lives).toString().padStart(2, '0'); this.el('hud-time').textContent = clock(state.timeMs);
    this.el('hud-base').innerHTML = Array.from({ length: state.base.maxHp }, (_, i) => `<i class="${i < state.base.hp ? 'intact' : ''}"></i>`).join('');
    this.el('hud-base').setAttribute('aria-label', t('game.baseHP', {hp: state.base.hp, maxHp: state.base.maxHp}));
  }
  private currentInput(): Omit<Input, 'seq' | 'type'> {
    return this.controls.read();
  }
  private sendInput(force = false) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.state || this.result || this.state.status !== 'playing') return;
    const input = this.currentInput(); const signature = `${input.move}:${input.fire}`;
    if (force && signature === this.lastInput) return;
    this.lastInput = signature; this.renderer?.setInput(input.move);
    this.socket.send(JSON.stringify({ type: 'input', seq: ++this.seq, ...input } satisfies Input));
  }
  private clearInput() {
    this.controls.clear(); document.querySelectorAll('.pressed').forEach(button => button.classList.remove('pressed')); this.sendInput(true);
  }
  private finished(result: RunResult) {
    if (this.result) return;
    this.clearInput(); this.result = result; window.clearInterval(this.interval);
    this.el('game-connection').innerHTML = `<i></i> ${l(result.status === 'won' ? 'game.complete' : 'game.ended')}`; this.audio.play(result.status === 'won' ? 'win' : 'lose');
    let rememberedID = ''; try { rememberedID = localStorage.getItem('bcr-player-id') || ''; } catch { /* Optional preference. */ }
    const won = result.status === 'won';
    const description: MessageKey = won ? 'result.winDescription' : this.state?.base.hp === 0 ? 'result.baseLost' : this.state && this.state.lives > 0 ? 'result.timeout' : 'result.livesLost';
    this.el('result-dialog').innerHTML = `<div class="dialog-language">${languageSelect()}</div><div class="result-emblem ${won ? '' : 'defeat'}">${icon(won ? 'shield' : 'target')}</div><div class="eyebrow">${l('mission.label', {id: result.levelId.toString().padStart(2, '0')})} / ${l(won ? 'game.complete' : 'game.ended')}</div><h2>${l(won ? 'result.winTitle' : 'result.loseTitle')}<span class="accent">${won ? '.' : '?'}</span></h2><p class="result-description">${l(description)}</p><div class="result-difficulty">${l('ai.label')} <strong>${l(`ai.${result.difficulty}`)}</strong><span class="score-multiplier">${multiplierText(result.scoreMultiplier)}</span></div><div class="result-stats"><div>${l('result.score')}<strong>${number(result.score)}</strong></div><div>${l('result.time')}<strong>${clock(result.durationMs, true)}</strong></div><div>${l('result.kills')}<strong>${result.kills}</strong></div></div><p class="score-breakdown">${l('result.scoreBreakdown', {baseScore: number(result.baseScore), multiplier: result.scoreMultiplier.toFixed(1), score: number(result.score)})}<small>${l('result.scoreRounding')}</small></p>${won && result.completionToken ? `<form id="record-form" novalidate><label for="player-id">${l('result.mark')}${l('result.optional')}</label><div class="id-input-row"><input id="player-id" name="id" maxlength="128" data-i18n-placeholder="result.idPlaceholder" placeholder="${escapeHTML(t('result.idPlaceholder'))}" autocomplete="nickname" value="${escapeHTML(rememberedID)}" aria-describedby="id-help submission-status" required><button class="button primary" type="submit" id="submit-record">${l('result.submit')} ${icon('arrow')}</button></div><p id="id-help" class="input-help">${l('result.idHelp')}</p><p id="submission-status" class="submission-status" role="status"></p></form>` : ''}<div class="result-actions"><button class="button secondary" data-action="return-home">${l(won ? 'result.skip' : 'game.missionSelect')}</button><button class="text-button" data-action="retry">${icon('restart')} ${l('result.again')}</button></div>`;
    this.refreshLocale();
    document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog => dialog.close()); this.el<HTMLDialogElement>('result-dialog').showModal();
  }
  private async submit() {
    if (!this.result?.completionToken || this.submitting) return;
    const input = this.el<HTMLInputElement>('player-id'), id = normalizePlayerID(input.value), status = this.el('submission-status');
    if (id === null) {
      message(status, 'error.invalidID'); status.className = 'submission-status error'; input.focus(); return;
    }
    this.submitting = true; const button = this.el<HTMLButtonElement>('submit-record'); button.disabled = true; message(button, 'result.saving'); delete status.dataset.i18n; delete status.dataset.i18nParams; status.textContent = ''; status.className = 'submission-status';
    const resultAtStart = this.result;
    try {
      const response = await api.submit(resultAtStart.completionToken!, id);
      if (this.result !== resultAtStart) return;
      try { localStorage.setItem('bcr-player-id', id); } catch { /* Optional preference. */ }
      message(status, response.recorded ? 'result.rank' : 'result.unranked', {rank: response.rank ?? ''});
      status.className = 'submission-status success'; input.disabled = true; message(button, response.recorded ? 'result.recorded' : 'result.verified'); resultAtStart.completionToken = undefined;
      message(this.el('result-dialog').querySelector<HTMLElement>('[data-action="return-home"]')!, 'game.missionSelect');
    } catch (error) {
      if (this.result !== resultAtStart) return;
      if (error instanceof LocalizedError) message(status, error.key, error.params); else message(status, 'error.generic');
      status.className = 'submission-status error'; button.disabled = false; message(button, 'records.retry');
    } finally { if (this.result === resultAtStart) this.submitting = false; }
  }
  private connectionError(error: unknown) {
    if (this.result) return;
    this.cleanup(); this.el('game-connection').innerHTML = `<i></i> ${l('game.offline')}`; this.el('game-connection').classList.remove('online'); this.el('arena-loading').hidden = false;
    this.el('arena-loading').innerHTML = `${icon('target')}<strong>${l('game.interrupted')}</strong>${errorMarkup(error)}<button class="button primary" data-action="retry">${l('campaign.reconnect')} ${icon('restart')}</button><button class="text-button" data-action="return-home">${l('game.missionSelect')}</button>`;
  }
  private askLeave() {
    if (!this.inGame) return;
    if (this.result || !this.state) { this.home(); return; }
    this.clearInput(); this.el<HTMLDialogElement>('leave-dialog').showModal();
  }
  private home() {
    this.cleanup(); this.result = undefined; this.state = undefined; this.inGame = false;
    document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog => dialog.close());
    this.el('game-view').hidden = true; this.el('home-view').hidden = false; document.body.classList.remove('playing'); void this.loadRecords();
    requestAnimationFrame(() => this.el('missions').scrollIntoView({ behavior: 'instant' }));
  }
  private cleanup() {
    this.clearInput(); ++this.generation; window.clearInterval(this.interval); window.clearTimeout(this.handshakeTimeout);
    this.socket?.close(1000, 'Client leaving mission'); this.socket = undefined; this.renderer?.destroy(); this.renderer = undefined; this.lastInput = '';
  }
  private focusGame() { if (this.inGame && !document.querySelector('dialog[open]')) this.el('arena').focus({ preventScroll: true }); }
  private updateSound() {
    document.querySelectorAll<HTMLButtonElement>('.sound-toggle').forEach(button => {
      button.innerHTML = icon(this.audio.enabled ? 'sound' : 'mute'); button.setAttribute('aria-label', t(this.audio.enabled ? 'sound.mute' : 'sound.enable')); button.title = t(this.audio.enabled ? 'sound.mute' : 'sound.enable'); button.setAttribute('aria-pressed', String(this.audio.enabled));
    });
  }
}
new BattleCity();
