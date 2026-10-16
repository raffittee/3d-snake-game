import type { PlayerInput } from './sim/types';

export const isTouchDevice = (): boolean => window.matchMedia('(pointer: coarse)').matches;

export interface InputHandlers {
  /** Escape or P was pressed, the tab lost focus, or pointer lock was lost during play. */
  onPause(): void;
  onMute(): void;
  onEnter(): void;
}

/** Turns keyboard, mouse and touch into one PlayerInput per frame. Knows nothing about game rules. */
export class Input {
  private readonly keys = new Set<string>();
  private joy = { id: -1, sx: 0, sy: 0, x: 0, y: 0 };
  private look = { id: -1, lx: 0, ly: 0 };
  private sprintTouch = false;
  private dragging = false;
  private lockedOnce = false;
  private lookYaw = 0;
  private lookPitch = 0;
  /** Largest single mouse delta in pixels since the last `takePeakDelta()`. Debug panel only. */
  private peakDelta = 0;
  /** Only the game layer knows when input should be acted on. */
  active = false;
  readonly touch = isTouchDevice();

  private readonly stick: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly sprintBtn: HTMLElement;

  constructor(
    private readonly view: HTMLCanvasElement,
    private readonly handlers: InputHandlers,
  ) {
    this.stick = document.getElementById('stick') as HTMLElement;
    this.knob = document.getElementById('knob') as HTMLElement;
    this.sprintBtn = document.getElementById('sprintBtn') as HTMLElement;
    this.bindKeyboard();
    this.bindMouse();
    this.bindTouch();
  }

  /** Called when play stops or starts, so no key or finger stays "held". */
  reset(): void {
    this.keys.clear();
    this.sprintTouch = false;
    this.sprintBtn.classList.remove('on');
    this.joy = { id: -1, sx: 0, sy: 0, x: 0, y: 0 };
    this.look.id = -1;
    this.lookYaw = this.lookPitch = 0;
    this.stick.hidden = true;
    this.dragging = false;
  }

  requestLock(): void {
    if (this.touch || !this.view.requestPointerLock) return;
    try {
      // Raw movement skips OS pointer acceleration, which inflates fast swipes. Not every browser/OS
      // supports it, so fall back to the plain lock.
      const raw = this.view.requestPointerLock({ unadjustedMovement: true }) as unknown as Promise<void> | undefined;
      if (raw && typeof raw.catch === 'function') raw.catch(() => this.requestPlainLock());
    } catch {
      this.requestPlainLock();
    }
  }

  private requestPlainLock(): void {
    try {
      const p = this.view.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    } catch {
      // Pointer lock refused: drag-look still works.
    }
  }

  releaseLock(): void {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {
      // Nothing to release.
    }
  }

  get hasLock(): boolean {
    return document.pointerLockElement === this.view;
  }

  /** Build this frame's input and clear the accumulated look deltas. */
  sample(): PlayerInput {
    const k = this.keys;
    const forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + this.joy.y;
    const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + this.joy.x;
    const input: PlayerInput = {
      forward,
      strafe,
      sprint: k.has('ShiftLeft') || k.has('ShiftRight') || this.sprintTouch,
      turn: (k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0),
      lookYaw: this.lookYaw,
      lookPitch: this.lookPitch,
    };
    this.lookYaw = this.lookPitch = 0;
    return input;
  }

  /** Read and clear the largest single mouse delta seen. */
  takePeakDelta(): number {
    const p = this.peakDelta;
    this.peakDelta = 0;
    return p;
  }

  private addLook(dx: number, dy: number): void {
    this.lookYaw -= dx;
    this.lookPitch -= dy;
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyM') this.handlers.onMute();
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.active && !this.hasLock) this.handlers.onPause();
      if (e.code === 'Enter') this.handlers.onEnter();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.active) this.handlers.onPause();
    });
  }

  private bindMouse(): void {
    const sens = 0.0022;
    document.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      if (this.hasLock || this.dragging) {
        this.peakDelta = Math.max(this.peakDelta, Math.abs(e.movementX), Math.abs(e.movementY));
        this.addLook(e.movementX * sens, e.movementY * sens);
      }
    });
    this.view.addEventListener('mousedown', () => {
      if (!this.active || this.touch) return;
      if (!this.hasLock) {
        this.requestLock();
        this.dragging = true;
      }
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.hasLock) {
        this.lockedOnce = true;
        this.dragging = false;
      } else if (this.active && this.lockedOnce) {
        this.handlers.onPause();
      }
    });
  }

  private bindTouch(): void {
    const stickRadius = 50;
    this.view.addEventListener(
      'touchstart',
      (e) => {
        if (!this.active) return;
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          if (t.clientX < window.innerWidth * 0.45 && this.joy.id === -1) {
            this.joy = { id: t.identifier, sx: t.clientX, sy: t.clientY, x: 0, y: 0 };
            this.stick.style.left = `${t.clientX}px`;
            this.stick.style.top = `${t.clientY}px`;
            this.knob.style.transform = '';
            this.stick.hidden = false;
          } else if (this.look.id === -1) {
            this.look = { id: t.identifier, lx: t.clientX, ly: t.clientY };
          }
        }
      },
      { passive: false },
    );
    this.view.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === this.joy.id) {
            let dx = t.clientX - this.joy.sx;
            let dy = t.clientY - this.joy.sy;
            const m = Math.hypot(dx, dy);
            if (m > stickRadius) {
              dx *= stickRadius / m;
              dy *= stickRadius / m;
            }
            this.joy.x = dx / stickRadius;
            this.joy.y = -dy / stickRadius;
            this.knob.style.transform = `translate(${dx}px,${dy}px)`;
          } else if (t.identifier === this.look.id) {
            this.addLook((t.clientX - this.look.lx) * 0.0055, (t.clientY - this.look.ly) * 0.0055);
            this.look.lx = t.clientX;
            this.look.ly = t.clientY;
          }
        }
      },
      { passive: false },
    );
    const end = (e: TouchEvent): void => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joy.id) {
          this.joy = { id: -1, sx: 0, sy: 0, x: 0, y: 0 };
          this.stick.hidden = true;
        }
        if (t.identifier === this.look.id) this.look.id = -1;
      }
    };
    this.view.addEventListener('touchend', end);
    this.view.addEventListener('touchcancel', end);
    this.sprintBtn.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this.sprintTouch = true;
        this.sprintBtn.classList.add('on');
      },
      { passive: false },
    );
    for (const ev of ['touchend', 'touchcancel']) {
      this.sprintBtn.addEventListener(ev, () => {
        this.sprintTouch = false;
        this.sprintBtn.classList.remove('on');
      });
    }
  }
}
