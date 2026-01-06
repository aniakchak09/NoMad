import { Component } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { PoiService, Poi } from '../../services/poi.service'; // Added Poi import
import { ItineraryService, Preferences } from '../../services/itinerary.service';
import { AuthService } from '../../services/auth.service';

// Define a type for the schedule using POI names for saving/display
interface ScheduleWithNames {
  [day: string]: string[]; // e.g., 'day1': ['Museum Name', 'Restaurant Name']
}

@Component({
  selector: 'app-itinerary-test',
  templateUrl: './itinerary-test.component.html',
  styleUrls: ['./itinerary-test.component.scss']
})
export class ItineraryTestComponent {
  status = 'Idle';
  lastItineraryId: string | null = null;

  // setează valori reale (trebuie să existe în layer-ul ArcGIS)
  cityId = 'bucuresti';
  categoriesText = 'park,museum'; // separate prin virgula
  days = 3;

  constructor(
    private afAuth: AngularFireAuth,
    private poiService: PoiService,
    private itineraryService: ItineraryService,
    private authService: AuthService
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

      // 4) genereaza schedule - Presupunem că returnează un obiect de tip { [day: string]: string[] } unde array-ul conține POI IDs.
      const scheduleWithPoiIds = this.itineraryService.generateSchedule(pois, prefs);
      console.log('[TEST] scheduleWithPoiIds:', scheduleWithPoiIds);

      // --- Modificarea 1: Schimbarea schedule-ului pentru a conține nume de POI ---

      // Construim o hartă de la poiId la POI-ul complet pentru căutare ușoară
      const poiMap = new Map<string, Poi>(pois.map(poi => [poi.poiId, poi]));

      const scheduleWithNames: ScheduleWithNames = {};
      const usedPoiIds = new Set<string>();

      for (const day in scheduleWithPoiIds) {
          const poiIdsForDay = scheduleWithPoiIds[day];
          const poiNamesForDay: string[] = [];

          for (const poiId of poiIdsForDay) {
              const poi = poiMap.get(poiId);
              if (poi) {
                  // Adăugăm numele în schedule-ul nou
                  poiNamesForDay.push(poi.name);
                  // Ținem evidența POI-urilor folosite
                  usedPoiIds.add(poiId);
              } else {
                  console.warn(`[TEST] POI cu ID-ul ${poiId} nu a fost găsit în lista inițială.`);
              }
          }
          scheduleWithNames[day] = poiNamesForDay;
      }

      // 5) calculeaza cost (optional)

      // --- Modificarea 2: Asigurăm că `usedPois` sunt POI-urile complete folosite pentru calculul costului ---
      const usedPois = Array.from(usedPoiIds).map(id => poiMap.get(id)).filter((p): p is Poi => p !== undefined);

      const totalCost = this.itineraryService.estimateTotalCost(usedPois);
      console.log('[TEST] totalCost:', totalCost);

      // 6) salveaza in Firebase - Salvăm noul schedule cu nume
      const itineraryId = await this.itineraryService.saveItinerary(
        uid,
        this.cityId,
        prefs.days,
        totalCost,
        scheduleWithNames // Folosim schedule-ul cu nume
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
