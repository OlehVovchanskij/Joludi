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
  const baseScene =
    typeof layout.scene === "object" && layout.scene
      ? (layout.scene as Record<string, unknown>)
      : {};
  const baseXAxis =
    typeof baseScene.xaxis === "object" && baseScene.xaxis
      ? (baseScene.xaxis as Record<string, unknown>)
      : {};
  const baseYAxis =
    typeof baseScene.yaxis === "object" && baseScene.yaxis
      ? (baseScene.yaxis as Record<string, unknown>)
      : {};
  const baseZAxis =
    typeof baseScene.zaxis === "object" && baseScene.zaxis
      ? (baseScene.zaxis as Record<string, unknown>)
      : {};

  const plotData = [...(data as Array<Record<string, unknown>>)] as Array<
    Record<string, unknown>
  >;
  if (activePoint) {
    plotData.push({
      type: "scatter3d",
      mode: "markers",
      x: [activePoint.east_m],
      y: [activePoint.north_m],
      z: [activePoint.up_m],
      marker: { size: 6, color: "#d08a4b" },
      name: "Current",
    });
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-line/70 bg-surface shadow-[0_14px_44px_rgba(20,33,29,0.08)]">
      <Plot
        data={plotData}
        layout={{
          autosize: true,
          height: 460,
          ...layout,
          paper_bgcolor: "rgba(255, 253, 248, 0.96)",
          plot_bgcolor: "rgba(255, 253, 248, 0.96)",
          margin: { l: 14, r: 14, t: 44, b: 14 },
          font: { family: "var(--font-geist-sans)", color: "#1b2321" },
          scene: {
            ...baseScene,
            bgcolor: "rgba(255, 253, 248, 0.96)",
            xaxis: {
              backgroundcolor: "rgba(255, 253, 248, 0.96)",
              gridcolor: "rgba(27, 35, 33, 0.08)",
              zerolinecolor: "rgba(27, 35, 33, 0.2)",
              ...baseXAxis,
            },
            yaxis: {
              backgroundcolor: "rgba(255, 253, 248, 0.96)",
              gridcolor: "rgba(27, 35, 33, 0.08)",
              zerolinecolor: "rgba(27, 35, 33, 0.2)",
              ...baseYAxis,
            },
            zaxis: {
              backgroundcolor: "rgba(255, 253, 248, 0.96)",
              gridcolor: "rgba(27, 35, 33, 0.08)",
              zerolinecolor: "rgba(27, 35, 33, 0.2)",
              ...baseZAxis,
            },
          },
        }}
        config={{ responsive: true, displaylogo: false }}
        style={{ width: "100%", height: "100%", minHeight: 460 }}
      />
    </div>
  );
}
