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
      <div className="rounded-3xl border border-dashed border-line bg-[linear-gradient(180deg,rgba(255,253,248,0.9)_0%,rgba(242,235,226,0.9)_100%)] p-6 text-sm text-foreground/60 shadow-[0_12px_28px_rgba(27,35,33,0.06)]">
        3D-візуалізація зʼявиться після аналізу. Поки що доступна карта та
        метрики польоту.
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
    <div className="overflow-hidden rounded-3xl border border-line/70 bg-[linear-gradient(180deg,rgba(255,253,248,0.96)_0%,rgba(242,235,226,0.9)_100%)] shadow-[0_14px_44px_rgba(20,33,29,0.08)]">
      <div className="flex items-center justify-between border-b border-line/60 px-4 py-3 text-xs uppercase tracking-[0.16em] text-foreground/50">
        <span>ENU 3D</span>
        <span>
          {activePoint ? "Активна точка показана" : "Без активної точки"}
        </span>
      </div>
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
