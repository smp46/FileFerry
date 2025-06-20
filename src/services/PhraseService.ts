// services/PhraseService.ts
// @ts-ignore
import * as DashPhraseModule from 'dashphrase';
import type { Multiaddr } from '@multiformats/multiaddr';

/**
 * Interface for the lookup phrase API response.
 * @internal
 */
interface LookupResponse {
  maddr: string;
}

/**
 * Handles generating human-readable phrases and interacting with the
 * exchange server to register and look up multiaddresses.
 */
export class PhraseService {
  private apiUrl: string;

  /**
   * Initializes the PhraseService.
   * @param apiUrl - The base URL of the phrase exchange API.
   */
  public constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  /**
   * Generates a new random phrase.
   * @returns A promise that resolves to the generated phrase string.
   */
  public async generatePhrase(): Promise<string> {
    const randWords = await DashPhraseModule.default.generate(16);
    const randomNumber = Math.floor(Math.random() * 100) + 1;
    return [randomNumber, ...randWords.split(' ')].join('-');
  }

  /**
   * Registers a phrase and its corresponding multiaddress with the exchange server.
   * @param phrase - The phrase to register.
   * @param multiaddr - The multiaddress to associate with the phrase.
   * @returns A promise that resolves to the server's JSON response.
   */
  public async registerPhrase(
    phrase: string,
    multiaddr: Multiaddr,
  ): Promise<unknown> {
    try {
      const response = await this.makeApiRequest('/phrase', 'POST', {
        Maddr: multiaddr.toString(),
        Phrase: phrase,
      });

      if (!response.ok) {
        throw new Error(
          `Failed to register phrase. Status: ${response.status}`,
        );
      }

      return await response.json();
    } catch (error) {
      this.handleApiError(error as Error);
      throw error;
    }
  }

  /**
   * Looks up a multiaddress from the exchange server using a phrase.
   * @param phrase - The phrase to look up.
   * @returns A promise that resolves to the server's JSON response containing the address.
   */
  public async lookupPhrase(phrase: string): Promise<LookupResponse> {
    try {
      const response = await this.makeApiRequest(
        `/phrase/${encodeURIComponent(phrase)}`,
        'GET',
      );

      if (!response.ok) {
        throw new Error(`Failed to lookup phrase. Status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      this.handleApiError(error as Error);
      throw error;
    }
  }

  /**
   * Makes a generic request to the API.
   * @param endpoint - The API endpoint to request.
   * @param method - The HTTP method to use.
   * @param data - Optional data to send in the request body.
   * @returns A promise that resolves to the Fetch API Response object.
   * @internal
   */
  private async makeApiRequest(
    endpoint: string,
    method: 'GET' | 'POST',
    data: object | null = null,
  ): Promise<Response> {
    const url = `${this.apiUrl}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: { 'Content-type': 'application/json; charset=UTF-8' },
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    return await fetch(url, options);
  }

  /**
   * Handles API errors by logging them.
   * @param error - The error that occurred.
   * @internal
   */
  private handleApiError(error: Error): void {
    console.error('API Error:', error);
  }

  /**
   * Validates a given phrase.
   * @param phrase - The phrase to validate.
   * @returns True if the phrase is considered valid.
   */
  public validatePhrase(phrase: string): boolean {
    if (phrase != undefined && phrase.trim().length > 0) {
      return true;
    }
    return false;
  }

  /**
   * Sanitizes a phrase by trimming and converting to lowercase.
   * @param phrase - The phrase to sanitize.
   * @returns The sanitized phrase.
   */
  public sanitizePhrase(phrase: string): string {
    return phrase.trim().toLowerCase();
  }
}
