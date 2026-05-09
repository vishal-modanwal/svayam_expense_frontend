import { Component } from '@angular/core';
import { AnimationOptions } from 'ngx-lottie';
import { AuthService } from 'src/app/core/services/auth.service';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css']
})
export class LandingComponent {
  readonly lottieOptions: AnimationOptions = {
    path: 'assets/lottie/Business Analytics.json'
  };

  constructor(private readonly auth: AuthService) {}

  isLoggedIn(): boolean {
    return this.auth.isLoggedIn();
  }
}
