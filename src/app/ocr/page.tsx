'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { ALL_POSITIONS, Player, PlayerWithScores, Position } from '@/lib/scraper/types';
import { enrichPlayerWithScores } from '@/lib/scoring/position-fit';
import { inferFullStats } from '@/lib/scraper/infer-stats';
import { apiPath } from '@/lib/app-url';
import { useSquadStore } from '@/lib/store/squad-store';

type Draft = {
  name: string;
  position?: string;
  overall?: number;
  raw?: string;
  pac?: number;
  sho?: number;
  pas?: number;
  dri?: number;
  def?: number;
  phy?: number;
  preferred_foot?: 'left' | 'right';
  weak_foot?: number;
};

type OcrResult = {
  configured?: boolean;
  message?: string;
  error?: string;
  notes?: string;
  players?: Draft[];
};

const POSITION_SET = new Set<string>(ALL_POSITIONS);

function normalizePosition(value?: string): Position {
  const normalized = value?.trim().toUpperCase();
  return POSITION_SET.has(normalized ?? '') ? (normalized as Position) : 'CM';
}

function clampStat(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.min(99, Math.round(num)));
}

function inferStats(draft: Draft, overall: number, position: Position): Player['stats'] {
  const baseByPosition: Record<Position, { pac: number; sho: number; pas: number; dri: number; def: number; phy: number }> = {
    GK: { pac: 45, sho: 20, pas: 55, dri: 45, def: 80, phy: 70 },
    CB: { pac: 60, sho: 35, pas: 55, dri: 50, def: 82, phy: 80 },
    LB: { pac: 78, sho: 45, pas: 62, dri: 65, def: 72, phy: 68 },
    RB: { pac: 78, sho: 45, pas: 62, dri: 65, def: 72, phy: 68 },
    LWB: { pac: 80, sho: 48, pas: 66, dri: 69, def: 68, phy: 68 },
    RWB: { pac: 80, sho: 48, pas: 66, dri: 69, def: 68, phy: 68 },
    CDM: { pac: 62, sho: 48, pas: 72, dri: 66, def: 78, phy: 74 },
    CM: { pac: 66, sho: 62, pas: 76, dri: 72, def: 64, phy: 68 },
    CAM: { pac: 70, sho: 72, pas: 78, dri: 80, def: 42, phy: 58 },
    LM: { pac: 80, sho: 66, pas: 70, dri: 78, def: 48, phy: 60 },
    RM: { pac: 80, sho: 66, pas: 70, dri: 78, def: 48, phy: 60 },
    LW: { pac: 84, sho: 72, pas: 66, dri: 82, def: 38, phy: 58 },
    RW: { pac: 84, sho: 72, pas: 66, dri: 82, def: 38, phy: 58 },
    CF: { pac: 74, sho: 78, pas: 72, dri: 78, def: 40, phy: 66 },
    ST: { pac: 72, sho: 84, pas: 58, dri: 70, def: 35, phy: 76 },
  };

  const template = baseByPosition[position];
  const scale = overall / 70;
  return inferFullStats(
    clampStat(draft.pac, template.pac * scale),
    clampStat(draft.sho, template.sho * scale),
    clampStat(draft.pas, template.pas * scale),
    clampStat(draft.dri, template.dri * scale),
    clampStat(draft.def, template.def * scale),
    clampStat(draft.phy, template.phy * scale)
  );
}

function draftToPlayer(draft: Draft, index: number): PlayerWithScores {
  const position = normalizePosition(draft.position);
  const overall = clampStat(draft.overall, 65);
  const safeName = draft.name?.trim() || draft.raw?.trim() || `OCR Spieler ${index + 1}`;
  return enrichPlayerWithScores({
    id: `ocr-${safeName.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-${index}`,
    name: safeName,
    position,
    overall,
    rarity: overall >= 85 ? 'Epic' : overall >= 75 ? 'Rare' : overall >= 65 ? 'Uncommon' : 'Basic',
    stats: inferStats(draft, overall, position),
    preferred_foot: draft.preferred_foot,
    weak_foot: draft.weak_foot ? clampStat(draft.weak_foot, 70) : undefined,
  });
}

function parseDrafts(text: string): Draft[] {
  const parsed = JSON.parse(text) as unknown;
  if (Array.isArray(parsed)) return parsed as Draft[];
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { players?: unknown }).players)) {
    return (parsed as { players: Draft[] }).players;
  }
  throw new Error('JSON muss ein Array oder { "players": [...] } sein.');
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractVideoFrame(file: File, seconds = 2): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Video konnte nicht geladen werden'));
    });
    video.currentTime = Math.min(seconds, Math.max(0, video.duration - 0.2));
    await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas nicht verfügbar');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function OcrFallbackPage() {
  const router = useRouter();
  const { importPlayers, setClubName } = useSquadStore();
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [manualJson, setManualJson] = useState('');
  const [status, setStatus] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setStatus('');
    setResult(null);
    try {
      const dataUrl = file.type.startsWith('video/')
        ? await extractVideoFrame(file)
        : await fileToDataUrl(file);
      setPreview(dataUrl);
      const res = await fetch(apiPath('/api/ocr/frame'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      });
      const data = await res.json();
      setResult(data);
      if (data.players?.length) {
        setManualJson(JSON.stringify(data.players, null, 2));
        setStatus(`${data.players.length} OCR-Entwürfe erkannt. Bitte prüfen und importieren.`);
      } else {
        setManualJson('[\n  { "name": "", "position": "CM", "overall": 65 }\n]');
        setStatus('Frame extrahiert. Keine sicheren Spieler erkannt — manuell eintragen oder API-Key setzen.');
      }
    } catch (error) {
      setResult({ error: String(error), players: [] });
      setStatus('Analyse fehlgeschlagen.');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  }

  function importDrafts() {
    try {
      const drafts = parseDrafts(manualJson).filter((draft) => draft.name?.trim() || draft.raw?.trim());
      if (!drafts.length) {
        setStatus('Keine Spieler im JSON gefunden.');
        return;
      }
      const players = drafts.map(draftToPlayer);
      setClubName('OCR Import');
      importPlayers(players);
      setStatus(`${players.length} Spieler aus OCR/Manual Review importiert.`);
      router.push('/squad');
    } catch (error) {
      setStatus(`JSON konnte nicht importiert werden: ${String(error)}`);
    }
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Video-/Screenshot-OCR Fallback</h2>
            <p className="mt-1 text-sm text-slate-500">
              Falls goalsverse Import nicht reicht: Video oder Screenshot hochladen, Frame extrahieren, Vision-OCR ausführen oder manuell korrigieren.
            </p>
          </div>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
            <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={loading}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading ? 'Analysiere…' : 'Bild/Video hochladen'}
            </button>
            <p className="text-xs text-slate-500">
              Tipp: Bei Videos wird automatisch ein Frame nach ca. 2 Sekunden extrahiert. Für beste OCR: Spielerkarte/Kaderliste kurz still stehen lassen.
            </p>
          </section>

          {preview && (
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">Extrahierter Frame</p>
                <img src={preview} alt="OCR frame preview" className="w-full rounded-xl border border-slate-800" />
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">OCR Ergebnis & Review</p>
                {result?.message && <p className="text-sm text-amber-300">{result.message}</p>}
                {result?.error && <p className="text-sm text-red-400">{result.error}</p>}
                {result?.notes && <p className="text-sm text-slate-400">{result.notes}</p>}
                <textarea
                  value={manualJson}
                  onChange={(e) => setManualJson(e.target.value)}
                  placeholder='[{"name":"Player Name","position":"ST","overall":75}]'
                  className="h-72 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-500 space-y-1">
                  <p>Erlaubte Felder: name, position, overall, pac, sho, pas, dri, def, phy, preferred_foot, weak_foot.</p>
                  <p>Wenn Einzelstats fehlen, werden positionsbasierte Default-Stats aus dem OVR abgeleitet, damit der Optimizer sofort rechnen kann.</p>
                </div>
                <button
                  onClick={importDrafts}
                  disabled={!manualJson.trim()}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Geprüfte OCR-Spieler als Kader übernehmen
                </button>
              </div>
            </section>
          )}

          {status && (
            <p className={`text-sm ${status.includes('fehl') || status.includes('konnte') ? 'text-red-400' : 'text-slate-400'}`}>
              {status}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
