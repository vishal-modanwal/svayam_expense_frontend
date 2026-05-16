/** Reference-counted body scroll lock while modals / overlays are open. */
let lockCount = 0;
let savedOverflow = '';
let savedPaddingRight = '';
let savedScrollTop = 0;

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (lockCount === 0) {
    const body = document.body;
    const docEl = document.documentElement;
    savedScrollTop = window.scrollY || docEl.scrollTop || 0;
    savedOverflow = body.style.overflow;
    savedPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - docEl.clientWidth;
    body.classList.add('modal-scroll-locked');
    docEl.classList.add('modal-scroll-locked');
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
    body.style.position = 'fixed';
    body.style.top = `-${savedScrollTop}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
  }
  lockCount++;
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined') {
    return;
  }
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) {
    return;
  }
  const body = document.body;
  const docEl = document.documentElement;
  body.classList.remove('modal-scroll-locked');
  docEl.classList.remove('modal-scroll-locked');
  body.style.overflow = savedOverflow;
  body.style.paddingRight = savedPaddingRight;
  body.style.position = '';
  body.style.top = '';
  body.style.left = '';
  body.style.right = '';
  body.style.width = '';
  window.scrollTo(0, savedScrollTop);
}
