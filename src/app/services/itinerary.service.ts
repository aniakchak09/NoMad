import { Injectable } from '@angular/core';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { Poi } from './poi.service';

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
  isFavorite?: boolean;
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
      ? pois.filter(p => categories.includes(p.attractionType))
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
  const total = poisUsed.reduce((sum, p) => {
    // 1. Get the price range string, e.g., "10-20", "0-0", "30-80"
    const priceRangeString = String(p.priceRange || '').trim();

    // 2. Check if the string contains a dash to signify a range
    if (!priceRangeString.includes('-')) {
        // Handle cases where the format might not be a range (e.g., just "0" or empty)
        const singlePrice = parseFloat(priceRangeString);
        return sum + (isNaN(singlePrice) ? 0 : singlePrice);
    }

    // 3. Split the range string into two values
    const parts = priceRangeString.split('-');
    
    const lowerBound = parseFloat(parts[0]);
    const upperBound = parseFloat(parts[1]);

    let estimatedCost = 0;

    // 4. Calculate the average cost (midpoint of the range)
    if (!isNaN(lowerBound) && !isNaN(upperBound)) {
      estimatedCost = (lowerBound + upperBound) / 2;
    } 
    // Handle the case "0-0" correctly, where lowerBound=0, upperBound=0, cost=0.
    // Handle cases where the range is malformed (e.g., "10-") - they default to 0.

    return sum + estimatedCost;
  }, 0);

  // Round the final total cost
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

  async deleteItinerary(itineraryId: string): Promise<void> {
    if (!itineraryId) return;
    return this.db.object(`itineraries/${itineraryId}`).remove();
  }

  async toggleFavorite(itineraryId: string, currentState: boolean): Promise<void> {
    return this.db.object(`itineraries/${itineraryId}`).update({
      isFavorite: !currentState
    });
  }
}
