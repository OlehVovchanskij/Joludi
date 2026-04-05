export function formatNumber(
  value: number | null | undefined,
  digits = 2,
  emptyValue = "-",
): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return emptyValue;
  }

  return new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: digits,
  }).format(value);
}

export function metricValue(
  value: number | null | undefined,
  suffix: string,
  digits = 2,
  emptyValue = "-",
): string {
  const formatted = formatNumber(value, digits, emptyValue);
  if (formatted === emptyValue) {
    return formatted;
  }

  return `${formatted} ${suffix}`;
}

export function labelValue(
  value: string | number | null | undefined,
  emptyValue = "—",
): string {
  if (value === undefined || value === null || value === "") {
    return emptyValue;
  }

  return String(value);
}

export function formatBytes(bytes: number | undefined): string {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) {
    return "—";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${formatNumber(size, 1, "0")} ${units[unitIndex]}`;
}

export function formatCoordinate(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }

  return value.toFixed(4);
}
