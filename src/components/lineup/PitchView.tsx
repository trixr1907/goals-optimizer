'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';

const RARITY_COLORS: Record<string, string> = {
  Basic: '#64748b',
  Uncommon: '#16a34a',
  Rare: '#2563eb',
  Epic: '#7c3aed',
  Legendary: '#d97706',
  Mythic: '#dc2626',
  Iconic: '#0891b2',
};

function fitColor(score: number): string {
  if (score >= 85) return '#34d399';
  if (score >= 70) return '#fbbf24';
  return '#f87171';
}

interface PlayerTokenProps {
  player: PlayerWithScores;
  slotKey: string;
  position: Position;
  isLocked: boolean;
  onLockToggle: (id: string) => void;
}

function PlayerToken({ player, slotKey, position, isLocked, onLockToggle }: PlayerTokenProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `token-${slotKey}`,
    data: { playerId: player.id, fromSlot: slotKey },
  });

  const fitScore = player.fit_scores[position] ?? 0;
  const rarityColor = RARITY_COLORS[player.rarity] ?? '#64748b';

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
    : {};
  const setSvgNodeRef = setNodeRef as unknown as (node: SVGGElement | null) => void;

  return (
    <g
      ref={setSvgNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onDoubleClick={() => onLockToggle(player.id)}
      opacity={isDragging ? 0.4 : 1}
      cursor="grab"
    >
      <circle cx={0} cy={0} r={18} fill={rarityColor} opacity={0.85} />
      <circle cx={0} cy={0} r={15} fill="#1e293b" />
      <text x={0} y={-3} textAnchor="middle" fontSize={9} fill="white" fontWeight="bold">
        {player.overall}
      </text>
      <text x={0} y={7} textAnchor="middle" fontSize={6} fill="#94a3b8">
        {player.name.split(' ').pop()?.slice(0, 8) ?? ''}
      </text>
      <rect x={-14} y={17} width={28} height={10} rx={4} fill={fitColor(fitScore)} opacity={0.9} />
      <text x={0} y={25} textAnchor="middle" fontSize={7} fill="#0f172a" fontWeight="bold">
        {fitScore.toFixed(0)}
      </text>
      {isLocked && (
        <text x={12} y={-10} fontSize={8} fill="#fbbf24">🔒</text>
      )}
    </g>
  );
}

interface EmptySlotProps {
  slotKey: string;
  position: Position;
}

function EmptySlot({ slotKey, position }: EmptySlotProps) {
  const { isOver, setNodeRef } = useDroppable({ id: `slot-${slotKey}` });
  const setSvgNodeRef = setNodeRef as unknown as (node: SVGGElement | null) => void;

  return (
    <g ref={setSvgNodeRef}>
      <circle
        cx={0} cy={0} r={18}
        fill={isOver ? '#1e40af' : '#1e293b'}
        stroke={isOver ? '#3b82f6' : '#475569'}
        strokeWidth={1.5}
        strokeDasharray="4 2"
      />
      <text x={0} y={4} textAnchor="middle" fontSize={8} fill="#64748b" fontWeight="bold">
        {position}
      </text>
    </g>
  );
}

interface PitchViewProps {
  slots: LineupSlot[];
  lineup: Record<string, string | null>;
  players: PlayerWithScores[];
  lockedPlayerIds: Set<string>;
  onLockToggle: (playerId: string) => void;
  slotKeyFor: (position: Position, idx: number) => string;
}

export function PitchView({
  slots, lineup, players, lockedPlayerIds, onLockToggle, slotKeyFor,
}: PitchViewProps) {
  const W = 100;
  const H = 150;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-md mx-auto"
      style={{ background: '#166534', borderRadius: 8 }}
    >
      <rect x={3} y={3} width={94} height={144} rx={2} fill="none" stroke="#15803d" strokeWidth={0.8} />
      <line x1={3} y1={75} x2={97} y2={75} stroke="#15803d" strokeWidth={0.6} />
      <circle cx={50} cy={75} r={12} fill="none" stroke="#15803d" strokeWidth={0.6} />
      <rect x={22} y={3} width={56} height={22} fill="none" stroke="#15803d" strokeWidth={0.6} />
      <rect x={22} y={125} width={56} height={22} fill="none" stroke="#15803d" strokeWidth={0.6} />
      <rect x={38} y={1} width={24} height={5} fill="none" stroke="#15803d" strokeWidth={0.5} />
      <rect x={38} y={144} width={24} height={5} fill="none" stroke="#15803d" strokeWidth={0.5} />
      <circle cx={50} cy={16} r={0.8} fill="#15803d" />
      <circle cx={50} cy={134} r={0.8} fill="#15803d" />

      {slots.map((slot, idx) => {
        const key = slotKeyFor(slot.position, idx);
        const playerId = lineup[key] ?? null;
        const player = playerId ? players.find(p => p.id === playerId) : null;
        const cx = (slot.x / 100) * W;
        const cy = (slot.y / 100) * H;

        return (
          <g key={key} transform={`translate(${cx}, ${cy})`}>
            {player ? (
              <PlayerToken
                player={player}
                slotKey={key}
                position={slot.position}
                isLocked={lockedPlayerIds.has(player.id)}
                onLockToggle={onLockToggle}
              />
            ) : (
              <EmptySlot slotKey={key} position={slot.position} />
            )}
          </g>
        );
      })}
    </svg>
  );
}
