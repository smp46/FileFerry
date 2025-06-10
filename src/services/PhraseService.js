import * as DashPhraseModule from 'dashphrase';

export class PhraseService {
  constructor(apiUrl) {
    this.apiUrl = apiUrl;
  }

  async generatePhrase() {
    const randWords = await DashPhraseModule.default.generate(16);
    const randomNumber = Math.floor(Math.random() * 100) + 1;
    return [randomNumber, ...randWords.split(' ')].join('-');
  }

  async registerPhrase(phrase, multiaddr) {
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
      this.handleApiError(error);
      throw error;
    }
  }

  async lookupPhrase(phrase) {
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
      this.handleApiError(error);
      throw error;
    }
  }

  async makeApiRequest(endpoint, method, data = null) {
    const url = `${this.apiUrl}${endpoint}`;
    const options = {
      method,
      headers: { 'Content-type': 'application/json; charset=UTF-8' },
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    return await fetch(url, options);
  }

  handleApiError(error) {
    console.error('API Error:', error);
  }

  validatePhrase(phrase) {
    return phrase && phrase.trim().length > 0;
  }

  sanitizePhrase(phrase) {
    return phrase.trim().toLowerCase();
  }
}
