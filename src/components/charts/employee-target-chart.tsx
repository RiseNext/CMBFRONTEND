"use client";

import { Bar } from "react-chartjs-2";
import { formatCurrency } from "@/lib/format";
import { gridColor, palette, registerCharts } from "./chart-registry";

registerCharts();

interface Row {
  name: string;
  target: number;
  achieved: number;
}

export function EmployeeTargetChart({ rows }: { rows: Row[] }) {
  return (
    <div className="h-[260px]">
      <Bar
        data={{
          labels: rows.map((row) => row.name.split(" ")[0]),
          datasets: [
            {
              label: "Target",
              data: rows.map((row) => row.target),
              backgroundColor: "rgba(29, 78, 216, 0.18)",
              borderRadius: 4,
              barPercentage: 0.7,
            },
            {
              label: "Achieved",
              data: rows.map((row) => row.achieved),
              backgroundColor: palette.primary,
              borderRadius: 4,
              barPercentage: 0.45,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
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
                  `${context.dataset.label}: ${formatCurrency(Number(context.parsed.x ?? 0), { compact: true })}`,
              },
            },
          },
          scales: {
            x: {
              grid: { color: gridColor },
              border: { display: false },
              ticks: { callback: (value) => formatCurrency(Number(value), { compact: true }) },
            },
            y: { grid: { display: false }, border: { display: false } },
          },
        }}
      />
    </div>
  );
}
