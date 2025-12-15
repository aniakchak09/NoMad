import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Event, Router } from '@angular/router';
import { AuthService } from './services/auth.service'; // ajustează calea dacă e altfel

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
    }
  ];

  activeTab = this.tabs[0].link;

  constructor(
    private router: Router,
    private authService: AuthService   // 👈 injectăm serviciul
  ) {
    this.router.events.subscribe((event: Event) => {
      if (event instanceof NavigationEnd) {
        this.activeTab = event.url;
        console.log(event);
      }
    });
  }

  ngOnInit(): void {
    // test simplu: creează un user demo și scrie în DB
    // după ce vezi că merge, poți comenta linia asta
    this.authService.testSignUp();
  }

  // See app.component.html
  mapLoadedEvent(status: boolean) {
    console.log('The map loaded: ' + status);
  }
}
