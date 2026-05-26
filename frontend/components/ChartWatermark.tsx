'use client';

import Image from 'next/image';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/**
 * PolicyEngine logo watermark for Recharts charts.
 * Place directly after <ResponsiveContainer> to render
 * a right-aligned logo below the chart (matching app-v2).
 */
export default function ChartWatermark() {
  return (
    <Image
      src={`${basePath}/policyengine-logo-teal.png`}
      alt=""
      aria-hidden="true"
      width={80}
      height={20}
      unoptimized
      style={{
        display: 'block',
        marginLeft: 'auto',
        width: 80,
        height: 'auto',
        opacity: 0.8,
      }}
    />
  );
}
