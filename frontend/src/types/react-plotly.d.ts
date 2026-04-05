declare module "react-plotly.js" {
  import * as React from "react";

  const Plot: React.ComponentType<{
    data?: unknown;
    layout?: unknown;
    config?: unknown;
    style?: React.CSSProperties;
    className?: string;
  }>;

  export default Plot;
}
