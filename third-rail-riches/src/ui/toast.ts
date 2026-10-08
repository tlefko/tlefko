import gsap from 'gsap';

let host: HTMLElement | null = null;

/** Small message at the top of the screen; fades after a few seconds. */
export function toast(message: string, secs = 3.6) {
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  host.appendChild(el);
  gsap.fromTo(el, { y: -14, opacity: 0, filter: 'blur(6px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.36, ease: 'swift' });
  gsap.to(el, { opacity: 0, y: -8, duration: 0.3, delay: secs, ease: 'ui', onComplete: () => el.remove() });
}
