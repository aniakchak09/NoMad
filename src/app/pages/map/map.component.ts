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

import FeatureSet from '@arcgis/core/rest/support/FeatureSet';
import RouteParameters from '@arcgis/core/rest/support/RouteParameters';
import * as route from "@arcgis/core/rest/route.js";

@Component({
  selector: "app-map",
  templateUrl: "./map.component.html",
  styleUrls: ["./map.component.scss"]
})
export class MapComponent implements OnInit, OnDestroy {
  @Output() mapLoadedEvent = new EventEmitter<boolean>();

  @ViewChild("mapViewNode", { static: true }) private mapViewEl: ElementRef;

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
  basemap = "osm"; // OpenStreetMap, basemap neutru
  loaded = false;
  directionsElement: any;

  constructor() { }

  ngOnInit() {
    this.initializeMap().then(() => {
      this.loaded = this.view.ready;
      this.mapLoadedEvent.emit(true);
    });
  }

  async initializeMap() {
    try {
      // Am eliminat Config.apiKey

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
      // this.addRouting(); 
      
      return this.view;
    } catch (error) {
      console.error("Error loading the map: ", error);
      alert("Error loading the map");
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

    // 2. Creează Feature Layer-ul tău POI (Sarcina S11: Implementare hartă)
    this.poiLayer = new FeatureLayer({
      // ATENȚIE: ÎNLOCUIEȘTE CU URL-ul REAL al Feature Layer-ului tău POIs!
      url: "https://services7.arcgis.com/wvTaT0ejNMyTL183/arcgis/rest/services/POIs/FeatureServer", 
      outFields: ["*"], 
      title: "POI Layer NoMad",
      popupTemplate: poiPopupTemplate // Aplică șablonul
    });
    
    // 3. Adaugă layerul la hartă
    this.map.add(this.poiLayer);

    // Am eliminat layerele vechi de California
    
    console.log("POI Feature layer added");
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
              this.calculateRoute(routeUrl);
            } else {
              this.removePoints();
            }
          }
        }
      });
    });
  }

  addPoint(lat: number, lng: number) {
    let point = new Point({
      longitude: lng,
      latitude: lat
    });

    const simpleMarkerSymbol = {
      type: "simple-marker",
      color: [226, 119, 40],  // Orange
      outline: {
        color: [255, 255, 255], // White
        width: 1
      }
    };

    let pointGraphic: esri.Graphic = new Graphic({
      geometry: point,
      symbol: simpleMarkerSymbol
    });

    this.graphicsLayerUserPoints.add(pointGraphic);
  }

  removePoints() {
    this.graphicsLayerUserPoints.removeAll();
  }

  removeRoutes() {
    this.graphicsLayerRoutes.removeAll();
  }

  async calculateRoute(routeUrl: string) {
    const routeParams = new RouteParameters({
      stops: new FeatureSet({
        features: this.graphicsLayerUserPoints.graphics.toArray()
      }),
      returnDirections: true
    });

    try {
      const data = await route.solve(routeUrl, routeParams);
      this.displayRoute(data);
    } catch (error) {
      console.error("Error calculating route: ", error);
      alert("Error calculating route");
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
    this.directionsElement = document.createElement("ol");
    this.directionsElement.classList.add("esri-widget", "esri-widget--panel", "esri-directions__scroller");
    this.directionsElement.style.marginTop = "0";
    this.directionsElement.style.padding = "15px 15px 15px 30px";

    features.forEach((result, i) => {
      const direction = document.createElement("li");
      direction.innerHTML = `${result.attributes.text} (${result.attributes.length} miles)`;
      this.directionsElement.appendChild(direction);
    });

    this.view.ui.empty("top-right");
    this.view.ui.add(this.directionsElement, "top-right");
  }

  ngOnDestroy() {
    if (this.view) {
      this.view.container = null;
    }
  }
}