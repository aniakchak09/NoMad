import { Injectable } from '@angular/core';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { Poi } from './poi.service';

export interface Preferences {
  days: number;
  categories: string[];          // ex: ["museum", "restaurant"]
  budget?: number;               // opțional
  maxActivitiesPerDay?: number;  // opțional, default 3
}

export interface ScheduledActivity {
  poiName: string;
  startTime: string;
  endTime: string;
  travelTimeAfter?: number;
  note?: string;
}

export interface Itinerary {
  itineraryId: string;
  userId: string;
  cityId: string;
  days: number;
  totalCost: number;
  schedule: Record<string, ScheduledActivity[]>; // day1 -> [poiId, ...]
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
  generateSchedule(pois: Poi[], prefs: Preferences): Record<string, ScheduledActivity[]> {
    const days = prefs.days || 1;
    const targetMinMinutes = 7 * 60; // 7 hours
    const targetMaxMinutes = 9 * 60; // 9 hours
    const visitDuration = 90;        // 1.5 hours per POI
    const breakDuration = 45;        // 45 min break

    let availablePois = [...pois].sort((a, b) => (Number(b.rating || 0) - Number(a.rating || 0)));
    const schedule: Record<string, ScheduledActivity[]> = {};

    for (let d = 1; d <= days; d++) {
      const dayKey = `day${d}`;
      const daySchedule: ScheduledActivity[] = [];
      let currentTime = 9 * 60; // Start at 09:00 AM
      let lastPoi: Poi | null = null;
      let breakTaken = false;
      let totalDayMinutes = 0;

      while (totalDayMinutes + visitDuration <= targetMaxMinutes && availablePois.length > 0) {
        // 1. Find the nearest POI to the current location to minimize travel
        const nextIndex = this.findNearestPoiIndex(lastPoi, availablePois);
        const currentPoi = availablePois.splice(nextIndex, 1)[0];
        
        const travelTime = lastPoi ? this.calculateTravelTime(lastPoi, currentPoi) : 0;
        
        // Update previous activity with travel time
        if (daySchedule.length > 0) {
          daySchedule[daySchedule.length - 1].travelTimeAfter = travelTime;
        }

        const start = currentTime + travelTime;
        const end = start + visitDuration;

        daySchedule.push({
          poiName: currentPoi.name,
          startTime: this.minutesToTime(start),
          endTime: this.minutesToTime(end)
        });

        currentTime = end;
        totalDayMinutes = currentTime - (9 * 60);
        lastPoi = currentPoi;

        // 2. Insert a break if it's past noon and we haven't rested
        if (!breakTaken && totalDayMinutes > (4 * 60)) {
          currentTime = Math.min(currentTime + breakDuration, 18 * 60); // cap at 18:00
          daySchedule[daySchedule.length - 1].note = "Lunch Break / Rest";
          breakTaken = true;
        }

        // Stop if adding another POI would exceed our 9-hour limit
        if (totalDayMinutes + visitDuration > targetMaxMinutes) break;
      }
      schedule[dayKey] = daySchedule;
    }
    return schedule;
  }

  private mercatorToLatLon(x: number, y: number): { lat: number; lon: number } {
    const R = 6378137; // Earth radius in meters

    const lon = (x / R) * (180 / Math.PI);
    const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);

    return { lat, lon };
  }

  // Helper: Haversine distance for city travel estimation
  private calculateTravelTime(p1: Poi, p2: Poi): number {
    const c1 = this.mercatorToLatLon(Number(p1.longitude), Number(p1.latitude));
    const c2 = this.mercatorToLatLon(Number(p2.longitude), Number(p2.latitude));

    const lat1 = c1.lat;
    const lon1 = c1.lon;
    const lat2 = c2.lat;
    const lon2 = c2.lon;

    if (
      !isFinite(lat1) || !isFinite(lon1) ||
      !isFinite(lat2) || !isFinite(lon2)
    ) {
      return 20; // safe fallback
    }
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const travel = Math.round(dist * 4.5 + 10); // to be adjusted
    return Math.min(travel, 90);
  }

  private findNearestPoiIndex(current: Poi | null, list: Poi[]): number {
    if (!current) return 0;
    let nearestIdx = 0;
    let minDist = Infinity;
    list.forEach((p, i) => {
      const d = Math.abs(p.latitude! - current.latitude!) + Math.abs(p.longitude! - current.longitude!);
      if (d < minDist) { minDist = d; nearestIdx = i; }
    });
    return nearestIdx;
  }

  private minutesToTime(m: number): string {
    const totalMinutesInDay = m % 1440; 
    const h = Math.floor(totalMinutesInDay / 60);
    const mins = totalMinutesInDay % 60;
    return `${h.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
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
  async saveItinerary(
    userId: string, 
    cityId: string, 
    days: number, 
    totalCost: number, 
    schedule: Record<string, ScheduledActivity[]> // Updated type
  ): Promise<string> {
    const itineraryId = this.db.createPushId();
    const itinerary: Itinerary = { itineraryId, userId, cityId, days, totalCost, schedule };
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
