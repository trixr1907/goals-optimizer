import { Player } from './types';
import { inferFullStats } from './infer-stats';

function s(pac: number, sho: number, pas: number, dri: number, def: number, phy: number): Player['stats'] {
  return inferFullStats(pac, sho, pas, dri, def, phy);
}

export const MOCK_PLAYERS: Player[] = [
  { id: '1', name: 'Neuer', position: 'GK', overall: 90, rarity: 'Iconic', stats: s(50, 30, 80, 40, 55, 78) },
  { id: '2', name: 'Davies', position: 'LB', overall: 87, rarity: 'Epic', stats: s(96, 60, 78, 85, 72, 70) },
  { id: '3', name: 'De Ligt', position: 'CB', overall: 86, rarity: 'Epic', stats: s(62, 55, 65, 55, 88, 86) },
  { id: '4', name: 'Upamecano', position: 'CB', overall: 84, rarity: 'Rare', stats: s(78, 40, 62, 58, 84, 85) },
  { id: '5', name: 'Kimmich', position: 'RB', overall: 88, rarity: 'Epic', stats: s(70, 68, 88, 80, 78, 72) },
  { id: '6', name: 'Goretzka', position: 'CM', overall: 86, rarity: 'Epic', stats: s(78, 82, 80, 75, 74, 86) },
  { id: '7', name: 'Musiala', position: 'CAM', overall: 88, rarity: 'Legendary', stats: s(82, 78, 85, 92, 40, 58) },
  { id: '8', name: 'Sané', position: 'RW', overall: 86, rarity: 'Epic', stats: s(93, 82, 78, 88, 35, 55) },
  { id: '9', name: 'Coman', position: 'LW', overall: 85, rarity: 'Epic', stats: s(94, 74, 76, 88, 30, 52) },
  { id: '10', name: 'Kane', position: 'ST', overall: 91, rarity: 'Mythic', stats: s(70, 94, 82, 78, 40, 78) },
  { id: '11', name: 'Müller', position: 'CF', overall: 84, rarity: 'Legendary', stats: s(62, 82, 80, 74, 50, 64) },
  { id: '12', name: 'Olise', position: 'RW', overall: 83, rarity: 'Rare', stats: s(84, 76, 80, 86, 38, 52) },
  { id: '13', name: 'Laimer', position: 'CM', overall: 82, rarity: 'Rare', stats: s(76, 62, 74, 72, 76, 78) },
  { id: '14', name: 'Palhinha', position: 'CDM', overall: 85, rarity: 'Epic', stats: s(62, 65, 72, 68, 86, 88) },
  { id: '15', name: 'Tel', position: 'ST', overall: 78, rarity: 'Uncommon', stats: s(88, 76, 64, 78, 28, 62) },
];
