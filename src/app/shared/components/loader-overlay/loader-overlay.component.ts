import { Component } from '@angular/core';
import { LoaderService } from 'src/app/core/services/loader.service';

@Component({
  selector: 'app-loader-overlay',
  templateUrl: './loader-overlay.component.html',
  styleUrls: ['./loader-overlay.component.css']
})
export class LoaderOverlayComponent {
  constructor(public readonly loaderService: LoaderService) {}
}
