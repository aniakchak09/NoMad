import { Injectable } from '@angular/core';
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";

@Injectable({ providedIn: 'root' })
export class PoiService {
  layer = new FeatureLayer({
    url: "URL_POI_LAYER",
    outFields: ["*"]
  });

  async getPoisByCity(cityId: string) {
    const query = this.layer.createQuery();
    query.where = `cityId='${cityId}'`;
    query.returnGeometry = false;

    const results = await this.layer.queryFeatures(query);
    return results.features.map(f => f.attributes);
  }
}
