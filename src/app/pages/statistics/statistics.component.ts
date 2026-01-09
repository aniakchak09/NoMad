import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { Itinerary } from '../../services/itinerary.service';
import { Poi, PoiService } from '../../services/poi.service';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

interface TravelerStats {
  totalItineraries: number;
  totalDays: number;
  totalCost: number;
  avgCostPerDay: number;
  categoryDistribution: { [key: string]: number };
  travelerType: string;
  travelerDescription: string;
}

@Component({
  selector: 'app-statistics',
  templateUrl: './statistics.component.html',
  styleUrls: ['./statistics.component.scss']
})
export class StatisticsComponent implements OnInit, AfterViewInit {
  @ViewChild('categoryChart') categoryChartRef: ElementRef<HTMLCanvasElement>;
  @ViewChild('budgetChart') budgetChartRef: ElementRef<HTMLCanvasElement>;

  stats$: Observable<TravelerStats | null> = of(null);
  userName: string = 'Traveler';
  loading: boolean = true;

  categoryChart: Chart;
  budgetChart: Chart;
  categoryChartData: any[] = [];
  budgetChartData: any[] = [];

  // Color scheme for categories
  categoryColors: { [key: string]: string } = {
    'museum': '#eaa61a',
    'architecture': '#904fae',
    'culture': '#8335a8',
    'district': '#ffd700',
    'government': '#0079c1',
    'landmark': '#e79c00',
    'leisure': '#6a3f00',
    'park': '#73c970'
  };

  private statsData: TravelerStats | null = null;

  constructor(
    private afAuth: AngularFireAuth,
    private db: AngularFireDatabase,
    private poiService: PoiService
  ) {}

  ngOnInit(): void {
    this.loadStatistics();
  }

  ngAfterViewInit(): void {
    // Charts will be created after data loads
  }

  loadStatistics(): void {
    this.stats$ = this.afAuth.authState.pipe(
      switchMap(user => {
        if (user) {
          this.userName = user.displayName || user.email?.split('@')[0] || 'Traveler';
          
          return this.db.list<Itinerary>('itineraries', ref => 
            ref.orderByChild('userId').equalTo(user.uid)
          ).valueChanges().pipe(
            switchMap(async itineraries => {
              this.loading = false;
              if (itineraries.length === 0) return null;
              
              const stats = await this.calculateStats(itineraries);
              this.statsData = stats;
              
              // Create charts after data is ready
              setTimeout(() => this.createCharts(), 100);
              
              return stats;
            })
          );
        }
        this.loading = false;
        return of(null);
      })
    );
  }

  async calculateStats(itineraries: Itinerary[]): Promise<TravelerStats> {
    const totalItineraries = itineraries.length;
    const totalDays = itineraries.reduce((sum, it) => sum + it.days, 0);
    const totalCost = itineraries.reduce((sum, it) => sum + it.totalCost, 0);
    const avgCostPerDay = totalDays > 0 ? Math.round(totalCost / totalDays) : 0;

    const allPoiIds = new Set<string>();
    itineraries.forEach(it => {
    if (it.schedule) {
      Object.values(it.schedule).forEach(dayPois => {
        // Corecție aici: verificăm dacă poiId este string sau obiect
        dayPois.forEach((item: any) => {
          const id = typeof item === 'string' ? item : item.poiId;
          if (id) allPoiIds.add(id);
        });
      });
    }
  });

    const allPois = await this.poiService.getPoisByCity('bucharest');
    const poiMap = new Map(allPois.map(p => [p.poiId, p]));

    const categoryDistribution: { [key: string]: number } = {};
    
    allPoiIds.forEach(poiId => {
      const poi = poiMap.get(poiId);
      if (poi && poi.attractionType) {
        categoryDistribution[poi.attractionType] = 
          (categoryDistribution[poi.attractionType] || 0) + 1;
      }
    });

    const { travelerType, travelerDescription } = this.determineTravelerType(
      categoryDistribution, 
      avgCostPerDay, 
      totalDays
    );

    this.prepareCategoryChartData(categoryDistribution);
    this.prepareBudgetChartData(itineraries);

    return {
      totalItineraries,
      totalDays,
      totalCost,
      avgCostPerDay,
      categoryDistribution,
      travelerType,
      travelerDescription
    };
  }

  determineTravelerType(
    categories: { [key: string]: number }, 
    avgCost: number, 
    totalDays: number
  ): { travelerType: string; travelerDescription: string } {
    const sortedCategories = Object.entries(categories)
      .sort(([, a], [, b]) => b - a);
    
    const totalActivities = Object.values(categories).reduce((a, b) => a + b, 0);

    if ((categories['museum'] || 0) + (categories['culture'] || 0) > totalActivities * 0.5) {
      return {
        travelerType: 'Iubitor de Cultură',
        travelerDescription: 'Ești pasionat de muzee, galerii și evenimente culturale. Îți place să înveți și să descoperi istoria locurilor pe care le vizitezi.'
      };
    }

    if ((categories['park'] || 0) > totalActivities * 0.3) {
      return {
        travelerType: 'Iubitor de Natură',
        travelerDescription: 'Preferă spațiile verzi și parcurile. Îți place să te relaxezi în aer liber și să te bucuri de frumusețea naturii.'
      };
    }

    if (avgCost < 30) {
      return {
        travelerType: 'Călător Economic',
        travelerDescription: 'Știi să te bucuri de destinații fără să spargi banca. Găsești cele mai bune oferte și atracții gratuite.'
      };
    }

    if (avgCost > 80) {
      return {
        travelerType: 'Călător Premium',
        travelerDescription: 'Îți place luxul și experiențele de calitate. Investești în cele mai bune atracții și servicii.'
      };
    }

    if ((categories['architecture'] || 0) + (categories['landmark'] || 0) > totalActivities * 0.4) {
      return {
        travelerType: 'Pasionat de Arhitectură',
        travelerDescription: 'Ești fascinat de clădiri istorice și monumente iconice. Îți place să admiri frumusețea arhitecturală a orașelor.'
      };
    }

    if (totalDays > 15) {
      return {
        travelerType: 'Explorer pe Termen Lung',
        travelerDescription: 'Îți place să petreci timp suficient în fiecare destinație pentru a o cunoaște în profunzime.'
      };
    }

    return {
      travelerType: 'Călător Echilibrat',
      travelerDescription: 'Îți place să explorezi diverse tipuri de atracții și să ai un mix echilibrat de experiențe în călătoriile tale.'
    };
  }

  prepareCategoryChartData(categories: { [key: string]: number }): void {
    this.categoryChartData = Object.entries(categories)
      .map(([name, value]) => ({
        name: this.translateCategory(name),
        value,
        color: this.categoryColors[name] || '#999999'
      }))
      .sort((a, b) => b.value - a.value);
  }

  prepareBudgetChartData(itineraries: Itinerary[]): void {
    const budgetRanges = {
      'Foarte Ieftin (< 100 Lei)': 0,
      'Ieftin (100-300 Lei)': 0,
      'Mediu (300-500 Lei)': 0,
      'Scump (500-1000 Lei)': 0,
      'Foarte Scump (> 1000 Lei)': 0
    };

    itineraries.forEach(it => {
      const cost = it.totalCost;
      if (cost < 100) budgetRanges['Foarte Ieftin (< 100 Lei)']++;
      else if (cost < 300) budgetRanges['Ieftin (100-300 Lei)']++;
      else if (cost < 500) budgetRanges['Mediu (300-500 Lei)']++;
      else if (cost < 1000) budgetRanges['Scump (500-1000 Lei)']++;
      else budgetRanges['Foarte Scump (> 1000 Lei)']++;
    });

    const colors = ['#73c970', '#eaa61a', '#0079c1', '#e79c00', '#e74c3c'];
    this.budgetChartData = Object.entries(budgetRanges)
      .filter(([, value]) => value > 0)
      .map(([name, value], index) => ({
        name,
        value,
        color: colors[index % colors.length]
      }));
  }

  createCharts(): void {
    if (!this.categoryChartRef || !this.budgetChartRef) return;

    this.createCategoryChart();
    this.createBudgetChart();
  }

  createCategoryChart(): void {
    if (this.categoryChart) {
      this.categoryChart.destroy();
    }

    const ctx = this.categoryChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'pie',
      data: {
        labels: this.categoryChartData.map(d => d.name),
        datasets: [{
          data: this.categoryChartData.map(d => d.value),
          backgroundColor: this.categoryChartData.map(d => d.color),
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 15,
              font: { size: 12 }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0) as number;
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${value} (${percentage}%)`;
              }
            }
          }
        }
      }
    };

    this.categoryChart = new Chart(ctx, config);
  }

  createBudgetChart(): void {
    if (this.budgetChart) {
      this.budgetChart.destroy();
    }

    if (this.budgetChartData.length === 0) return;

    const ctx = this.budgetChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'doughnut',
      data: {
        labels: this.budgetChartData.map(d => d.name),
        datasets: [{
          data: this.budgetChartData.map(d => d.value),
          backgroundColor: this.budgetChartData.map(d => d.color),
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 15,
              font: { size: 12 }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                return `${label}: ${value} itinerarii`;
              }
            }
          }
        }
      }
    };

    this.budgetChart = new Chart(ctx, config);
  }

  translateCategory(category: string): string {
    const translations: { [key: string]: string } = {
      'museum': 'Muzee',
      'architecture': 'Arhitectură',
      'culture': 'Cultură',
      'district': 'Districte',
      'government': 'Guvern',
      'landmark': 'Landmark-uri',
      'leisure': 'Timp Liber',
      'park': 'Parcuri'
    };
    return translations[category] || category;
  }

  getTotalVisits(): number {
  return this.categoryChartData.reduce((sum, item) => sum + item.value, 0);
}

  ngOnDestroy(): void {
    if (this.categoryChart) this.categoryChart.destroy();
    if (this.budgetChart) this.budgetChart.destroy();
  }
}