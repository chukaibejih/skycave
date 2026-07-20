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
