import { Injectable } from '@angular/core';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { Poi, PriceRange } from './poi.service';

export interface Preferences {
  days: number;
  categories: string[];          // ex: ["museum", "restaurant"]
  budget?: number;               // opțional
  maxActivitiesPerDay?: number;  // opțional, default 3
}

export interface Itinerary {
  itineraryId: string;
  userId: string;
  cityId: string;
  days: number;
  totalCost: number;
  schedule: Record<string, string[]>; // day1 -> [poiId, ...]
}

@Injectable({
  providedIn: 'root'
})
export class ItineraryService {
  constructor(private db: AngularFireDatabase) {}

  /**
   * Algoritm simplu:
   * - filtrează după categorie (type)
   * - sortează după rating desc (fallback 0)
   * - împarte pe zile, max N activități/zi
   */
  generateSchedule(pois: Poi[], prefs: Preferences): Record<string, string[]> {
    const days = Math.max(1, Math.min(30, Number(prefs.days || 1)));
    const maxPerDay = Math.max(1, Math.min(10, Number(prefs.maxActivitiesPerDay || 3)));
    const categories = (prefs.categories || []).filter(Boolean);

    const filtered = categories.length
      ? pois.filter(p => categories.includes(p.type))
      : [...pois];

    filtered.sort((a, b) => (Number(b.rating || 0) - Number(a.rating || 0)));

    const schedule: Record<string, string[]> = {};

    let idx = 0;
    for (let d = 1; d <= days; d++) {
      const dayKey = `day${d}`;
      const slice = filtered.slice(idx, idx + maxPerDay);
      schedule[dayKey] = slice.map(p => p.poiId);
      idx += maxPerDay;
    }

    return schedule;
  }

  /**
   * Estimare cost simplă (opțională) pe baza priceRange.
   * Poți să o lași 0 dacă nu vrei cost.
   */
  estimateTotalCost(poisUsed: Poi[]): number {
    // mapping simplu: low=25, medium=50, high=100
    const map: Record<string, number> = { low: 25, medium: 50, high: 100 };
    const total = poisUsed.reduce((sum, p) => {
      const key = String((p.priceRange || '')).toLowerCase() as PriceRange;
      return sum + (map[key] ?? 0);
    }, 0);
    return Math.round(total);
  }

  /**
   * Salvează itinerariul în Realtime Database.
   * Returnează itineraryId.
   */
  async saveItinerary(userId: string, cityId: string, days: number, totalCost: number, schedule: Record<string, string[]>): Promise<string> {
    const itineraryId = this.db.createPushId();

    const itinerary: Itinerary = {
      itineraryId,
      userId,
      cityId,
      days,
      totalCost,
      schedule
    };

    await this.db.object(`itineraries/${itineraryId}`).set(itinerary);
    return itineraryId;
  }
}
