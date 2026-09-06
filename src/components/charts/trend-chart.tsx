"use client";

import { Line } from "react-chartjs-2";
import { formatCurrency } from "@/lib/format";
import { gridColor, palette, registerCharts } from "./chart-registry";

registerCharts();

interface Row {
  month: string;
  disbursed: number;
  commission: number;
}

export function TrendChart({ rows }: { rows: Row[] }) {
  return (
    <div className="h-[260px]">
      <Line
        data={{
          labels: rows.map((row) => row.month),
          datasets: [
            {
              label: "Disbursed",
              data: rows.map((row) => row.disbursed),
              borderColor: palette.primary,
              backgroundColor: "rgba(29, 78, 216, 0.12)",
              fill: true,
              tension: 0.35,
              pointRadius: 3,
              pointBackgroundColor: "#fff",
              pointBorderWidth: 2,
              yAxisID: "y",
            },
            {
              label: "Commission",
              data: rows.map((row) => row.commission),
              borderColor: palette.warning,
              backgroundColor: "rgba(199, 119, 0, 0.10)",
              fill: true,
              tension: 0.35,
              pointRadius: 3,
              pointBackgroundColor: "#fff",
              pointBorderWidth: 2,
              yAxisID: "y1",
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: {
              position: "top",
              align: "end",
              labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, padding: 14 },
            },
            tooltip: {
              backgroundColor: "#0b1f35",
              padding: 10,
              cornerRadius: 8,
              callbacks: {
                label: (context) =>
                  `${context.dataset.label}: ${formatCurrency(Number(context.parsed.y ?? 0), { compact: true })}`,
              },
            },
          },
          scales: {
            x: { grid: { display: false }, border: { display: false } },
            y: {
              grid: { color: gridColor },
              border: { display: false },
              ticks: { callback: (value) => formatCurrency(Number(value), { compact: true }) },
            },
            y1: {
              position: "right",
              grid: { display: false },
              border: { display: false },
              ticks: { callback: (value) => formatCurrency(Number(value), { compact: true }) },
            },
          },
        }}
      />
    </div>
  );
}
