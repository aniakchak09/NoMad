import { Component, OnInit } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { Observable, of } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import { Itinerary, ItineraryService } from '../../services/itinerary.service';

@Component({
  selector: 'app-favorites',
  templateUrl: './favorites.components.html',
  styleUrls: ['./favorites.components.scss']
})
export class FavoritesComponent implements OnInit {
  favorites$: Observable<Itinerary[]> = of([]);

  constructor(
    private afAuth: AngularFireAuth,
    private db: AngularFireDatabase,
    private itineraryService: ItineraryService
  ) {}

  ngOnInit(): void {
    this.favorites$ = this.afAuth.authState.pipe(
      switchMap(user => {
        if (!user) return of([]);
        return this.db.list<Itinerary>('itineraries', ref => 
          ref.orderByChild('userId').equalTo(user.uid)
        ).valueChanges().pipe(
          // Filter client-side for favorites
          map(list => list.filter(item => item.isFavorite === true))
        );
      })
    );
  }

  // Reuse the same toggle and delete methods as HomeComponent
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

    async onToggleFavorite(item: Itinerary) {
        try {
            await this.itineraryService.toggleFavorite(item.itineraryId, !!item.isFavorite);
        } catch (error) {
            console.error('Error toggling favorite:', error);
        }
    }
}