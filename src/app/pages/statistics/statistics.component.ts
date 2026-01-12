import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { Observable, of, forkJoin } from 'rxjs';
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
    console.log('ngAfterViewInit called');
    console.log('categoryChartRef:', this.categoryChartRef);
    console.log('budgetChartRef:', this.budgetChartRef);
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
              
              // --- LOGGING NOU PENTRU ULTIMUL ITINERARIU ---
              // Luăm ultimul element din listă (cel mai recent)
              const lastItinerary = itineraries[itineraries.length - 1];
              
              console.log('🔰 === ULTIMUL ITINERARIU CREAT (RAW DATA) === 🔰');
              // Afișăm obiectul interactiv
              console.log(lastItinerary);
              // Afișăm și ca text complet pentru a vedea structura exactă (JSON)
              console.log(JSON.stringify(lastItinerary, null, 2));
              console.log('--------------------------------------------------');
              // ---------------------------------------------
              
              const stats = await this.calculateStats(itineraries);
              this.statsData = stats;
              
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
    console.log('=== CALCULATE STATS CALLED ===');
    console.log('Total itineraries:', itineraries.length);
    console.log('Itineraries:', itineraries);
    
    // DEBUGGING - verificăm primul itinerariu în detaliu
    if (itineraries.length > 0) {
      const firstIt = itineraries[0];
      console.log('FIRST ITINERARY DETAILS:');
      console.log('  itineraryId:', firstIt.itineraryId);
      console.log('  cityId:', firstIt.cityId);
      console.log('  days:', firstIt.days);
      console.log('  schedule:', firstIt.schedule);
      console.log('  schedule type:', typeof firstIt.schedule);
      if (firstIt.schedule) {
        console.log('  schedule keys:', Object.keys(firstIt.schedule));
        const firstDayKey = Object.keys(firstIt.schedule)[0];
        console.log('  first day key:', firstDayKey);
        console.log('  first day value:', firstIt.schedule[firstDayKey]);
      }
    }
    
    const totalItineraries = itineraries.length;
    const totalDays = itineraries.reduce((sum, it) => sum + it.days, 0);
    const totalCost = itineraries.reduce((sum, it) => sum + it.totalCost, 0);
    const avgCostPerDay = totalDays > 0 ? Math.round(totalCost / totalDays) : 0;

    // Colectăm toate cityId-urile unice din itinerarii
    const cityIds = new Set<string>();
    const allPoiIds: string[] = [];
    
    console.log('=== EXTRACTING POIs FROM ITINERARIES ===');
    
    itineraries.forEach((it, index) => {
      // Adăugăm cityId-ul
      if (it.cityId) {
        cityIds.add(it.cityId.toLowerCase());
      }
      
      // Colectăm POI-urile
      if (it.schedule) {
        Object.values(it.schedule).forEach((dayPois: any) => {
          // Asigurăm că avem un array
          const poisArray = Array.isArray(dayPois) ? dayPois : Object.values(dayPois);
          
          poisArray.forEach((item: any) => {
            // AICI ERA PROBLEMA: Trebuie să verificăm și 'poiName'
            let extractId = null;

            if (typeof item === 'string') {
                extractId = item;
            } else {
                // Ordinea priorităților: poiId -> poiName -> name
                extractId = item.poiId || item.poiName || item.name;
            }

            if (extractId) {
              allPoiIds.push(extractId);
            } else {
                console.warn('Nu am putut extrage numele din item:', item);
            }
          });
        });
      }
    });

    console.log('City IDs found:', Array.from(cityIds));
    console.log('POI IDs found:', Array.from(allPoiIds));

    // Încărcăm POI-urile pentru toate orașele
    const allPois: Poi[] = [];
    
    try {
      // Obținem POI-uri pentru fiecare oraș unic (folosim direct cityIds-urile)
      // Valorile din baza de date sunt: 'bucuresti', 'paris', 'london' (lowercase)
      const uniqueCities = Array.from(cityIds);

      console.log('Loading POIs for cities:', uniqueCities);

      for (const cityId of uniqueCities) {
        try {
          const cityPois = await this.poiService.getPoisByCity(cityId);
          allPois.push(...cityPois);
          console.log(`Loaded ${cityPois.length} POIs for ${cityId}`);
        } catch (error) {
          console.error(`Error loading POIs for ${cityId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error loading POIs:', error);
    }

    console.log('Total POIs loaded:', allPois.length);
    
    // Debug: să vedem cum arată un POI
    if (allPois.length > 0) {
      console.log('Sample POI structure:', allPois[0]);
      console.log('Sample POI keys:', Object.keys(allPois[0]));
    }

    // Creăm două map-uri: unul cu poiId și unul cu name
    const poiMapById = new Map(allPois.map(p => [p.poiId, p]));
    const poiMapByName = new Map(allPois.map(p => [p.name, p]));

    const categoryDistribution: { [key: string]: number } = {};
    const notFoundPois: string[] = [];
    
    console.log('Processing POI IDs...');

    // Funcție helper pentru a elimina diacriticele (ex: â -> a)
    const normalizeString = (str: string) => 
      str.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    allPoiIds.forEach(poiId => {
      const normalizedSearch = normalizeString(poiId);

      // 1. Încercăm match direct în Map-uri
      let poi = poiMapById.get(poiId) || poiMapByName.get(poiId);
      
      // 2. Dacă nu am găsit, căutăm după numele normalizat (fără diacritice)
      if (!poi) {
        poi = allPois.find(p => {
          const normalizedPoiName = normalizeString(p.name);
          return normalizedPoiName === normalizedSearch || 
                normalizedPoiName.includes(normalizedSearch) ||
                normalizedSearch.includes(normalizedPoiName);
        });
      }
      
      if (poi) {
        const type = poi.attractionType;
        if (type) {
          // Deoarece allPoiIds este acum Array, aici se va aduna frecvența reală
          categoryDistribution[type] = (categoryDistribution[type] || 0) + 1;
          console.log('✓ Found POI:', poiId, '→', type);
        } else {
          console.warn('⚠ POI fără attractionType:', poiId, poi);
        }
      } else {
        console.error('✗ POI NOT FOUND:', poiId);
        notFoundPois.push(poiId);
      }
    });
    
    if (notFoundPois.length > 0) {
      console.warn('=== POI-uri negăsite în baza de date ===');
      console.warn('Total POI-uri negăsite:', notFoundPois.length);
      console.warn('Lista:', notFoundPois);
    }

    console.log('Category distribution:', categoryDistribution);

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

    if (totalActivities === 0) {
      return {
        travelerType: 'Începător',
        travelerDescription: 'Încă explorezi și descoperi ce tipuri de atracții îți plac.'
      };
    }

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
    
    console.log('Category chart data:', this.categoryChartData);
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
    console.log('=== CREATE CHARTS CALLED ===');
    console.log('categoryChartRef exists:', !!this.categoryChartRef);
    console.log('budgetChartRef exists:', !!this.budgetChartRef);
    console.log('categoryChartData length:', this.categoryChartData.length);
    console.log('categoryChartData:', this.categoryChartData);
    
    if (!this.categoryChartRef || !this.budgetChartRef) {
      console.warn('Chart refs not available yet');
      return;
    }

    if (this.categoryChartData.length === 0) {
      console.warn('No category data available for chart');
      return;
    }

    this.createCategoryChart();
    this.createBudgetChart();
  }

  createCategoryChart(): void {
    if (this.categoryChart) {
      this.categoryChart.destroy();
    }

    if (!this.categoryChartRef?.nativeElement) {
      console.error('Category chart canvas not found');
      return;
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
    console.log('Category chart created successfully');
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