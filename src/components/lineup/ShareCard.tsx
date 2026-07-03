'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { PlayerWithScores } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';
import { FormationAssignment } from '@/lib/optimizer/formation-optimizer';

// ── Canvas constants ──────────────────────────────────────────────────────────

const W = 1200;
const H = 630;

const PITCH_TOP    = 60;
const PITCH_BOTTOM = H - 20;
const PITCH_LEFT   = 20;
const PITCH_RIGHT  = W - 20;
const PITCH_W      = PITCH_RIGHT - PITCH_LEFT;
const PITCH_H      = PITCH_BOTTOM - PITCH_TOP;

const SLOT_R  = 34;   // circle radius
const FONT    = 'system-ui, -apple-system, sans-serif';

const RARITY_HEX: Record<string, string> = {
  Basic: '#64748b', Common: '#78716c', Uncommon: '#16a34a',
  Rare: '#2563eb',  Epic: '#7c3aed',   Legendary: '#d97706', Mythic: '#dc2626',
};

const META_COLOR = (fit: number) =>
  fit >= 80 ? '#34d399' : fit >= 65 ? '#fbbf24' : '#f87171';

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawPitch(ctx: CanvasRenderingContext2D) {
  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0f1f0f');
  bg.addColorStop(1, '#0a1a0a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Pitch outline
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(PITCH_LEFT, PITCH_TOP, PITCH_W, PITCH_H);

  // Halfway line
  const midY = PITCH_TOP + PITCH_H / 2;
  ctx.beginPath();
  ctx.moveTo(PITCH_LEFT, midY);
  ctx.lineTo(PITCH_RIGHT, midY);
  ctx.stroke();

  // Centre circle
  ctx.beginPath();
  ctx.arc(W / 2, midY, PITCH_H * 0.12, 0, Math.PI * 2);
  ctx.stroke();

  // Penalty areas
  const paW = PITCH_W * 0.35;
  const paH = PITCH_H * 0.18;
  // Top PA
  ctx.strokeRect(PITCH_LEFT + (PITCH_W - paW) / 2, PITCH_TOP, paW, paH);
  // Bottom PA
  ctx.strokeRect(PITCH_LEFT + (PITCH_W - paW) / 2, PITCH_BOTTOM - paH, paW, paH);

  // 6-yard boxes
  const sbW = PITCH_W * 0.16;
  const sbH = PITCH_H * 0.07;
  ctx.strokeRect(PITCH_LEFT + (PITCH_W - sbW) / 2, PITCH_TOP, sbW, sbH);
  ctx.strokeRect(PITCH_LEFT + (PITCH_W - sbW) / 2, PITCH_BOTTOM - sbH, sbW, sbH);

  // Centre dot
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.arc(W / 2, midY, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawSlot(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  player: PlayerWithScores,
  slotPos: string,
  avatarImg: HTMLImageElement | null,
) {
  const fit = player.fit_scores[slotPos as keyof typeof player.fit_scores] ?? 0;
  const rarityColor = RARITY_HEX[player.rarity] ?? '#64748b';
  const metaColor   = META_COLOR(fit);

  // Outer ring (rarity color)
  ctx.beginPath();
  ctx.arc(cx, cy, SLOT_R + 3, 0, Math.PI * 2);
  ctx.fillStyle = rarityColor + '55'; // 33% alpha
  ctx.fill();

  // Circle fill — avatar or solid color
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, SLOT_R, 0, Math.PI * 2);
  ctx.clip();

  if (avatarImg) {
    // Fill dark base first, then avatar on top
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - SLOT_R, cy - SLOT_R, SLOT_R * 2, SLOT_R * 2);
    // Draw avatar centered, slightly upscaled to fill circle
    const scale = (SLOT_R * 2) / Math.min(avatarImg.naturalWidth, avatarImg.naturalHeight);
    const iw = avatarImg.naturalWidth  * scale;
    const ih = avatarImg.naturalHeight * scale;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(avatarImg, cx - iw / 2, cy - ih / 2, iw, ih);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = rarityColor + 'cc';
    ctx.fillRect(cx - SLOT_R, cy - SLOT_R, SLOT_R * 2, SLOT_R * 2);
  }
  ctx.restore();

  // Semi-transparent overlay for text readability
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, SLOT_R, 0, Math.PI * 2);
  ctx.clip();
  const overlay = ctx.createLinearGradient(cx, cy - SLOT_R, cx, cy + SLOT_R);
  overlay.addColorStop(0, 'transparent');
  overlay.addColorStop(0.55, 'rgba(0,0,0,0.0)');
  overlay.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = overlay;
  ctx.fillRect(cx - SLOT_R, cy - SLOT_R, SLOT_R * 2, SLOT_R * 2);
  ctx.restore();

  // Circle border
  ctx.beginPath();
  ctx.arc(cx, cy, SLOT_R, 0, Math.PI * 2);
  ctx.strokeStyle = metaColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Meta-score badge (top-right)
  const badgeX = cx + SLOT_R * 0.65;
  const badgeY = cy - SLOT_R * 0.65;
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, 12, 0, Math.PI * 2);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.strokeStyle = metaColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = metaColor;
  ctx.font = `bold 9px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fit.toFixed(0), badgeX, badgeY);

  // Player name (below circle)
  const lastName = player.name.split(' ').slice(-1)[0];
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  // Truncate long names
  let displayName = lastName;
  while (ctx.measureText(displayName).width > SLOT_R * 2.2 && displayName.length > 3) {
    displayName = displayName.slice(0, -1);
  }
  if (displayName !== lastName) displayName += '.';
  ctx.fillText(displayName, cx, cy + SLOT_R + 4);

  // OVR below name
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `500 10px ${FONT}`;
  ctx.fillText(`${player.overall}`, cx, cy + SLOT_R + 18);
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  clubName: string,
  formationName: string,
  avgMeta: number,
) {
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 22px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(clubName || 'GOALS Squad', PITCH_LEFT + 8, 34);

  // Formation + meta on right
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `500 13px ${FONT}`;
  ctx.fillText(formationName, PITCH_RIGHT - 8, 26);

  const metaColor = META_COLOR(avgMeta);
  ctx.fillStyle = metaColor;
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillText(`Ø Meta ${avgMeta.toFixed(0)}`, PITCH_RIGHT - 8, 44);

  // Branding watermark
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.font = `500 11px ${FONT}`;
  ctx.fillText('goals-optimizer.vercel.app', W / 2, H - 8);
}

// ── Async image loader ────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null); // graceful fallback
    img.src = src;
    // Timeout after 3 s — don't block render for slow CDN
    setTimeout(() => resolve(null), 3000);
  });
}

function playerImageUrl(player: PlayerWithScores): string {
  if (player.image_url) return player.image_url;
  const rawId = player.id.startsWith('goalsverse-') ? player.id.slice('goalsverse-'.length) : player.id;
  return `https://cdn.playgoals.com/character/prod/${rawId}.png`;
}

// ── Main component ────────────────────────────────────────────────────────────

interface ShareCardProps {
  clubName: string;
  formationName: string;
  slots: LineupSlot[];
  lineup: Record<string, string | null>;
  players: PlayerWithScores[];
  /** Optional: pass pre-computed variant assignments */
  assignments?: FormationAssignment[];
  onClose: () => void;
}

export function ShareCard({
  clubName,
  formationName,
  slots,
  lineup,
  players,
  assignments,
  onClose,
}: ShareCardProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const [copying,  setCopying]  = useState(false);
  const [copyOk,   setCopyOk]   = useState(false);

  const playerById = new Map(players.map((p) => [p.id, p]));

  // Build slot→player list from lineup or assignments
  const slotPlayers: Array<{ slot: LineupSlot; player: PlayerWithScores }> = assignments
    ? assignments.map((a) => ({ slot: a.slot, player: a.player }))
    : slots.flatMap((slot, i) => {
        const key = `${slot.position}-${i}`;
        const pid = lineup[key];
        const player = pid ? playerById.get(pid) : null;
        return player ? [{ slot, player }] : [];
      });

  const render = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Load all player avatars in parallel
    const avatarUrls = slotPlayers.map(({ player }) => playerImageUrl(player));
    const avatarImgs = await Promise.all(avatarUrls.map(loadImage));

    drawPitch(ctx);

    // Average meta
    const avgMeta = slotPlayers.length
      ? Math.round(slotPlayers.reduce((s, { slot, player }) => s + (player.fit_scores[slot.position] ?? 0), 0) / slotPlayers.length)
      : 0;

    drawHeader(ctx, clubName, formationName, avgMeta);

    // Draw each player slot
    slotPlayers.forEach(({ slot, player }, i) => {
      // Map percent coords → canvas coords
      const cx = PITCH_LEFT + (slot.x / 100) * PITCH_W;
      const cy = PITCH_TOP  + (slot.y / 100) * PITCH_H;
      drawSlot(ctx, cx, cy, player, slot.position, avatarImgs[i]);
    });

    setRendered(true);
  }, [slotPlayers, clubName, formationName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    render();
  }, [render]);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    const safeName = (clubName || 'squad').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    link.download = `${safeName}-lineup.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  async function handleCopy() {
    const canvas = canvasRef.current;
    if (!canvas || !navigator.clipboard?.write) return;
    setCopying(true);
    try {
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 2000);
    } catch {
      // Clipboard API not available or denied — silently ignore
    } finally {
      setCopying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden w-full max-w-3xl flex flex-col">

        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
          <p className="font-semibold text-white text-sm">Aufstellung teilen</p>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors text-lg">✕</button>
        </div>

        {/* Canvas preview */}
        <div className="relative bg-black overflow-hidden">
          {!rendered && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-slate-400 text-sm">Karte wird gerendert…</p>
            </div>
          )}
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="w-full h-auto block"
            style={{ opacity: rendered ? 1 : 0, transition: 'opacity 0.2s' }}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-slate-800 flex-wrap">
          <button
            onClick={handleDownload}
            disabled={!rendered}
            className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-40 transition-colors"
          >
            ⬇ Bild herunterladen
          </button>
          <button
            onClick={handleCopy}
            disabled={!rendered || copying}
            className="px-5 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            {copyOk ? '✓ Kopiert!' : copying ? 'Kopiere…' : '📋 In Zwischenablage'}
          </button>
          <p className="ml-auto text-xs text-slate-600">1200 × 630 px · PNG</p>
        </div>
      </div>
    </div>
  );
}
