export type Metrics = {
  duration_s?: number;
  total_distance_m?: number;
  max_horizontal_speed_mps?: number;
  max_vertical_speed_mps?: number;
  max_acceleration_mps2?: number;
  max_altitude_gain_m?: number;
};

export type TrajectoryPoint = {
  timestamp_s?: number;
  latitude_deg: number;
  longitude_deg: number;
  altitude_m?: number;
  relative_altitude_m?: number;
  east_m?: number;
  north_m?: number;
  up_m?: number;
  speed_mps?: number;
};

export type ParsedPayload = {
  sampling_hz?: {
    gps?: number;
    imu?: number;
  };
  units?: {
    gps?: Record<string, string>;
    imu?: Record<string, string>;
  };
};

export type AnalyzeResponse = {
  filename?: string;
  message_count?: number;
  metrics?: Metrics & { error?: string };
  trajectory_enu?: TrajectoryPoint[];
  plotly_figure?: Record<string, unknown>;
  parsed?: ParsedPayload;
};

export type SummaryResponse = {
  provider: string;
  summary: string;
  recommendations?: string[];
  risk_level?: "low" | "medium" | "high";
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type HistoryItem = {
  id: string;
  user_id?: string | null;
  created_at: string;
  filename?: string | null;
  message_count?: number | null;
  duration_s?: number | null;
  total_distance_m?: number | null;
  max_horizontal_speed_mps?: number | null;
  max_vertical_speed_mps?: number | null;
  max_acceleration_mps2?: number | null;
  max_altitude_gain_m?: number | null;
  has_snapshot?: boolean;
};

export type HistoryResponse = {
  items: HistoryItem[];
};

export type HistoryDetailResponse = HistoryItem & {
  analysis_snapshot?: AnalyzeResponse | null;
};
