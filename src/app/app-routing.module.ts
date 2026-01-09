import { ExtraOptions, RouterModule, Routes } from '@angular/router';
import { NgModule } from '@angular/core';
import { MapComponent } from './pages/map/map.component';
import { HomeComponent } from './pages/home/home.component';
import { ItineraryTestComponent } from './pages/itinerary-test/itinerary-test.component';
import { LoginComponent } from './pages/login/login.component';
import { AuthGuard } from './guards/auth.guard';
import { FavoritesComponent } from './pages/favorites/favorites.components';
import { StatisticsComponent } from './pages/statistics/statistics.component';


export const routes: Routes = [
  { 
    path: 'home', 
    component: HomeComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'map', 
    component: MapComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'itinerary-test', 
    component: ItineraryTestComponent, 
    canActivate: [AuthGuard] 
  },
  {
    path: 'favorites',
    component: FavoritesComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'statistics',
    component: StatisticsComponent,
    canActivate: [AuthGuard]
  },
  { 
    path: '', redirectTo: '/login', 
    pathMatch: 'full' 
  },
  { 
    path: 'login', 
    component: LoginComponent
  },
  // fallback
  { 
    path: '**', 
    redirectTo: '/login' 
  }
];

const config: ExtraOptions = {
  useHash: false,
};

@NgModule({
  imports: [RouterModule.forRoot(routes, config)],
  exports: [RouterModule],
})
export class AppRoutingModule {
}
