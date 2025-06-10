export class StunService {
  constructor() {
    this.geoLocUrl =
      'https://raw.githubusercontent.com/pradt2/always-online-stun/master/geoip_cache.txt';
    this.hostUrl =
      'https://raw.githubusercontent.com/pradt2/always-online-stun/master/valid_hosts.txt';
    this.geoUserUrl = 'http://ip-api.com/json/';
    this.cacheKey = 'userGeoData';
    this.cacheDuration = 48 * 60 * 60 * 1000; // 48 hours
  }

  async getClosestStunServer() {
    try {
      const geoLocs = await this.fetchGeoData();
      const userData = await this.getUserGeoData();
      const hostList = await this.fetchStunServers();

      const closestAddr = this.findClosestServer(userData, geoLocs, hostList);
      return closestAddr;
    } catch (error) {
      console.error('Error in getClosestStunServer:', error);
      this.clearExpiredCache();
      return undefined;
    }
  }

  async fetchGeoData() {
    const response = await fetch(this.geoLocUrl);
    return await response.json();
  }

  async getUserGeoData() {
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

    const userData = await response.json();
    this.setCachedGeoData(userData);
    return userData;
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    return Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lon1 - lon2, 2));
  }

  findClosestServer(userData, geoLocs, hostList) {
    const { lat: userLat, lon: userLon } = userData;

    return hostList
      .trim()
      .split('\n')
      .map((addr) => {
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
      })
      .reduce(([addrA, distA], [addrB, distB]) =>
        distA <= distB ? [addrA, distA] : [addrB, distB],
      )[0];
  }

  getCachedGeoData() {
    const cached = localStorage.getItem(this.cacheKey);
    if (cached) {
      const parsedCache = JSON.parse(cached);
      if (parsedCache.expiry && parsedCache.expiry > Date.now()) {
        return parsedCache.data;
      } else {
        localStorage.removeItem(this.cacheKey);
      }
    }
    return null;
  }

  setCachedGeoData(data) {
    const cacheEntry = {
      data: data,
      expiry: Date.now() + this.cacheDuration,
    };
    localStorage.setItem(this.cacheKey, JSON.stringify(cacheEntry));
  }

  clearExpiredCache() {
    localStorage.removeItem(this.cacheKey);
  }

  async fetchStunServers() {
    const response = await fetch(this.hostUrl);
    return await response.text();
  }

  validateStunServer(server) {
    return server && server.includes(':') && server.split(':').length === 2;
  }
}
