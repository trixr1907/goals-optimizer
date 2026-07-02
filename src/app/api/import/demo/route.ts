import { NextResponse } from 'next/server';
import { MOCK_PLAYERS } from '@/lib/scraper/mock-data';

export async function POST() {
  return NextResponse.json({ players: MOCK_PLAYERS, count: MOCK_PLAYERS.length });
}
