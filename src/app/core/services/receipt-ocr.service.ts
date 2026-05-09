import { Injectable } from '@angular/core';
import { PlatformLocation } from '@angular/common';

/**
 * Runs Tesseract in the browser on an image file.
 * Worker + WASM are served from `/assets/vendor/tesseract` (see `angular.json`) so OCR works
 * when public CDNs for the worker are blocked; English traineddata may still load once from `langPath`.
 */
@Injectable({ providedIn: 'root' })
export class ReceiptOcrService {
  constructor(private readonly platformLocation: PlatformLocation) {}

  async recognizeReceiptImage(file: File): Promise<string> {
    const nameOk = /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(file.name);
    if (!file.type.startsWith('image/') && !nameOk) {
      return '';
    }
    const { workerPath, corePath } = this.getTesseractStaticUrls();
    const { recognize } = await import('tesseract.js');
    const {
      data: { text }
    } = await recognize(file, 'eng', {
      workerPath,
      corePath,
      logger: () => undefined
    });
    return (text || '').trim();
  }

  private getTesseractStaticUrls(): { workerPath: string; corePath: string } {
    if (typeof window === 'undefined') {
      return { workerPath: '', corePath: '' };
    }
    const appBase = new URL(this.platformLocation.getBaseHrefFromDOM(), window.location.origin).href;
    const workerPath = new URL('assets/vendor/tesseract/worker.min.js', appBase).href;
    const corePath = new URL('assets/vendor/tesseract/', appBase).href;
    return { workerPath, corePath };
  }
}
