"use client";

import { Doughnut } from "react-chartjs-2";
import { registerCharts, palette } from "./chart-registry";

registerCharts();

const statusColors: Record<string, string> = {
  Approved: palette.primary,
  Disbursed: palette.success,
  "Under Review": palette.warning,
  Submitted: palette.info,
  Rejected: palette.danger,
  Closed: "#94a3b8",
  Draft: "#cbd5e1",
};

export function LoanStatusChart({ data }: { data: Record<string, number> }) {
  const labels = Object.keys(data);
  const values = Object.values(data);

  return (
    <div className="relative h-[230px]">
      <Doughnut
        data={{
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: labels.map((label) => statusColors[label] ?? palette.purple),
              borderWidth: 0,
              hoverOffset: 8,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          cutout: "68%",
          plugins: {
            legend: {
              position: "right",
              labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, padding: 12 },
            },
            tooltip: {
              backgroundColor: "#0b1f35",
              padding: 10,
              cornerRadius: 8,
              displayColors: false,
              callbacks: {
                label: (context) => `${context.label}: ${context.parsed} applications`,
              },
            },
          },
        }}
      />
    </div>
  );
}
