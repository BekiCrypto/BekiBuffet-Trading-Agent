"use client";

import { useMemo } from "react";
import type { Candle, IchimokuReading, Timeframe } from "@/lib/trading/types";

interface Props {
  candles: Candle[];
  ichimoku: IchimokuReading | null;
  timeframe: Timeframe;
  height?: number;
  campaigns?: { direction: "Long" | "Short"; positions: { entryPrice: number; stopLoss: number; takeProfit: number; scale: number; status: string }[] }[];
}

export function CandleChart({ candles, ichimoku, timeframe, height = 280, campaigns = [] }: Props) {
  const view = useMemo(() => {
    const slice = candles.slice(-60);
    if (slice.length === 0) return null;
    const highs = slice.map((c) => c.high);
    const lows = slice.map((c) => c.low);
    const max = Math.max(...highs);
    const min = Math.min(...lows);
    const range = max - min || 1;
    const padTop = range * 0.08;
    const padBottom = range * 0.08;
    return {
      slice,
      min: min - padBottom,
      max: max + padTop,
      range: range + padTop + padBottom,
    };
  }, [candles]);

  if (!view) {
    return (
      <div className="flex items-center justify-center text-[var(--bb-muted)] text-sm" style={{ height }}>
        No data
      </div>
    );
  }

  const W = 800;
  const H = height;
  const padding = { left: 8, right: 64, top: 12, bottom: 18 };
  const plotW = W - padding.left - padding.right;
  const plotH = H - padding.top - padding.bottom;
  const n = view.slice.length;
  const barW = plotW / n;
  const candleW = Math.max(2, barW * 0.62);

  const priceToY = (p: number) =>
    padding.top + ((view.max - p) / view.range) * plotH;

  const priceToX = (i: number) => padding.left + i * barW + barW / 2;

  // Grid lines (5 horizontal)
  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const y = padding.top + (plotH / 4) * i;
    const price = view.max - (view.range / 4) * i;
    return { y, price };
  });

  // Ichimoku cloud bands (senkou A and B for the visible window)
  // We just show the current cloud as horizontal bands since we computed it at the tip.
  const cloudTopY = ichimoku ? priceToY(ichimoku.cloudTop) : null;
  const cloudBottomY = ichimoku ? priceToY(ichimoku.cloudBottom) : null;
  const tenkanY = ichimoku ? priceToY(ichimoku.tenkan) : null;
  const kijunY = ichimoku ? priceToY(ichimoku.kijun) : null;

  return (
    <div className="w-full overflow-hidden" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-full"
      >
        {/* Grid */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              x2={W - padding.right}
              y1={g.y}
              y2={g.y}
              stroke="#1f2937"
              strokeWidth={0.5}
              strokeDasharray="2 4"
            />
            <text
              x={W - padding.right + 4}
              y={g.y + 3}
              fill="#7d8590"
              fontSize={10}
              fontFamily="var(--font-geist-mono)"
            >
              {g.price.toFixed(view.max > 100 ? 1 : 4)}
            </text>
          </g>
        ))}

        {/* Ichimoku cloud band */}
        {cloudTopY !== null && cloudBottomY !== null && (
          <rect
            x={padding.left}
            y={Math.min(cloudTopY, cloudBottomY)}
            width={plotW}
            height={Math.abs(cloudBottomY - cloudTopY)}
            fill={
              ichimoku?.cloudColor === "Bullish"
                ? "rgba(63, 185, 80, 0.12)"
                : ichimoku?.cloudColor === "Bearish"
                ? "rgba(248, 81, 73, 0.12)"
                : "rgba(125, 133, 144, 0.08)"
            }
            stroke={
              ichimoku?.cloudColor === "Bullish"
                ? "rgba(63, 185, 80, 0.4)"
                : ichimoku?.cloudColor === "Bearish"
                ? "rgba(248, 81, 73, 0.4)"
                : "rgba(125, 133, 144, 0.3)"
            }
            strokeWidth={0.5}
            strokeDasharray="3 2"
          />
        )}

        {/* Tenkan / Kijun lines */}
        {tenkanY !== null && (
          <line
            x1={padding.left}
            x2={W - padding.right}
            y1={tenkanY}
            y2={tenkanY}
            stroke="#58a6ff"
            strokeWidth={1}
            strokeDasharray="4 2"
            opacity={0.7}
          />
        )}
        {kijunY !== null && (
          <line
            x1={padding.left}
            x2={W - padding.right}
            y1={kijunY}
            y2={kijunY}
            stroke="#bc8cff"
            strokeWidth={1}
            strokeDasharray="4 2"
            opacity={0.7}
          />
        )}

        {/* Candles */}
        {view.slice.map((c, i) => {
          const x = priceToX(i);
          const isUp = c.close >= c.open;
          const color = isUp ? "#3fb950" : "#f85149";
          const yOpen = priceToY(c.open);
          const yClose = priceToY(c.close);
          const yHigh = priceToY(c.high);
          const yLow = priceToY(c.low);
          const bodyTop = Math.min(yOpen, yClose);
          const bodyH = Math.max(1, Math.abs(yClose - yOpen));
          return (
            <g key={i}>
              <line
                x1={x}
                x2={x}
                y1={yHigh}
                y2={yLow}
                stroke={color}
                strokeWidth={1}
                opacity={0.85}
              />
              <rect
                x={x - candleW / 2}
                y={bodyTop}
                width={candleW}
                height={bodyH}
                fill={color}
                opacity={0.9}
              />
            </g>
          );
        })}

        {/* Campaign entry / SL / TP markers (right side) */}
        {campaigns.flatMap((camp, ci) =>
          camp.positions.map((p, pi) => {
            const entryY = priceToY(p.entryPrice);
            const slY = priceToY(p.stopLoss);
            const tpY = priceToY(p.takeProfit);
            const color = camp.direction === "Long" ? "#3fb950" : "#f85149";
            const x = padding.left + plotW - 6 - ci * 14 - pi * 3;
            return (
              <g key={`${ci}-${pi}`}>
                <line x1={padding.left} x2={x} y1={entryY} y2={entryY} stroke={color} strokeWidth={0.5} opacity={0.4} strokeDasharray="2 3" />
                <line x1={padding.left} x2={x - 4} y1={slY} y2={slY} stroke="#f85149" strokeWidth={0.5} opacity={0.3} strokeDasharray="1 3" />
                <line x1={padding.left} x2={x - 4} y1={tpY} y2={tpY} stroke="#3fb950" strokeWidth={0.5} opacity={0.3} strokeDasharray="1 3" />
                <circle cx={x} cy={entryY} r={3} fill={color} stroke="#0a0e14" strokeWidth={1} />
              </g>
            );
          })
        )}

        {/* Timeframe label */}
        <text
          x={padding.left + 4}
          y={padding.top + 12}
          fill="#7d8590"
          fontSize={11}
          fontFamily="var(--font-geist-mono)"
          fontWeight="bold"
        >
          {timeframe}
        </text>

        {/* Legend */}
        <g transform={`translate(${padding.left + 40}, ${padding.top + 8})`}>
          <rect x={0} y={0} width={10} height={6} fill="rgba(63, 185, 80, 0.4)" stroke="rgba(63, 185, 80, 0.6)" strokeWidth={0.5} />
          <text x={14} y={6} fill="#7d8590" fontSize={9} fontFamily="var(--font-geist-mono)">Cloud</text>
          <line x1={50} y1={3} x2={60} y2={3} stroke="#58a6ff" strokeWidth={1} strokeDasharray="3 2" />
          <text x={64} y={6} fill="#7d8590" fontSize={9} fontFamily="var(--font-geist-mono)">Tenkan</text>
          <line x1={104} y1={3} x2={114} y2={3} stroke="#bc8cff" strokeWidth={1} strokeDasharray="3 2" />
          <text x={118} y={6} fill="#7d8590" fontSize={9} fontFamily="var(--font-geist-mono)">Kijun</text>
        </g>
      </svg>
    </div>
  );
}
