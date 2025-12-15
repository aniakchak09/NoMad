import { Component } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { PoiService } from '../../services/poi.service';
import { ItineraryService, Preferences } from '../../services/itinerary.service';

@Component({
  selector: 'app-itinerary-test',
  templateUrl: './itinerary-test.component.html',
  styleUrls: ['./itinerary-test.component.scss']
})
export class ItineraryTestComponent {
  status = 'Idle';
  lastItineraryId: string | null = null;

  // setează valori reale (trebuie să existe în layer-ul ArcGIS)
  cityId = 'city1';
  categoriesText = 'restaurant,museum'; // separate prin virgula
  days = 3;

  constructor(
    private afAuth: AngularFireAuth,
    private poiService: PoiService,
    private itineraryService: ItineraryService
  ) {}

  async runTest(): Promise<void> {
    this.status = 'Running...';
    this.lastItineraryId = null;

    try {
      // 1) user trebuie sa fie logat (ca sa avem uid)
      const user = await this.afAuth.currentUser;
      if (!user?.uid) {
        this.status = 'ERROR: Nu esti logat (nu am UID).';
        return;
      }

      const uid = user.uid;

      // 2) preferinte de test
      const categories = this.categoriesText
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const prefs: Preferences = {
        days: Number(this.days || 1),
        categories,
        maxActivitiesPerDay: 3
      };

      // 3) ia POI-uri din ArcGIS
      const pois = await this.poiService.getPoisByCity(this.cityId, prefs.categories);
      console.log('[TEST] POIs from ArcGIS:', pois);

      if (!pois.length) {
        this.status = `ERROR: 0 POI-uri pentru cityId="${this.cityId}" si categories=[${categories.join(', ')}].`;
        return;
      }

      // 4) genereaza schedule
      const schedule = this.itineraryService.generateSchedule(pois, prefs);
      console.log('[TEST] schedule:', schedule);

      // 5) calculeaza cost (optional)
      const usedPoiIds = new Set(Object.values(schedule).reduce<string[]>((acc, arr) => acc.concat(arr), []));
      const usedPois = pois.filter(p => usedPoiIds.has(p.poiId));
      const totalCost = this.itineraryService.estimateTotalCost(usedPois);

      // 6) salveaza in Firebase
      const itineraryId = await this.itineraryService.saveItinerary(
        uid,
        this.cityId,
        prefs.days,
        totalCost,
        schedule
      );

      this.lastItineraryId = itineraryId;
      this.status = `OK: Itinerariu salvat cu ID = ${itineraryId}`;
      console.log('[TEST] Saved itineraryId:', itineraryId);

    } catch (err) {
      console.error('[TEST] error:', err);
      this.status = 'ERROR: Vezi consola browserului pentru detalii.';
    }
  }
}
