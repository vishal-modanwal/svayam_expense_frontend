import { Component, OnDestroy, OnInit } from '@angular/core';
import { AnimationOptions } from 'ngx-lottie';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/core/services/auth.service';
import { I18nService } from 'src/app/core/services/i18n.service';

const HERO_TYPE_MS = 88;
const HERO_DELETE_MS = 58;
/** After first word is fully typed — pause before delete. */
const HERO_PAUSE_AFTER_FIRST_WORD_MS = 2000;
/** After second word is fully typed — pause before delete. */
const HERO_PAUSE_AFTER_SECOND_WORD_MS = 2000;
/** After word is fully deleted — pause before typing the next word. */
const HERO_PAUSE_BEFORE_NEXT_WORD_MS = 2000;

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css']
})
export class LandingComponent implements OnInit, OnDestroy {
  readonly lottieOptions: AnimationOptions = {
    path: 'assets/lottie/Business Analytics.json'
  };

  /** Animated tail after static "With " — cycles SvayamExpense ↔ Clarity. */
  heroTypewriter = '';

  private words: string[] = [];
  private wordIndex = 0;
  private charIndex = 0;
  private phase: 'typing' | 'deleting' = 'typing';
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private langSub: Subscription | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly i18n: I18nService
  ) {}

  ngOnInit(): void {
    this.startHeroTypewriter();
    this.langSub = this.i18n.onLanguageChange.subscribe(() => this.startHeroTypewriter());
  }

  ngOnDestroy(): void {
    this.clearHeroTypewriterTimer();
    this.langSub?.unsubscribe();
  }

  isLoggedIn(): boolean {
    return this.auth.isLoggedIn();
  }

  private startHeroTypewriter(): void {
    this.clearHeroTypewriterTimer();
    this.heroTypewriter = '';
    this.wordIndex = 0;
    this.charIndex = 0;
    this.phase = 'typing';
    const w1 = this.i18n.instant('landing.heroTypewriterWord1').trim() || 'SvayamExpense';
    const w2 = this.i18n.instant('landing.heroTypewriterWord2').trim() || 'Clarity';
    this.words = [w1, w2];
    this.scheduleHeroTypewriterStep();
  }

  private clearHeroTypewriterTimer(): void {
    if (this.timeoutId != null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private scheduleHeroTypewriterStep(): void {
    this.clearHeroTypewriterTimer();
    if (this.words.length < 2) {
      return;
    }
    const current = this.wordIndex % 2 === 0 ? this.words[0] : this.words[1];

    if (this.phase === 'typing') {
      if (this.charIndex < current.length) {
        this.charIndex++;
        this.heroTypewriter = current.slice(0, this.charIndex);
        this.timeoutId = setTimeout(() => this.scheduleHeroTypewriterStep(), HERO_TYPE_MS);
      } else {
        const justCompletedIdx = this.wordIndex % 2;
        const holdMs =
          justCompletedIdx === 0 ? HERO_PAUSE_AFTER_FIRST_WORD_MS : HERO_PAUSE_AFTER_SECOND_WORD_MS;
        this.timeoutId = setTimeout(() => {
          this.phase = 'deleting';
          this.scheduleHeroTypewriterStep();
        }, holdMs);
      }
      return;
    }

    if (this.charIndex > 0) {
      this.charIndex--;
      this.heroTypewriter = current.slice(0, this.charIndex);
      this.timeoutId = setTimeout(() => this.scheduleHeroTypewriterStep(), HERO_DELETE_MS);
    } else {
      this.wordIndex++;
      this.phase = 'typing';
      this.timeoutId = setTimeout(() => this.scheduleHeroTypewriterStep(), HERO_PAUSE_BEFORE_NEXT_WORD_MS);
    }
  }
}
