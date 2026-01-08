import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router'; // Import Router
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { PoiService, Poi } from '../../services/poi.service';
import { ItineraryService, Preferences } from '../../services/itinerary.service';

@Component({
  selector: 'app-itinerary-test',
  templateUrl: './itinerary-test.component.html',
  styleUrls: ['./itinerary-test.component.scss']
})
export class ItineraryTestComponent implements OnInit {
  status = 'Idle';
  days = 3;
  
  // New structured fields
  city = 'bucuresti';
  availableCities = [
    { id: 'bucuresti', name: 'București' },
    { id: 'london', name: 'London' },
    { id: 'paris', name: 'Paris' }
  ];

  selectedCategories: string[] = [];
  availableCategories = [
    { id: 'park', name: 'Parks', selected: false },
    { id: 'museum', name: 'Museums', selected: false },
    { id: 'architecture', name: 'Architecture', selected: false },
    { id: 'culture', name: 'Cultural Sites', selected: false },
    { id: 'district', name: 'Districts', selected: false },
    { id: 'government', name: 'Government Buildings', selected: false },
    { id: 'landmark', name: 'Landmarks', selected: false },
    { id: 'leisure', name: 'Leisure Spots', selected: false }
  ];

  constructor(
    private afAuth: AngularFireAuth,
    private poiService: PoiService,
    private itineraryService: ItineraryService,
    private router: Router // Inject Router
  ) {}

  ngOnInit(): void {}

  // 1. Define the private backing field to store the data
  private _maxDailyBudget = 50;

  // 2. Define the Getter (Reads the value)
  get maxDailyBudget(): number {
    return this._maxDailyBudget;
  }

  // 3. Define the Setter (Updates the value from the slider)
  set maxDailyBudget(value: number) {
    this._maxDailyBudget = value;
  }

  // 4. Define the Total Budget computed property
  get totalBudget(): number {
    return this._maxDailyBudget * this.days;
  }

  updateCategories(cat: any) {
    if (cat.selected) {
      this.selectedCategories.push(cat.id);
    } else {
      const index = this.selectedCategories.indexOf(cat.id);
      if (index > -1) {
        this.selectedCategories.splice(index, 1);
      }
    }
  }

  async runTest(): Promise<void> {
    this.status = 'Generating...';

    try {
      const user = await this.afAuth.currentUser;
      if (!user?.uid) {
        this.status = 'ERROR: Please log in first.';
        return;
      }

      const prefs: Preferences = {
        days: Number(this.days || 1),
        categories: this.selectedCategories,
        budget: this.maxDailyBudget * this.days, // Total budget calculation
        maxActivitiesPerDay: 3
      };

      // Fetch POIs using the city dropdown value
      const pois = await this.poiService.getPoisByCity(this.city, prefs.categories);

      if (!pois.length) {
        this.status = 'ERROR: No locations found for these criteria.';
        return;
      }

      const scheduleWithPoiIds = this.itineraryService.generateSchedule(pois, prefs);
      const usedPoiIds = new Set<string>();

      Object.values(scheduleWithPoiIds).forEach(dayActivities => {
        dayActivities.forEach(act => {
          // Find the original POI object by name to get its priceRange
          const poi = pois.find(p => p.name === act.poiName);
          if (poi) usedPoiIds.add(poi.poiId);
        });
      });

      const usedPois = pois.filter(p => usedPoiIds.has(p.poiId));
      const totalCost = this.itineraryService.estimateTotalCost(usedPois);

      await this.itineraryService.saveItinerary(
        user.uid,
        this.city,
        prefs.days,
        totalCost,
        scheduleWithPoiIds
      );

      this.status = 'Done!';
      
      // Redirect to home after a brief delay so the user sees "Done!"
      setTimeout(() => {
        this.router.navigate(['/home']);
      }, 1000);

    } catch (err) {
      console.error(err);
      this.status = 'ERROR: Generation failed.';
    }
  }
}