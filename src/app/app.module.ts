import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { HomeComponent } from './pages/home/home.component';
import { MapComponent } from './pages/map/map.component';

// (păstrezi Material/FlexLayout DOAR dacă sunt instalate deja)
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { FlexLayoutModule } from '@angular/flex-layout';

// 🔥 Firebase compat (7.x)
import { AngularFireModule } from '@angular/fire/compat';
import { AngularFireAuthModule } from '@angular/fire/compat/auth';
import { AngularFireDatabaseModule } from '@angular/fire/compat/database';

import { environment } from '../environments/environment';

// manually added
import { FormsModule } from '@angular/forms';
import { ItineraryService } from './services/itinerary.service';
import { ItineraryTestComponent } from './pages/itinerary-test/itinerary-test.component';


@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
    MapComponent,
    ItineraryTestComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,

    MatTabsModule,
    MatButtonModule,
    MatDividerModule,
    MatListModule,
    FlexLayoutModule,

    AngularFireModule.initializeApp(environment.firebase),
    AngularFireAuthModule,
    AngularFireDatabaseModule,
    FormsModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
