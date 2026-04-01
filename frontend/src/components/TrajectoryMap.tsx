"use client";

import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer } from "react-leaflet";

type TrajectoryMapProps = {
  points: Array<[number, number]>;
  activeIndex?: number;
  activeMeta?: {
    time_s: number;
    speed_mps?: number;
    altitude_m?: number;
  } | null;
};

function formatNumber(value: number | undefined, digits = 1): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: digits,
  }).format(value);
}

export default function TrajectoryMap({
  points,
  activeIndex,
  activeMeta,
}: TrajectoryMapProps) {
  const mapKey = useMemo(() => {
    if (points.length === 0) {
      return "empty";
    }
    const first = points[0];
    const last = points[points.length - 1];
    return [
      points.length,
      first[0].toFixed(5),
      first[1].toFixed(5),
      last[0].toFixed(5),
      last[1].toFixed(5),
    ].join(":");
  }, [points]);
  const visiblePoints = useMemo(() => {
    if (activeIndex === undefined || activeIndex < 0) {
      return points;
    }
    return points.slice(0, Math.min(activeIndex + 1, points.length));
  }, [points, activeIndex]);

  if (points.length === 0) {
    return null;
  }

  const bounds = points;
  const startPoint = points[0];
  const endPoint = points[points.length - 1];
  const activePoint =
    activeIndex !== undefined && activeIndex >= 0
      ? points[Math.min(activeIndex, points.length - 1)]
      : null;

  return (
    <div className="relative h-[460px] w-full overflow-hidden rounded-3xl border border-line/70 bg-surface shadow-[0_14px_44px_rgba(20,33,29,0.08)]">
      <div className="absolute left-4 top-4 z-[500] rounded-full border border-line/70 bg-surface/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-foreground/65 shadow-lg backdrop-blur-md">
        OpenStreetMap track
      </div>
      <div className="absolute right-4 top-4 z-[500] flex gap-2 text-xs font-medium text-foreground/70">
        <span className="rounded-full border border-line/70 bg-surface/90 px-3 py-1 shadow-lg backdrop-blur-md">
          Launch
        </span>
        <span className="rounded-full border border-line/70 bg-surface/90 px-3 py-1 shadow-lg backdrop-blur-md">
          Landing
        </span>
      </div>
      {activeMeta && activePoint && (
        <div className="absolute bottom-4 left-4 z-[500] rounded-2xl border border-line/70 bg-surface/90 px-3 py-2 text-xs text-foreground/70 shadow-lg backdrop-blur-md">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
            Live point
          </p>
          <div className="mt-1 flex flex-wrap gap-3">
            <span>t+{formatNumber(activeMeta.time_s, 1)}s</span>
            <span>{formatNumber(activeMeta.speed_mps, 1)} m/s</span>
            <span>{formatNumber(activeMeta.altitude_m, 1)} m</span>
          </div>
        </div>
      )}
      <MapContainer
        key={mapKey}
        bounds={bounds}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline
          positions={points}
          pathOptions={{ color: "#94a3b8", weight: 3, opacity: 0.35 }}
        />
        <Polyline
          positions={visiblePoints}
          pathOptions={{ color: "#0b5d57", weight: 4, opacity: 0.9 }}
        />
        <CircleMarker
          center={startPoint}
          radius={7}
          pathOptions={{
            color: "#1d4ed8",
            fillColor: "#1d4ed8",
            fillOpacity: 1,
          }}
        />
        <CircleMarker
          center={endPoint}
          radius={7}
          pathOptions={{
            color: "#dc2626",
            fillColor: "#dc2626",
            fillOpacity: 1,
          }}
        />
        {activePoint && (
          <>
            <CircleMarker
              center={activePoint}
              radius={14}
              pathOptions={{
                color: "#d08a4b",
                fillColor: "#d08a4b",
                fillOpacity: 0.25,
              }}
            />
            <CircleMarker
              center={activePoint}
              radius={8}
              pathOptions={{
                color: "#d08a4b",
                fillColor: "#d08a4b",
                fillOpacity: 1,
              }}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}
