// services/StunService.ts

import { string } from '@multiformats/multiaddr-matcher/utils';

/**
 * Describes the structure for geographic location data of STUN servers.
 * @internal
 */
interface GeoLocs {
  [ip: string]: [number, number];
}

/**
 * Describes the structure for the user's geographic data.
 * @internal
 */
interface UserGeoData {
  lat: number;
  lon: number;
}

/**
 * Describes the structure for cached geographic data in local storage.
 * @internal
 */
interface CachedGeoData {
  data: UserGeoData;
  expiry: number;
}

/**
 * A service to find the geographically closest STUN server to the user
 * for faster WebRTC connection establishment.
 */
export class StunService {
  private readonly geoLocUrl: string;
  private readonly hostUrl: string;
  private readonly geoUserUrl: string;
  private readonly cacheKey: string;
  private readonly cacheDuration: number;

  /**
   * Initializes the StunService with necessary URLs and cache settings.
   */
  public constructor() {
    this.geoLocUrl =
      'https://raw.githubusercontent.com/pradt2/always-online-stun/master/geoip_cache.txt';
    this.hostUrl =
      'https://raw.githubusercontent.com/pradt2/always-online-stun/master/valid_ipv4s.txt';
    this.geoUserUrl = 'https://geoip.fileferry.xyz';
    this.cacheKey = 'userGeoData';
    this.cacheDuration = 48 * 60 * 60 * 1000; // 48 hours
  }

  /**
   * Fetches all required data and determines the closest STUN servers.
   * @returns A promise that resolves to an array of the closest STUN server addresses, or undefined on failure.
   */
  public async getClosestStunServers(): Promise<string[] | undefined> {
    try {
      const geoLocs = await this.fetchGeoData();
      const userData = await this.getUserGeoData();
      const hostList = await this.fetchStunServers();

      if (
        typeof userData.lat !== 'number' ||
        typeof userData.lon !== 'number'
      ) {
        throw new Error("User's geographic data is incomplete or invalid.");
      }

      const closestServers = this.findClosestServers(
        userData,
        geoLocs,
        hostList,
      );

      if (!closestServers || closestServers.length === 0) {
        throw new Error('No valid STUN servers could be determined.');
      }

      const result = this.appendStunString(closestServers);

      return result;
    } catch (error) {
      this.clearExpiredCache();
      return undefined;
    }
  }

  /**
   * Prepends 'stun:' to each server address.
   * @param addrs - An array of server addresses.
   * @returns A new array with the modified addresses.
   */
  private appendStunString(addrs: string[]): string[] {
    return addrs.map((addr) => `stun:${addr}`);
  }

  /**
   * Fetches the geographic location data for STUN servers.
   * @returns A promise that resolves to the GeoLocs object.
   * @internal
   */
  private async fetchGeoData(): Promise<GeoLocs> {
    const response = await fetch(this.geoLocUrl);
    return await response.json();
  }

  /**
   * Fetches the user's geographic location, using a cache if available.
   * @returns A promise that resolves to the user's geo data.
   * @internal
   */
  private async getUserGeoData(): Promise<UserGeoData> {
    const cachedData = this.getCachedGeoData();
    if (cachedData) {
      return cachedData;
    }

    const response = await fetch(this.geoUserUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch user geo data: ${response.status} ${response.statusText}`,
      );
    }

    const userData: UserGeoData = await response.json();
    this.setCachedGeoData(userData);
    return userData;
  }

  /**
   * Calculates the simple Euclidean distance between two geographic points.
   * @param lat1 - Latitude of point 1.
   * @param lon1 - Longitude of point 1.
   * @param lat2 - Latitude of point 2.
   * @param lon2 - Longitude of point 2.
   * @returns The calculated distance.
   * @internal
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    return Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lon1 - lon2, 2));
  }

  /**
   * Finds the three closest servers from a list based on the user's location.
   * @param userData - The user's location data.
   * @param geoLocs - The location data for all servers.
   * @param hostList - A string containing a newline-separated list of server hosts.
   * @returns An array containing the addresses and distances of the top 3 closest servers.
   * @internal
   */
  private findClosestServers(
    userData: UserGeoData,
    geoLocs: GeoLocs,
    hostList: string,
  ): string[] {
    const { lat: userLat, lon: userLon } = userData;

    const serversWithDistances = hostList
      .trim()
      .split('\n')
      .map((addr): [string, number] => {
        const serverIp = addr.split(':')[0];
        if (!geoLocs[serverIp]) {
          return [addr, Infinity];
        }

        const [stunLat, stunLon] = geoLocs[serverIp];
        if (typeof stunLat !== 'number' || typeof stunLon !== 'number') {
          return [addr, Infinity];
        }

        const dist = this.calculateDistance(userLat, userLon, stunLat, stunLon);
        return [addr, dist];
      });

    const closestServers = serversWithDistances
      .sort(([, distA], [, distB]) => distA - distB)
      .map(([addr]) => addr)
      .slice(0, 3);

    return closestServers;
  }

  /**
   * Retrieves user geo data from local storage if not expired.
   * @returns The cached user data or null if not available/expired.
   * @internal
   */
  private getCachedGeoData(): UserGeoData | null {
    const cached = localStorage.getItem(this.cacheKey);
    if (cached) {
      const parsedCache: CachedGeoData = JSON.parse(cached);
      if (parsedCache.expiry && parsedCache.expiry > Date.now()) {
        return parsedCache.data;
      } else {
        localStorage.removeItem(this.cacheKey);
      }
    }
    return null;
  }

  /**
   * Caches the user's geo data in local storage with an expiry date.
   * @param data - The user geo data to cache.
   * @internal
   */
  private setCachedGeoData(data: UserGeoData): void {
    const cacheEntry: CachedGeoData = {
      data: data,
      expiry: Date.now() + this.cacheDuration,
    };
    localStorage.setItem(this.cacheKey, JSON.stringify(cacheEntry));
  }

  /**
   * Clears any expired cache from local storage.
   * @internal
   */
  private clearExpiredCache(): void {
    localStorage.removeItem(this.cacheKey);
  }

  /**
   * Fetches the list of valid STUN server hosts.
   * @returns A promise that resolves to the list of hosts as a string.
   * @internal
   */
  private async fetchStunServers(): Promise<string> {
    const response = await fetch(this.hostUrl);
    return await response.text();
  }

  /**
   * Validates the format of a STUN server string.
   * @param server - The server address string to validate.
   * @returns True if the server address is valid.
   */
  public validateStunServer(server: string): boolean {
    if (server && server.includes(':') && server.split(':').length === 2) {
      return true;
    }
    return false;
  }
}
