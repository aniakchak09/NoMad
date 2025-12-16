import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

import esriConfig from "@arcgis/core/config";

esriConfig.apiKey = "AAPTxy8BH1VEsoebNVZXo8HurFyyZCp13vKIQaE64eR0LW_dLDaVajrDxzCQNd8bgxxU7EF6bsa0OyTDNuKw2VLhbz6M57iJgo7H6gSgJytX4oK8M4tWbTYLNiNefWtKZ2y7qkGo-CczIVKPF9qyDLWFkZb5PT4EOQjVk0wlqYjJLkEArhfYgsKkSEsypEDl8AHCFKb8Oh__CsooklFAk3YaTOOezttyFOcTLO2z_gnnx7g.AT1_xRKMaHTA";

if (environment.production) {
  enableProdMode();
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
