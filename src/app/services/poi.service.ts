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
    query.returnGeometry = false;

    // ✅ filtre pe campurile reale din layer
    query.where = this.buildWhereClause(cityId, categories);

    // ✅ campurile pe care le folosim in aplicatie
    query.outFields = [
      'poiId',
      'cityId',
      'name',
      'attractionType',
      'rating',
      'priceRange',
      'openingHours',
      'estimatedTime'
    ];

    const res = await this.layer.queryFeatures(query);

    return (res.features || [])
      .map((g: Graphic) => g.attributes as Poi)
      .filter(p => !!p?.poiId);
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
}
