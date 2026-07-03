import type { Player } from './types';

/**
 * Generic interface for any GOALS data source.
 * goalsverse-client is the first implementation.
 * Future sources can implement this interface.
 */
export interface ScraperClient {
  name: string;
  baseUrl: string;

  getClubRoster(query: string): Promise<{
    players: Player[];
    clubUrl?: string;
    clubName?: string;
    reason?: string;
  }>;
}
