import { Pipe, PipeTransform } from '@angular/core';
import { I18nService } from 'src/app/core/services/i18n.service';

@Pipe({ name: 'translate', pure: false })
export class TranslatePipe implements PipeTransform {
  constructor(private readonly i18n: I18nService) {}

  transform(key: string, params?: Record<string, string | number>): string {
    return this.i18n.instant(key, params);
  }
}
