"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { yen } from "@/lib/format";

export interface MonthPoint {
  month: string; // yyyy-MM
  label: string; // 表示ラベル
  amount: number;
}

export function RevenueChart({ data }: { data: MonthPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickFormatter={(v: number) => (v >= 10000 ? `${Math.round(v / 10000)}万` : String(v))}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as MonthPoint;
              return (
                <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
                  <div className="text-muted-foreground">{p.label}</div>
                  <div className="font-medium tabular-nums">{yen(p.amount)}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="amount" fill="var(--viz-series-1)" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
