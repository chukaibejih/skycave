// Shared GeoGuess primitives, kept in their own module so the globe and its
// flat fallback can both use them without importing each other.

export interface Marker {
  lat: number;
  lng: number;
  color: string;
  label?: string;
  size?: number;
}

export const EARTH_TEXTURE = "/textures/earth-blue-marble.jpg";
// Label-free political/physical map: light land, blue water, country borders,
// coastlines, rivers and lakes - and NO place names, so it's safe to show while
// the player is guessing. Built from Natural Earth (public domain) vectors,
// equirectangular 2:1 to match the globe's projection.
export const EARTH_MAP_TEXTURE = "/textures/earth-map.jpg";
