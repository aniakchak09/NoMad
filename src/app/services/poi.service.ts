import { Injectable } from '@angular/core';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import type Graphic from '@arcgis/core/Graphic';

export interface Poi {
  poiId: string;
  cityId: string;
  name: string;
  attractionType: string;
  rating?: number;
  priceRange?: string;     // ex: "40-60"
  openingHours?: string;
  estimatedTime?: number;
  latitude?: number;
  longitude?: number;
}

@Injectable({ providedIn: 'root' })
export class PoiService {
  // ✅ pune aici URL-ul layer-ului POIs (Sublayer corect: /0 sau /1)
  private readonly POI_LAYER_URL =
    'https://services7.arcgis.com/wvTaT0ejNMyTL183/arcgis/rest/services/POIs/FeatureServer/0';

  private readonly layer: FeatureLayer;

  constructor() {
    this.layer = new FeatureLayer({
      url: this.POI_LAYER_URL,
      outFields: ['*']
    });
  }

  /**
   * Ia POI-urile pentru un oras, optional filtrate pe categorii.
   * ATENTIE: categories sunt valori din attractionType (ex: "government", etc.)
   */
  async getPoisByCity(cityId: string, categories?: string[]): Promise<Poi[]> {
    const query = this.layer.createQuery();
    
    // 2. IMPORTANT: Change this to true so we get the location data
    query.returnGeometry = true; 

    query.where = this.buildWhereClause(cityId, categories);
    query.outFields = ['*']; // Or explicitly add your fields

    const res = await this.layer.queryFeatures(query);

    return (res.features || []).map((g: Graphic) => {
      const attr = g.attributes as Poi;
      // 3. Map the ArcGIS geometry to our Poi object
      return {
        ...attr,
        latitude: (g.geometry as any)?.y,
        longitude: (g.geometry as any)?.x
      };
    }).filter(p => !!p?.poiId);
  }

  /**
   * Helper pentru UI: dintr-o lista de poiId -> lista de nume.
   * Foloseste lista de POI-uri deja incarcata (din ArcGIS).
   */
  mapPoiIdsToNames(poiIds: string[], pois: Poi[]): string[] {
    const dict = new Map(pois.map(p => [p.poiId, p.name]));
    return (poiIds || []).map(id => dict.get(id) ?? id);
  }

  private buildWhereClause(cityId: string, categories?: string[]): string {
    const safeCity = this.escapeQuotes(cityId);
    const base = `cityId='${safeCity}'`;

    if (!categories || categories.length === 0) return base;

    const list = categories
      .map(s => String(s).trim())
      .filter(Boolean)
      .map(v => `'${this.escapeQuotes(v)}'`)
      .join(',');

    // ✅ campul real pt categorie
    return `${base} AND attractionType IN (${list})`;
  }

  private escapeQuotes(value: string): string {
    return String(value).replace(/'/g, "''");
  }

  /**
 * Fallback: Use ArcGIS Geocoding if coordinates are missing in the layer
 */
  async getCoordinatesFallback(poiName: string, city: string): Promise<{lat: number, lon: number} | null> {
    const apiKey = 'YOUR_ARCGIS_API_KEY';
    const url = `https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?address=${encodeURIComponent(poiName + ',' + city)}&f=json&token=${apiKey}&maxLocations=1`;

    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.candidates && data.candidates.length > 0) {
        return {
          lat: data.candidates[0].location.y,
          lon: data.candidates[0].location.x
        };
      }
    } catch (e) {
      console.error("Geocoding failed", e);
    }
    return null;
  }
}
