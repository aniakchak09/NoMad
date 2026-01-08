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
    const targetMaxMinutes = 9 * 60; // 9 hours of activity limit per day
    let remainingBudget = prefs.budget || Infinity; 
    
    // Sort by rating as the primary priority
    let availablePois = [...pois].sort((a, b) => (Number(b.rating || 0) - Number(a.rating || 0)));
    const schedule: Record<string, ScheduledActivity[]> = {};

    for (let d = 1; d <= days; d++) {
      const dayKey = `day${d}`;
      const daySchedule: ScheduledActivity[] = [];
      let currentTime = 9 * 60; // Start at 09:00 AM
      let lastPoi: Poi | null = null;

      // Use a manual loop to allow skipping items that don't fit constraints
      for (let i = 0; i < availablePois.length; i++) {
        const poi = availablePois[i];
        
        // Use the POI's estimatedTime (default to 60 min if missing)
        const visitDuration = poi.estimatedTime || 60; 
        const cost = this.getPoiCost(poi);
        const travelTime = lastPoi ? this.calculateTravelTime(lastPoi, poi) : 0;

        console.log(`Evaluating POI: ${poi.name}, Cost: ${cost}, Visit Duration: ${visitDuration}, Travel Time: ${travelTime}`);
        
        const start = currentTime + travelTime;
        const end = start + visitDuration;

        // --- VALIDATION GATES ---
        
        // 1. Budget Check
        if (cost > remainingBudget) continue; 

        // 2. Opening Hours Check (uses the string from your POI data)
        if (!this.isWithinOpeningHours(start, end, poi.openingHours)) continue;

        // 3. Daily Time Check (Total day length)
        if ((end - (9 * 60)) > targetMaxMinutes) continue;

        // --- SUCCESS: ADD TO SCHEDULE ---
        if (daySchedule.length > 0) {
          daySchedule[daySchedule.length - 1].travelTimeAfter = travelTime;
        }

        daySchedule.push({
          poiName: poi.name,
          startTime: this.minutesToTime(start),
          endTime: this.minutesToTime(end)
        });

        // Update state for the next iteration
        currentTime = end;
        remainingBudget -= cost;
        lastPoi = poi;
        
        // Remove this POI so it's not reused on another day
        availablePois.splice(i, 1);
        i--; 

        // Check against user's max activities limit
        if (prefs.maxActivitiesPerDay && daySchedule.length >= prefs.maxActivitiesPerDay) break;
      }
      schedule[dayKey] = daySchedule;
    }
    return schedule;
  }

  // Converts "HH:mm" to total minutes from midnight
  private timeToMinutes(timeStr: string): number {
    const [hrs, mins] = timeStr.split(':').map(Number);
    return (hrs * 60) + mins;
  }

  // Checks if the activity fits within the POI's opening hours
  private isWithinOpeningHours(start: number, end: number, hoursStr?: string): boolean {
    if (!hoursStr || !hoursStr.includes('-')) return true; // Assume 24/7 if format is missing
    
    const [openStr, closeStr] = hoursStr.split('-');
    const openTime = this.timeToMinutes(openStr.trim());
    const closeTime = this.timeToMinutes(closeStr.trim());

    return start >= openTime && end <= closeTime;
  }

  // Logic extracted from your estimateTotalCost method
  private getPoiCost(p: Poi): number {
    const priceRangeString = String(p.priceRange || '').trim();
    if (!priceRangeString.includes('-')) {
      return parseFloat(priceRangeString) || 0;
    }
    const parts = priceRangeString.split('-');
    const lower = parseFloat(parts[0]) || 0;
    const upper = parseFloat(parts[1]) || 0;
    return (lower + upper) / 2;
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
