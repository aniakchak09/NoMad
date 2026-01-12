import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  Output,
  EventEmitter,
  OnDestroy
} from "@angular/core";

import esri = __esri; // Esri TypeScript Types

// Am eliminat: Config, WebMap, Bookmarks, Expand
import Map from '@arcgis/core/Map'; // Folosim Map
import MapView from '@arcgis/core/views/MapView';

import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Graphic from '@arcgis/core/Graphic';
import Point from '@arcgis/core/geometry/Point';

import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import WebStyleSymbol from '@arcgis/core/symbols/WebStyleSymbol';
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol';
import UniqueValueRenderer from '@arcgis/core/renderers/UniqueValueRenderer';

import FeatureSet from '@arcgis/core/rest/support/FeatureSet';
import RouteParameters from '@arcgis/core/rest/support/RouteParameters';
import * as route from "@arcgis/core/rest/route.js";

import { ActivatedRoute, Router } from '@angular/router';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { PoiService, Poi } from '../../services/poi.service';
import { Itinerary } from '../../services/itinerary.service';
import { take } from 'rxjs/operators';
import esriConfig from "@arcgis/core/config";
import * as webMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils";

@Component({
  selector: "app-map",
  templateUrl: "./map.component.html",
  styleUrls: ["./map.component.scss"]
})
export class MapComponent implements OnInit, OnDestroy {
  @Output() mapLoadedEvent = new EventEmitter<boolean>();

  @ViewChild("mapViewNode", { static: true }) private mapViewEl: ElementRef;

  cityCoordinates: { [key: string]: number[] } = {
    'bucuresti': [26.1025, 44.4268],
    'londra': [-0.1276, 51.5072],
    'paris': [2.3522, 48.8566]
  };

  map: esri.Map;
  view: esri.MapView;
  graphicsLayer: esri.GraphicsLayer;
  graphicsLayerUserPoints: esri.GraphicsLayer;
  graphicsLayerRoutes: esri.GraphicsLayer;
  
  // Am redenumit trailheadsLayer în poiLayer
  poiLayer: esri.FeatureLayer; 

  // Centrul pe București (Long, Lat) și zoom-ul
  zoom = 12; 
  center: Array<number> = [26.1025, 44.4268]; 
  basemap = "arcgis-modern-antique"; // OpenStreetMap, basemap neutru
  //arcgis-navigation , arcgis-nova , osm, 
  loaded = false;
  directionsElement: any;

  // Variabile noi pentru Itinerariu
  activeItinerary: Itinerary | null = null;
  itineraryDays: string[] = [];
  cityPoisCache: Poi[] = []; // Păstrăm POI-urile orașului curent aici
  routeDistance: string = '';
  routeDuration: string = '';

  constructor(
    private route: ActivatedRoute, // Injectează ActivatedRoute
    private router: Router,
    private db: AngularFireDatabase,
    private poiService: PoiService
  ) {}

  ngOnInit() {
    this.initializeMap().then(() => {
      this.loaded = this.view.ready;
      this.mapLoadedEvent.emit(true);

      // ASCULTĂ PARAMETRII URL DUPĂ CE HARTA E GATA
      this.route.queryParams.subscribe(async params => {
        const itineraryId = params['itineraryId'];
        if (itineraryId) {
          await this.loadItineraryAndRoute(itineraryId);
        }
      });
    });
  }

  async initializeMap() {
    try {
      esriConfig.apiKey = "AAPTxy8BH1VEsoebNVZXo8HurFyyZCp13vKIQaE64eR0LW_dLDaVajrDxzCQNd8bgxxU7EF6bsa0OyTDNuKw2VLhbz6M57iJgo7H6gSgJytX4oK8M4tWbTYLNiNefWtKZ2y7qkGo-CczIVKPF9qyDLWFkZb5PT4EOQjVk0wlqYjJLkEArhfYgsKkSEsypEDl8AHCFKb8Oh__CsooklFAk3YaTOOezttyFOcTLO2z_gnnx7g.AT1_xRKMaHTA";

      // 1. Definim Proprietățile Hărții
      const mapProperties: esri.MapProperties = { // Folosim MapProperties
        basemap: this.basemap
      };
      
      // 2. Creăm Harta
      this.map = new Map(mapProperties); // Folosim Map

      this.addFeatureLayers(); // Adaugă layerul tău POI (S11)
      this.addGraphicsLayer(); // Păstrează layerele grafice pentru rutare

      // 3. Creăm View-ul (Afișarea)
      const mapViewProperties = {
        container: this.mapViewEl.nativeElement,
        center: this.center,
        zoom: this.zoom,
        map: this.map
      };
      this.view = new MapView(mapViewProperties);

      // Am eliminat evenimentul 'pointer-move'

      await this.view.when();
      console.log("ArcGIS map loaded");
      
      // Dacă vrei funcționalitatea de rutare, activează-o. Altfel, las-o comentată.
      this.addRouting(); 
      
      return this.view;
    } catch (error: any) {
      // MODIFICARE AICI: Loghează eroarea completă
      console.error("Detaliile erorii de rutare:", error);
      
      // Verifică dacă există un mesaj specific în eroare
      const errorMsg = error.details?.message || error.message || "Eroare necunoscută";
      alert("Error calculating route: " + errorMsg);
    }
  }

  addFeatureLayers() {
    // 1. Definirea Pop-up Template pentru POI (Sarcina S11: Configurarea pop-up-urilor)
    const poiPopupTemplate = {
      title: "{NAME}", 
      content: [
        {
          type: "fields",
          fieldInfos: [
            { fieldName: "attractionType", label: "Categorie" },
            { fieldName: "RATING", label: "Rating (din 5)" },
            { fieldName: "estimatedTime", label: "Timp estimat de vizitare (min)" },
            { fieldName: "priceRange", label: "Interval preț (Lei/Euro)" },
            { fieldName: "openingHours", label: "Program" }
          ]
        }
      ]
    };

    // 2. Creează simbolurile pentru fiecare tip de atracție
    const museumSymbol = new WebStyleSymbol({
      name: "Museum_Large_3",
      styleUrl: "https://cdn.arcgis.com/sharing/rest/content/items/37da62fcdb854f8e8305c79e8b5023dc/data"
    });

    const architectureSymbol = new WebStyleSymbol({
      name: "Industrial Complex_Large_3",
      styleUrl: "https://cdn.arcgis.com/sharing/rest/content/items/37da62fcdb854f8e8305c79e8b5023dc/data"
    });

    const cultureSymbol = new WebStyleSymbol({
      name: "Library_Large_3",
      styleUrl: "https://cdn.arcgis.com/sharing/rest/content/items/37da62fcdb854f8e8305c79e8b5023dc/data"
    });

    const districtSymbol = new WebStyleSymbol({
      name: "Star_Large_3",
      styleUrl: "https://cdn.arcgis.com/sharing/rest/content/items/37da62fcdb854f8e8305c79e8b5023dc/data"
    });

    const governmentSymbol = new WebStyleSymbol({
      name: "City Hall_Large_3",
      styleUrl: "https://cdn.arcgis.com/sharing/rest/content/items/37da62fcdb854f8e8305c79e8b5023dc/data"
    });

    const landmarkSymbol = new WebStyleSymbol({
      name: "Landmark_Large_3",
      styleUrl: "https://cdn.arcgis.com/sharing/rest/content/items/37da62fcdb854f8e8305c79e8b5023dc/data"
    });

    const leisureSymbol = new WebStyleSymbol({
      name: "Coffee Shop_Large_3",
      styleUrl: "https://cdn.arcgis.com/sharing/rest/content/items/37da62fcdb854f8e8305c79e8b5023dc/data"
    });

    const parkSymbol = new WebStyleSymbol({
      name: "Park_Large_3",
      styleUrl: "https://cdn.arcgis.com/sharing/rest/content/items/37da62fcdb854f8e8305c79e8b5023dc/data"
    });

    // 3. Creează simbolul default pentru tipuri necunoscute
    const defaultSymbol = new SimpleMarkerSymbol({
      color: [51, 51, 204],
      size: 8,
      outline: {
        color: [255, 255, 255],
        width: 1
      }
    });

    // 4. Configurează renderer-ul cu toate valorile unice
    const poiRenderer = new UniqueValueRenderer({
      field: "attractionType",
      defaultSymbol: defaultSymbol,
      uniqueValueInfos: [
        {
          value: "museum",
          symbol: museumSymbol
        },
        {
          value: "architecture",
          symbol: architectureSymbol
        },
        {
          value: "culture",
          symbol: cultureSymbol
        },
        {
          value: "district",
          symbol: districtSymbol
        },
        {
          value: "government",
          symbol: governmentSymbol
        },
        {
          value: "landmark",
          symbol: landmarkSymbol
        },
        {
          value: "leisure",
          symbol: leisureSymbol
        },
        {
          value: "park",
          symbol: parkSymbol
        }
      ]
    });

    // 5. Creează Feature Layer-ul tău POI cu renderer-ul
    this.poiLayer = new FeatureLayer({
      url: "https://services7.arcgis.com/wvTaT0ejNMyTL183/arcgis/rest/services/POIs/FeatureServer", 
      outFields: ["*"], 
      title: "POI Layer NoMad",
      popupTemplate: poiPopupTemplate,
      renderer: poiRenderer // Aplică renderer-ul
    });
    
    // 6. Adaugă layerul la hartă
    this.map.add(this.poiLayer);
    
    console.log("POI Feature layer added with custom symbols for all types");
  }

  addGraphicsLayer() {
    this.graphicsLayer = new GraphicsLayer();
    this.map.add(this.graphicsLayer);
    this.graphicsLayerUserPoints = new GraphicsLayer();
    this.map.add(this.graphicsLayerUserPoints);
    this.graphicsLayerRoutes = new GraphicsLayer();
    this.map.add(this.graphicsLayerRoutes);
  }

  addRouting() {
    const routeUrl = "https://route-api.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World";
    this.view.on("click", (event) => {
      this.view.hitTest(event).then((elem: esri.HitTestResult) => {
        if (elem && elem.results && elem.results.length > 0) {
          // ATENȚIE: Am schimbat trailheadsLayer cu poiLayer pentru hitTest
          let point: esri.Point = elem.results.find(e => e.layer === this.poiLayer)?.mapPoint; 
          if (point) {
            console.log("get selected point: ", elem, point);
            if (this.graphicsLayerUserPoints.graphics.length === 0) {
              this.addPoint(point.latitude, point.longitude);
            } else if (this.graphicsLayerUserPoints.graphics.length === 1) {
              this.addPoint(point.latitude, point.longitude);
              // --- FIX AICI ---
              // Trebuie să trimitem lista de grafice (stops) ca al doilea argument
              const currentStops = this.graphicsLayerUserPoints.graphics.toArray();
              this.calculateRoute(routeUrl, currentStops);
              // ----------------
            } else {
              this.removePoints();
            }
          }
        }
      });
    });
  }

  // map.component.ts

  addPoint(lat: number, lng: number): Graphic {
    // FIX 1: Definim explicit SpatialReference la creare
    const point = new Point({
      longitude: Number(lng),
      latitude: Number(lat),
      spatialReference: { wkid: 4326 } // 4326 = WGS84 (Lat/Long standard)
    });

    const simpleMarkerSymbol = {
      type: "simple-marker",
      color: [226, 119, 40],  // Orange
      outline: {
        color: [255, 255, 255], // White
        width: 1
      }
    };

    const pointGraphic = new Graphic({
      geometry: point,
      symbol: simpleMarkerSymbol,
      attributes: { 
        id: "stop_point",
        time: Date.now(),
        Name: "Punct" // ArcGIS Route are nevoie uneori de un nume
      }
    });

    this.graphicsLayerUserPoints.add(pointGraphic);
    
    return pointGraphic;
  }

  goToCity(city: string) {
    const coords = this.cityCoordinates[city];
    if (this.view && coords) {
      this.view.goTo({
        center: coords,
        zoom: 12 // Poți ajusta nivelul de zoom dorit
      }, {
        duration: 1000, // Animația durează 1 secundă
        easing: "ease-in-out" // Efect de accelerare/decelerare
      });
      
      // Opțional: Când schimbi orașul, poți reseta filtrele sau rutele vechi
      // this.clearRouter(); 
    }
  }

  async loadItineraryAndRoute(itineraryId: string) {
    console.log("Loading itinerary route for:", itineraryId);
    
    // 1. Luăm itinerariul din Firebase
    // FIX: Folosim valueChanges() + pipe(take(1)) în loc de .get()
    const itinerary = await this.db.object<Itinerary>(`itineraries/${itineraryId}`)
      .valueChanges()
      .pipe(take(1))
      .toPromise();

    if (!itinerary) return;

    this.activeItinerary = itinerary;
    
    // 2. Setăm zilele disponibile (day1, day2...)
    this.itineraryDays = Object.keys(itinerary.schedule || {}).sort((a, b) => {
        const nA = parseInt(a.replace('day', ''));
        const nB = parseInt(b.replace('day', ''));
        return nA - nB;
    });

    // 3. Mergem la orașul respectiv
    this.goToCity(itinerary.cityId);

    // 4. Încărcăm POI-urile orașului pentru a avea coordonatele (Latitude/Longitude)
    // Avem nevoie de asta pentru că itinerariul are doar Numele, nu și coordonatele
    this.cityPoisCache = await this.poiService.getPoisByCity(itinerary.cityId);

    // 5. Desenăm ruta pentru prima zi
    if (this.itineraryDays.length > 0) {
        this.visualizeDay(this.itineraryDays[0]);
    }
  }

  // Când utilizatorul schimbă ziua din Dropdown
  onDayChange(event: any) {
    const selectedDay = event.target.value;
    this.visualizeDay(selectedDay);
  }

  // Funcția care desenează efectiv ruta
  visualizeDay(dayKey: string) {
    if (!this.activeItinerary || !this.activeItinerary.schedule[dayKey]) return;

    // Curățăm harta
    this.clearRouter();

    const activities = this.activeItinerary.schedule[dayKey];
    
    // --- CALCUL DURATĂ ITINERARIU (MODIFICARE NOUĂ) ---
    if (activities.length > 0) {
        // Luăm ora de start a primei activități
        const firstActivity = activities[0];
        // Luăm ora de final a ultimei activități
        const lastActivity = activities[activities.length - 1];

        const startMins = this.timeToMinutes(firstActivity.startTime);
        const endMins = this.timeToMinutes(lastActivity.endTime);

        const totalDurationMins = endMins - startMins;

        // Formatăm afișarea (ex: 5h 30m)
        const hrs = Math.floor(totalDurationMins / 60);
        const mins = totalDurationMins % 60;
        this.routeDuration = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    }
    // --------------------------------------------------

    const routeUrl = "https://route-api.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World";

    console.log(`Visualizing ${dayKey} with ${activities.length} stops`);

    // ... restul codului (normalizare, loop prin activități, etc.) ...
    
    const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    const stopsForRoute: Graphic[] = [];
    // ... restul funcției rămâne neschimbat până la apelul calculateRoute ...
    
    for (const activity of activities) {
        // ... logica ta de căutare POI ...
         const searchName = normalize(activity.poiName);

        const match = this.cityPoisCache.find(p => {
             const pName = normalize(p.name);
             return pName === searchName || pName.includes(searchName) || searchName.includes(pName);
        });

        if (match) {
            const lat = parseFloat(match.latitude as any);
            const lng = parseFloat(match.longitude as any);

            if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                const graphic = this.addPoint(lat, lng);
                stopsForRoute.push(graphic);
            }
        }
    }

    if (stopsForRoute.length >= 2) {
        this.calculateRoute(routeUrl, stopsForRoute);
    } else if (stopsForRoute.length === 1) {
        // Dacă e un singur punct, nu avem rută, dar avem durata calculată mai sus
        console.log("Doar un punct, durata este timpul de vizitare al acelui punct.");
    }
}



  removePoints() {
    this.graphicsLayerUserPoints.removeAll();
  }

  removeRoutes() {
    this.graphicsLayerRoutes.removeAll();
  }

  // map.component.ts

  // În map.component.ts

// Asigură-te că ai importul acesta sus:
// import * as webMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils";

// Asigură-te că importul este prezent:
// import * as webMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils";

// Transformă "HH:mm" în minute (ex: "09:30" -> 570)
private timeToMinutes(timeStr: string): number {
  const [hrs, mins] = timeStr.split(':').map(Number);
  return (hrs * 60) + mins;
}

async calculateRoute(routeUrl: string, stops: Graphic[]) {
    console.log("=== CALCUL RUTĂ (Auto-Detect System) ===");

    const validGraphics: Graphic[] = [];

    stops.forEach((s, i) => {
        const p = s.geometry as Point;
        
        // 1. Folosim X și Y (valorile brute), nu latitude/longitude
        // deoarece latitude/longitude pot fi blocate/clipite de ArcGIS dacă wkid-ul e setat greșit
        const rawX = p.x;
        const rawY = p.y;

        // Validare de bază (să nu fie 0 sau NaN)
        if (!rawX || !rawY || isNaN(rawX) || isNaN(rawY)) {
            console.warn(`Punctul ${i} invalid:`, rawX, rawY);
            return;
        }

        let finalPoint: Point;

        // 2. DETECȚIE INTELIGENTĂ:
        // Dacă coordonatele sunt uriașe (> 180), înseamnă că sunt DEJA metri (WebMercator).
        // Dacă sunt mici (< 180), înseamnă că sunt grade (WGS84).
        const isAlreadyWebMercator = Math.abs(rawX) > 180 || Math.abs(rawY) > 90;

        if (isAlreadyWebMercator) {
            // CAZ A: Sunt deja metri. Le folosim direct cu wkid: 3857.
            // Nu mai facem nicio conversie.
            finalPoint = new Point({
                x: rawX,
                y: rawY,
                spatialReference: { wkid: 3857 }
            });
            console.log(`Punct ${i}: Detectat WebMercator (Metri). Păstrat original: ${Math.round(rawX)}, ${Math.round(rawY)}`);
        } else {
            // CAZ B: Sunt grade (ex: 44.42). Le convertim.
            const tempPoint = new Point({
                longitude: rawX,
                latitude: rawY,
                spatialReference: { wkid: 4326 }
            });
            finalPoint = webMercatorUtils.geographicToWebMercator(tempPoint) as Point;
            console.log(`Punct ${i}: Detectat GPS (Grade). Convertit la: ${Math.round(finalPoint.x)}, ${Math.round(finalPoint.y)}`);
        }

        // 3. Adăugăm punctul procesat
        validGraphics.push(new Graphic({
            geometry: finalPoint,
            attributes: {
                Name: `Stop_${i + 1}`
            }
        }));
    });

    if (validGraphics.length < 2) {
        alert("Nu sunt suficiente puncte valide pentru rută.");
        return;
    }

    // 4. Parametrii Rutei
    const routeParams = new RouteParameters({
        stops: new FeatureSet({
            features: validGraphics,
            spatialReference: { wkid: 3857 } // Totul este acum standardizat la WebMercator
        }),
        returnDirections: true,
        outSpatialReference: { wkid: 3857 } ,
        directionsLengthUnits: "kilometers"
    });

    try {
        const data = await route.solve(routeUrl, routeParams);
        console.log("SUCCESS! Rută calculată:", data);
        this.displayRoute(data);
    } catch (error: any) {
        console.error("Eroare ArcGIS:", error);
        const msgs = error.details?.messages || [];
        alert("Eroare: " + (msgs.length ? msgs[0] : error.message));
    }
}

  displayRoute(data: any) {
    for (const result of data.routeResults) {
      result.route.symbol = {
        type: "simple-line",
        color: [5, 150, 255],
        width: 3
      };
      this.graphicsLayerRoutes.graphics.add(result.route);
    }
    if (data.routeResults.length > 0) {
      this.showDirections(data.routeResults[0].directions.features);
    } else {
      alert("No directions found");
    }
  }

  clearRouter() {
    if (this.view) {
      // Remove all graphics related to routes
      this.removeRoutes();
      this.removePoints();
      console.log("Route cleared");
      this.view.ui.remove(this.directionsElement);
      this.view.ui.empty("top-right");
      console.log("Directions cleared");
    }
  }

  showDirections(features: any[]) {
    // 1. Creăm elementul container pentru lista de instrucțiuni
    this.directionsElement = document.createElement("ol");
    this.directionsElement.classList.add("esri-widget", "esri-widget--panel", "esri-directions__scroller");
    this.directionsElement.style.marginTop = "0";
    this.directionsElement.style.padding = "15px 15px 15px 30px";
    // Poți limita înălțimea dacă lista e prea lungă
    this.directionsElement.style.maxHeight = "300px"; 
    this.directionsElement.style.overflowY = "auto";

    // Variabilă locală pentru a aduna distanța totală a rutei
    let totalLength = 0;

    // 2. Iterăm prin fiecare pas al rutei
    features.forEach((result, i) => {
      const attributes = result.attributes;
      const length = attributes.length; // Lungimea segmentului

      // Adunăm la total
      totalLength += length;

      // Creăm elementul de listă (<li>) pentru UI
      const direction = document.createElement("li");
      
      // Afișăm textul instrucțiunii (ex: "Turn left") și distanța segmentului
      // Presupunem că ai setat "kilometers" în calculateRoute, deci afișăm "km"
      direction.innerHTML = `${attributes.text} (<small>${length.toFixed(2)} km</small>)`;
      
      this.directionsElement.appendChild(direction);
    });

    // 3. Adăugăm panoul în colțul dreapta-sus al hărții
    this.view.ui.empty("top-right");
    this.view.ui.add(this.directionsElement, "top-right");

    // 4. Actualizăm variabila de clasă pentru a afișa Distanța Totală în interfața HTML
    this.routeDistance = `${totalLength.toFixed(1)} km`;

    // IMPORTANT:
    // Nu modificăm this.routeDuration aici! 
    // Aceasta rămâne cu valoarea calculată în visualizeDay() (diferența dintre orele din itinerariu).
  }

  clearActiveItinerary() {
    this.activeItinerary = null;
    this.clearRouter();
    // Scoatem parametrii din URL fără a da refresh
    this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { itineraryId: null },
        queryParamsHandling: 'merge'
    });
  }

  ngOnDestroy() {
    if (this.view) {
      this.view.container = null;
    }
  }

  // Adaugă aceste proprietăți în clasa MapComponent
selectedType: string = 'all';
selectedRatings: Set<number> = new Set();

// Modifică onFilterChange pentru a salva tipul și a reaplica filtrele
onFilterChange(event: any) {
  this.selectedType = event.target.value;
  this.applyCombinedFilters();
}

// Adaugă metoda pentru schimbarea rating-ului
onRatingChange(event: any) {
  const rating = parseInt(event.target.value);
  if (event.target.checked) {
    this.selectedRatings.add(rating);
  } else {
    this.selectedRatings.delete(rating);
  }
  this.applyCombinedFilters();
}

maxPrice: number = 100;

onPriceChange(event: any) {
  this.maxPrice = parseInt(event.target.value);
  this.applyCombinedFilters();
}

// Metoda centrală care construiește clauza SQL (definitionExpression)
applyCombinedFilters() {
  if (!this.poiLayer) return;

  let conditions: string[] = [];

  // 1. Logica pentru Tip
  if (this.selectedType !== 'all') {
    conditions.push(`attractionType = '${this.selectedType}'`);
  }

  // 2. Logica pentru Rating (Intervale)
  if (this.selectedRatings.size > 0) {
    const ratingQueries = Array.from(this.selectedRatings).map(star => {
      // Definim intervalele: [star - 0.5, star + 0.5)
      // Ex: Pentru 2 stele: RATING >= 1.5 AND RATING < 2.5
      const lowerBound = star - 0.5;
      const upperBound = star + 0.5;
      return `(RATING >= ${lowerBound} AND RATING < ${upperBound})`;
    });
    conditions.push(`(${ratingQueries.join(' OR ')})`);
  }

  // 3. Filtru Preț (Logic pentru string-ul "x-y")
  // Extragem partea de după '-' și o transformăm în număr pentru comparație
  // SQL: CAST(SUBSTRING(priceRange, INSTR(priceRange, '-') + 1) AS INT)
  if (this.maxPrice < 100) {
  let priceConditions: string[] = [];
  
  // Generăm o listă de posibilități pentru prețul maxim stocat în string.
  // De exemplu, dacă maxPrice este 15, căutăm orice obiectiv care are
  // prețul de după cratimă între 0 și 15.
  for (let i = 0; i <= this.maxPrice; i++) {
    // Căutăm formatul "-valoare" la finalul string-ului (ex: "-12")
    priceConditions.push(`priceRange LIKE '%-${i}'`);
  }
  
  if (priceConditions.length > 0) {
    conditions.push(`(${priceConditions.join(' OR ')})`);
  }
}

  // Combinăm toate condițiile cu AND
// --- AICI ADAUGI LOG-UL ---
  const finalExpression = conditions.length > 0 ? conditions.join(' AND ') : "";
  
  console.log("LOG FILTRARE ArcGIS:");
  console.log("Expresia finală trimisă: ", finalExpression);
  console.log("Număr filtre active: ", conditions.length);

  // Aplicăm filtrul pe stratul hărții
  this.poiLayer.definitionExpression = finalExpression;}
}