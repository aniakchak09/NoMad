import { Component, OnInit } from "@angular/core";
import { AngularFireAuth } from "@angular/fire/compat/auth";
import { AngularFireDatabase } from "@angular/fire/compat/database";
import { Observable, of } from "rxjs";
import { switchMap } from "rxjs/operators";
import { Itinerary, ItineraryService } from "../../services/itinerary.service";

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
    userName: string = 'Traveler';
    itineraries$: Observable<Itinerary[]> = of([]);

    constructor(
        private afAuth: AngularFireAuth,
        private db: AngularFireDatabase,
        private itineraryService: ItineraryService
    ) {}

    ngOnInit(): void {
        this.itineraries$ = this.afAuth.authState.pipe(
            switchMap(user => {
                if (user) {
                    // Set user name from Firebase Auth profile
                    this.userName = user.displayName || user.email?.split('@')[0] || 'Traveler';
                    
                    // Fetch itineraries matching current user's ID
                    return this.db.list<Itinerary>('itineraries', ref => 
                        ref.orderByChild('userId').equalTo(user.uid)
                    ).valueChanges();
                }
                return of([]);
            })
        );
    }

    async deleteItem(itineraryId: string) {
        if (confirm('Are you sure you want to delete this itinerary?')) {
            try {
                await this.itineraryService.deleteItinerary(itineraryId);
                console.log('Itinerary deleted:', itineraryId);
            } catch (error) {
                console.error('Error deleting itinerary:', error);
            }
        }
    }
}