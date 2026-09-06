"use client";

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";

let registered = false;

export function registerCharts() {
  if (registered) return;
  ChartJS.register(
    ArcElement,
    BarElement,
    CategoryScale,
    Filler,
    Legend,
    LinearScale,
    LineElement,
    PointElement,
    Tooltip,
  );
  ChartJS.defaults.font.family =
    "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif";
  ChartJS.defaults.font.size = 11;
  ChartJS.defaults.color = "#5c7291";
  registered = true;
}

export const gridColor = "rgba(15, 28, 48, 0.07)";

export const palette = {
  primary: "#1d4ed8",
  success: "#0f9d58",
  warning: "#c77700",
  danger: "#d64545",
  purple: "#7c3aed",
  info: "#0f7bbd",
};
