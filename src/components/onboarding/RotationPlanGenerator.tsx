'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export function RotationPlanGenerator() {
  const [playerCount, setPlayerCount] = useState('');
  const [result, setResult] = useState<{
    matches: number;
    minutes: number;
    groups: number[][];
  } | null>(null);

  const calculate = () => {
    const count = parseInt(playerCount);
    if (isNaN(count) || count < 1) return;

    const matches = Math.ceil(count / 11);
    const minutes = matches * 5;
    const groups: number[][] = [];
    for (let i = 0; i < count; i += 11) {
      groups.push(
        Array.from({ length: Math.min(11, count - i) }, (_, j) => i + j + 1)
      );
    }

    setResult({ matches, minutes, groups });
  };

  return (
    <Card className="border-slate-800 bg-slate-900/50">
      <CardHeader>
        <CardTitle className="text-white text-lg">Rotationsplan-Generator</CardTitle>
        <CardDescription className="text-slate-400">
          Plane wie viele Quickplay-Matches du brauchst, um alle Spieler fuer den Import freizuschalten.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-2">
            <Label htmlFor="playerCount" className="text-slate-300">Wie viele Spieler hast du ca.?</Label>
            <Input
              id="playerCount"
              type="number"
              placeholder="z.B. 47"
              value={playerCount}
              onChange={(e) => setPlayerCount(e.target.value)}
              className="border-slate-700 bg-slate-800 text-white"
            />
          </div>
          <Button onClick={calculate} className="bg-emerald-600 hover:bg-emerald-700">
            Berechnen
          </Button>
        </div>

        {result && (
          <div className="space-y-3 rounded-lg bg-slate-800/50 p-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <span className="text-lg font-bold">{result.matches}</span>
              <span>Quickplay-Matches</span>
              <span className="text-slate-500">(~{result.minutes} Minuten)</span>
            </div>
            <Separator className="bg-slate-700" />
            <div className="space-y-2">
              {result.groups.map((group, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-slate-300">Match {i + 1}:</span>
                  <span className="text-slate-400">
                    Spieler {group[0]}-{group[group.length - 1]}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              💡 Bonus: Du verdienst Match Points &amp; XP beim Spielen!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
