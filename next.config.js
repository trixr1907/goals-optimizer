/** @type {import('next').NextConfig} */

// Defaults to '/goals' for local/sub-path deployments.
// Set NEXT_PUBLIC_BASE_PATH="" for root-domain deployments such as goals.ivo-tech.com,
// so API routes resolve as /api/import instead of /goals/api/import.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH !== undefined
  ? process.env.NEXT_PUBLIC_BASE_PATH
  : '/goals';

const nextConfig = {
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  typescript: { ignoreBuildErrors: false },
};

module.exports = nextConfig;
