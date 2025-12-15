import { Injectable } from '@angular/core';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import type Graphic from '@arcgis/core/Graphic';

export type PriceRange = 'low' | 'medium' | 'high' | string;

export interface Poi {
  poiId: string;
  cityId: string;
  name: string;
  type: string;
  rating?: number;
  priceRange?: PriceRange;
  openingHours?: string;
  // opțional: coordonate dacă vreți mai târziu
  // x?: number;
  // y?: number;
}

@Injectable({
  providedIn: 'root'
})
export class PoiService {
  // ✅ pune aici URL-ul layer-ului vostru ArcGIS Online (FeatureServer/0)
  private readonly POI_LAYER_URL = 'PASTE_POI_LAYER_URL_HERE';

  private readonly layer: FeatureLayer;

  constructor() {
    this.layer = new FeatureLayer({
      url: this.POI_LAYER_URL,
      outFields: ['*']
    });
  }

  /**
   * Returnează POI-urile pentru un oraș, opțional filtrate pe tipuri (categorii).
   */
  async getPoisByCity(cityId: string, types?: string[]): Promise<Poi[]> {
    const query = this.layer.createQuery();
    query.where = this.buildWhereClause(cityId, types);
    query.returnGeometry = false;
    query.outFields = ['poiId', 'cityId', 'name', 'type', 'rating', 'priceRange', 'openingHours'];

    const res = await this.layer.queryFeatures(query);

    return (res.features || [])
      .map((g: Graphic) => g.attributes as Poi)
      .filter(p => !!p && !!p.poiId); // safety
  }

  private buildWhereClause(cityId: string, types?: string[]): string {
    const safeCity = this.escapeQuotes(cityId);

    const base = `cityId='${safeCity}'`;

    if (!types || types.length === 0) return base;

    const list = types
      .filter(Boolean)
      .map(t => `'${this.escapeQuotes(t)}'`)
      .join(',');

    return `${base} AND type IN (${list})`;
  }

  private escapeQuotes(value: string): string {
    return String(value).replace(/'/g, "''");
  }
}
