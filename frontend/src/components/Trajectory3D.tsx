"use client";

import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

type Trajectory3DProps = {
  figure: Record<string, unknown> | null;
  activePoint?: { east_m: number; north_m: number; up_m: number } | null;
};

export default function Trajectory3D({
  figure,
  activePoint,
}: Trajectory3DProps) {
  if (!figure) {
    return (
      <div className="rounded-3xl border border-dashed border-line bg-surface-soft/70 p-6 text-sm text-foreground/60">
        3D візуалізація зʼявиться після аналізу логу.
      </div>
    );
  }

  const data = Array.isArray(figure.data) ? figure.data : [];
  const layout = (figure.layout as Record<string, unknown> | undefined) ?? {};

  const plotData = [...(data as Plotly.Data[])];
  if (activePoint) {
    plotData.push({
      type: "scatter3d",
      mode: "markers",
      x: [activePoint.east_m],
      y: [activePoint.north_m],
      z: [activePoint.up_m],
      marker: { size: 6, color: "#c9723b" },
      name: "Current",
    } as Plotly.Data);
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-line/70 bg-surface shadow-[0_14px_44px_rgba(20,33,29,0.08)]">
      <Plot
        data={plotData}
        layout={{
          autosize: true,
          height: 460,
          paper_bgcolor: "#ffffff",
          plot_bgcolor: "#ffffff",
          margin: { l: 14, r: 14, t: 44, b: 14 },
          font: { family: "var(--font-geist-sans)", color: "#14211d" },
          ...layout,
        }}
        config={{ responsive: true, displaylogo: false }}
        style={{ width: "100%", height: "100%", minHeight: 460 }}
      />
    </div>
  );
}
