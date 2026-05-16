import { Directive, OnDestroy, OnInit } from '@angular/core';
import { lockBodyScroll, unlockBodyScroll } from 'src/app/core/utils/modal-scroll-lock';

/** Attach to modal backdrop / overlay roots — prevents background scroll while open. */
@Directive({
  selector: '[appModalScrollLock]'
})
export class ModalScrollLockDirective implements OnInit, OnDestroy {
  ngOnInit(): void {
    lockBodyScroll();
  }

  ngOnDestroy(): void {
    unlockBodyScroll();
  }
}
