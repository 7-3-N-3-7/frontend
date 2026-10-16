import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Fix WebSocket (HMR) connection errors for custom local domains
  // @ts-ignore - Some TS versions might not have this typed yet
  allowedDevOrigins: ['127.0.0.1.nip.io', 'platform.127.0.0.1.nip.io', '127.0.0.1', 'localhost'],
};

export default withNextIntl(nextConfig);
