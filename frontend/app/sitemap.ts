import type { MetadataRoute } from 'next';

const CANONICAL_URL =
  'https://policyengine.org/us/missouri-income-tax-elimination';

/**
 * Static sitemap pointing at the canonical PolicyEngine-hosted version.
 * (A previous host-aware variant used next/headers, which forced sitemap.xml
 * to be server-rendered on demand and broke the Vercel static deployment.)
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: CANONICAL_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
