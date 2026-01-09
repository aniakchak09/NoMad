import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Event, Router } from '@angular/router';
import { AuthService } from './services/auth.service'; // ajustează calea dacă e altfel
import { FormsModule } from '@angular/forms';
import { ItineraryTestComponent } from './pages/itinerary-test/itinerary-test.component';
import { AngularFireAuth } from '@angular/fire/compat/auth';


interface ITab {
  name: string;
  link: string;

}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {

  tabs: ITab[] = [
    {
      name: 'Home',
      link: '/home'
    },
    {
      name: 'Map',
      link: '/map'
    },
    {
      name: 'Itinerary',
      link: '/itinerary-test'
    },
    {
      name: 'Favorites',
      link: '/favorites'
    }, 
    {
      name: 'Statistics',
      link: '/statistics'
    }
  ];

  activeTab = this.tabs[0].link;
  isLoggedIn = false;

  constructor(
    private router: Router,
    private authService: AuthService,   // 👈 injectăm serviciul
    private afAuth: AngularFireAuth
  ) {
    this.router.events.subscribe((event: Event) => {
      if (event instanceof NavigationEnd) {
        this.activeTab = event.url;
        console.log(event);
      }
    });

    this.afAuth.authState.subscribe(user => {
    this.isLoggedIn = !!user;
    });
  }

  ngOnInit(): void {
    // test simplu: creează un user demo și scrie în DB
    // după ce vezi că merge, poți comenta linia asta
    // this.authService.testSignUp();
  }

  // See app.component.html
  mapLoadedEvent(status: boolean) {
    console.log('The map loaded: ' + status);
  }

  async signOut(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigateByUrl('/login');
  }
}
