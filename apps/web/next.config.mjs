/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship TypeScript source, so Next has to compile them.
  transpilePackages: ["@mtg-tutor/core", "@mtg-tutor/backend"],
};

export default nextConfig;
