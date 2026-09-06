"use client";

import { Bar } from "react-chartjs-2";
import { formatCurrency } from "@/lib/format";
import { gridColor, palette, registerCharts } from "./chart-registry";

registerCharts();

interface Row {
  bank: string;
  volume: number;
  commission: number;
}

export function BankPerformanceChart({ rows }: { rows: Row[] }) {
  return (
    <div className="h-[260px]">
      <Bar
        data={{
          labels: rows.map((row) => row.bank),
          datasets: [
            {
              label: "Disbursed volume",
              data: rows.map((row) => row.volume),
              backgroundColor: palette.primary,
              borderRadius: 4,
              barPercentage: 0.55,
            },
            {
              label: "Commission earned",
              data: rows.map((row) => row.commission),
              backgroundColor: palette.success,
              borderRadius: 4,
              barPercentage: 0.55,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
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
          },
        }}
      />
    </div>
  );
}
