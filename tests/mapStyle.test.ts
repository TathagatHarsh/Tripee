import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { withoutOlaModelLayer } from "@/components/assignment/Map";

describe("Ola map style compatibility", () => {
  it("removes the missing model source-layer and preserves the rest of the style", () => {
    const style: StyleSpecification = {
      version: 8,
      sources: {
        vectordata: { type: "vector", tiles: ["https://example.com/{z}/{x}/{y}.pbf"] },
        openmaptiles: { type: "vector", tiles: ["https://example.com/base/{z}/{x}/{y}.pbf"] },
      },
      layers: [
        { id: "background", type: "background" },
        { id: "3d_model_data", type: "symbol", source: "vectordata", "source-layer": "3d_model" },
        { id: "chargers", type: "symbol", source: "vectordata", "source-layer": "hyperchargers" },
        { id: "building-3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building" },
        { id: "other-models", type: "symbol", source: "openmaptiles", "source-layer": "3d_model" },
      ],
    };
    expect(withoutOlaModelLayer(style)).toEqual({
      ...style,
      layers: [style.layers[0], ...style.layers.slice(2)],
    });
    expect(style.layers).toHaveLength(5);
  });

  it("preserves the OSM raster fallback", () => {
    const style: StyleSpecification = {
      version: 8,
      sources: { osm: { type: "raster", tiles: ["https://example.com/{z}/{x}/{y}.png"], tileSize: 256 } },
      layers: [{ id: "osm", type: "raster", source: "osm" }],
    };
    expect(withoutOlaModelLayer(style)).toEqual(style);
  });
});
