"use client";

import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer } from "react-leaflet";

type TrajectoryMapProps = {
  points: Array<[number, number]>;
  activeIndex?: number;
};

export default function TrajectoryMap({
  points,
  activeIndex,
}: TrajectoryMapProps) {
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
      <div className="absolute left-4 top-4 z-[500] rounded-full border border-line/70 bg-surface/90 px-3 py-1 text-xs font-semibold text-foreground/70 shadow-lg backdrop-blur-md">
        OpenStreetMap route playback
      </div>
      <div className="absolute right-4 top-4 z-[500] flex gap-2 text-xs font-medium text-foreground/70">
        <span className="rounded-full border border-line/70 bg-surface/90 px-3 py-1 shadow-lg backdrop-blur-md">
          Start
        </span>
        <span className="rounded-full border border-line/70 bg-surface/90 px-3 py-1 shadow-lg backdrop-blur-md">
          Finish
        </span>
      </div>
      <MapContainer bounds={bounds} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline
          positions={visiblePoints}
          pathOptions={{ color: "#0f766e", weight: 4, opacity: 0.85 }}
        />
        <CircleMarker
          center={startPoint}
          radius={7}
          pathOptions={{
            color: "#2563eb",
            fillColor: "#2563eb",
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
          <CircleMarker
            center={activePoint}
            radius={8}
            pathOptions={{
              color: "#c9723b",
              fillColor: "#c9723b",
              fillOpacity: 1,
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
