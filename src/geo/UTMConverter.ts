/**
 * WGS84 ↔ UTM Coordinate Converter
 *
 * UTM (Universal Transverse Mercator) is a map projection system that
 * divides the Earth into 60 zones, each 6° of longitude wide.
 *
 * Useful for:
 * - Distance calculations (coordinates in meters)
 * - Area calculations
 * - Local projections with minimal distortion
 *
 * Based on WGS84 ellipsoid parameters.
 *
 * @module geo
 */

import { LatLng, UTMCoord } from './GeoTypes';

/**
 * WGS84 to UTM and UTM to WGS84 converter
 */
export class UTMConverter {
  // WGS84 ellipsoid constants
  private static readonly a = 6378137;                    // Semi-major axis (meters)
  private static readonly f = 1 / 298.257223563;          // Flattening
  private static readonly b = UTMConverter.a * (1 - UTMConverter.f);  // Semi-minor axis
  private static readonly e = Math.sqrt(1 - (UTMConverter.b * UTMConverter.b) / (UTMConverter.a * UTMConverter.a)); // First eccentricity
  private static readonly e2 = UTMConverter.e * UTMConverter.e;
  private static readonly ep2 = UTMConverter.e2 / (1 - UTMConverter.e2); // Second eccentricity squared

  // UTM parameters
  private static readonly k0 = 0.9996;      // Scale factor at central meridian
  private static readonly E0 = 500000;      // False easting (meters)
  private static readonly N0_north = 0;     // False northing for northern hemisphere
  private static readonly N0_south = 10000000; // False northing for southern hemisphere

  /**
   * Convert WGS84 (lat/lng) to UTM coordinates
   */
  static toUTM(latLng: LatLng): UTMCoord {
    const { lat, lng } = latLng;

    // Determine UTM zone
    const zone = UTMConverter.getZone(lng);
    const hemisphere: 'N' | 'S' = lat >= 0 ? 'N' : 'S';

    // Central meridian of zone
    const lng0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);

    // Convert to radians
    const latRad = lat * (Math.PI / 180);
    const lngRad = lng * (Math.PI / 180);

    // Calculate terms
    const N = UTMConverter.a / Math.sqrt(1 - UTMConverter.e2 * Math.sin(latRad) * Math.sin(latRad));
    const T = Math.tan(latRad) * Math.tan(latRad);
    const C = UTMConverter.ep2 * Math.cos(latRad) * Math.cos(latRad);
    const A = Math.cos(latRad) * (lngRad - lng0);

    // Meridional arc
    const M = UTMConverter.meridionalArc(latRad);

    // Calculate easting
    const x = UTMConverter.k0 * N * (
      A +
      (1 - T + C) * Math.pow(A, 3) / 6 +
      (5 - 18 * T + T * T + 72 * C - 58 * UTMConverter.ep2) * Math.pow(A, 5) / 120
    );

    // Calculate northing
    const y = UTMConverter.k0 * (
      M +
      N * Math.tan(latRad) * (
        A * A / 2 +
        (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24 +
        (61 - 58 * T + T * T + 600 * C - 330 * UTMConverter.ep2) * Math.pow(A, 6) / 720
      )
    );

    // Apply false easting/northing
    const easting = x + UTMConverter.E0;
    const northing = hemisphere === 'N' ? y + UTMConverter.N0_north : y + UTMConverter.N0_south;

    return { easting, northing, zone, hemisphere };
  }

  /**
   * Convert UTM coordinates to WGS84 (lat/lng)
   */
  static toLatLng(utm: UTMCoord): LatLng {
    const { easting, northing, zone, hemisphere } = utm;

    // Remove false easting/northing
    const x = easting - UTMConverter.E0;
    const y = hemisphere === 'N' ? northing - UTMConverter.N0_north : northing - UTMConverter.N0_south;

    // Central meridian of zone
    const lng0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);

    // Footprint latitude
    const M = y / UTMConverter.k0;
    const mu = M / (UTMConverter.a * (1 - UTMConverter.e2 / 4 - 3 * Math.pow(UTMConverter.e2, 2) / 64 - 5 * Math.pow(UTMConverter.e2, 3) / 256));

    // Calculate footprint latitude coefficients
    const e1 = (1 - Math.sqrt(1 - UTMConverter.e2)) / (1 + Math.sqrt(1 - UTMConverter.e2));
    const phi1 = mu +
      (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) +
      (21 * Math.pow(e1, 2) / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu) +
      (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu) +
      (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);

    // Calculate terms
    const N1 = UTMConverter.a / Math.sqrt(1 - UTMConverter.e2 * Math.sin(phi1) * Math.sin(phi1));
    const R1 = UTMConverter.a * (1 - UTMConverter.e2) / Math.pow(1 - UTMConverter.e2 * Math.sin(phi1) * Math.sin(phi1), 1.5);
    const T1 = Math.tan(phi1) * Math.tan(phi1);
    const C1 = UTMConverter.ep2 * Math.cos(phi1) * Math.cos(phi1);
    const D = x / (N1 * UTMConverter.k0);

    // Calculate latitude
    const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (
      D * D / 2 -
      (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * UTMConverter.ep2) * Math.pow(D, 4) / 24 +
      (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * UTMConverter.ep2 - 3 * C1 * C1) * Math.pow(D, 6) / 720
    );

    // Calculate longitude
    const lng = lng0 + (
      D -
      (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 +
      (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * UTMConverter.ep2 + 24 * T1 * T1) * Math.pow(D, 5) / 120
    ) / Math.cos(phi1);

    // Convert to degrees
    return {
      lat: lat * (180 / Math.PI),
      lng: lng * (180 / Math.PI),
    };
  }

  /**
   * Calculate distance between two points using Haversine formula
   * Returns distance in meters
   */
  static distance(p1: LatLng, p2: LatLng): number {
    const R = 6371000; // Earth's radius in meters

    const lat1 = p1.lat * (Math.PI / 180);
    const lat2 = p2.lat * (Math.PI / 180);
    const dLat = (p2.lat - p1.lat) * (Math.PI / 180);
    const dLng = (p2.lng - p1.lng) * (Math.PI / 180);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Calculate bearing from p1 to p2
   * Returns bearing in degrees (0-360, clockwise from north)
   */
  static bearing(p1: LatLng, p2: LatLng): number {
    const lat1 = p1.lat * (Math.PI / 180);
    const lat2 = p2.lat * (Math.PI / 180);
    const dLng = (p2.lng - p1.lng) * (Math.PI / 180);

    const x = Math.sin(dLng) * Math.cos(lat2);
    const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

    const bearing = Math.atan2(x, y) * (180 / Math.PI);
    return (bearing + 360) % 360;
  }

  /**
   * Get UTM zone for a given longitude
   */
  static getZone(lng: number): number {
    return Math.floor((lng + 180) / 6) + 1;
  }

  /**
   * Get central meridian for a UTM zone (in degrees)
   */
  static getCentralMeridian(zone: number): number {
    return (zone - 1) * 6 - 180 + 3;
  }

  /**
   * Calculate point at distance and bearing from start point
   * @param start Starting point
   * @param distance Distance in meters
   * @param bearing Bearing in degrees (0-360)
   * @returns Destination point
   */
  static destination(start: LatLng, distance: number, bearing: number): LatLng {
    const R = 6371000; // Earth's radius in meters

    const lat1 = start.lat * (Math.PI / 180);
    const lng1 = start.lng * (Math.PI / 180);
    const brng = bearing * (Math.PI / 180);
    const d = distance / R;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) +
      Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
    );

    const lng2 = lng1 + Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

    return {
      lat: lat2 * (180 / Math.PI),
      lng: lng2 * (180 / Math.PI),
    };
  }

  /**
   * Calculate the midpoint between two points
   */
  static midpoint(p1: LatLng, p2: LatLng): LatLng {
    const lat1 = p1.lat * (Math.PI / 180);
    const lat2 = p2.lat * (Math.PI / 180);
    const lng1 = p1.lng * (Math.PI / 180);
    const dLng = (p2.lng - p1.lng) * (Math.PI / 180);

    const Bx = Math.cos(lat2) * Math.cos(dLng);
    const By = Math.cos(lat2) * Math.sin(dLng);

    const lat3 = Math.atan2(
      Math.sin(lat1) + Math.sin(lat2),
      Math.sqrt((Math.cos(lat1) + Bx) * (Math.cos(lat1) + Bx) + By * By)
    );

    const lng3 = lng1 + Math.atan2(By, Math.cos(lat1) + Bx);

    return {
      lat: lat3 * (180 / Math.PI),
      lng: lng3 * (180 / Math.PI),
    };
  }

  /**
   * Calculate meridional arc - distance from equator to given latitude
   */
  private static meridionalArc(latRad: number): number {
    const e2 = UTMConverter.e2;
    return UTMConverter.a * (
      (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * latRad -
      (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * latRad) +
      (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * latRad) -
      (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * latRad)
    );
  }
}
