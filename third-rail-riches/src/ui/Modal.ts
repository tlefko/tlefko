import gsap from 'gsap';
import { ICON } from './icons';
import { t } from '../i18n';
import { installUiArt } from './art';

let openCount = 0;
export const modalState = {
  get open() {
    return openCount > 0;
  },
};

const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Sheet modal: a parchment sheet in a dark wooden frame with brass corners, the title burned into
 * a wooden header, over a dimmed, blurred backdrop. Entrance follows the house motion: the sheet
 * drops in with a little overshoot and settles, children stagger in 70 ms apart; it lifts away on
 * close.
 */
export class Modal {
  el: HTMLElement;
  sheet: HTMLElement;
  body: HTMLElement;
  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault();
      this.close();
    }
  };
  onClose?: () => void;
  private closing = false;

  constructor(title: string, cls = '') {
    installUiArt();
    this.el = document.createElement('div');
    this.el.className = `modal ${cls}`;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', title);
    this.el.innerHTML = `
      <div class="modal-backdrop"></div>
      <section class="modal-sheet" tabindex="-1">
        <i class="mc tl"></i><i class="mc tr"></i><i class="mc bl"></i><i class="mc br"></i>
        <header class="modal-head">
          <h2 class="modal-title">${title}</h2>
          <button class="knob modal-close" type="button" aria-label="${t('close')}">${ICON.close}</button>
        </header>
        <div class="modal-body"></div>
      </section>`;
    this.sheet = this.el.querySelector('.modal-sheet')!;
    this.body = this.el.querySelector('.modal-body')!;
    this.el.querySelector('.modal-backdrop')!.addEventListener('click', () => this.close());
    this.el.querySelector('.modal-close')!.addEventListener('click', () => this.close());
  }

  open() {
    document.getElementById('overlay')!.appendChild(this.el);
    openCount++;
    window.addEventListener('keydown', this.onKey);
    const kids = Array.from(this.body.children) as HTMLElement[];
    gsap.fromTo(this.el.querySelector('.modal-backdrop'), { opacity: 0 }, { opacity: 1, duration: 0.24, ease: 'ui' });
    if (reduced) gsap.fromTo(this.sheet, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    else {
      gsap.fromTo(this.sheet, { y: -26, opacity: 0, scale: 0.96, rotation: -0.6 }, { y: 0, opacity: 1, scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(1.7)', clearProps: 'transform' });
      gsap.fromTo(kids, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.34, ease: 'swift', stagger: 0.07, delay: 0.1, clearProps: 'transform' });
    }
    this.sheet.focus({ preventScroll: true });
  }

  close() {
    if (this.closing) return;
    this.closing = true;
    window.removeEventListener('keydown', this.onKey);
    gsap.to(this.sheet, { y: 18, opacity: 0, scale: 0.98, duration: 0.2, ease: 'power2.in' });
    gsap.to(this.el.querySelector('.modal-backdrop'), {
      opacity: 0,
      duration: 0.22,
      ease: 'ui',
      onComplete: () => {
        this.el.remove();
        openCount = Math.max(0, openCount - 1);
        this.onClose?.();
      },
    });
  }
}
