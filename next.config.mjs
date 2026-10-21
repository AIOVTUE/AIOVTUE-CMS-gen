/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@dnd-kit/modifiers",
      "date-fns",
      "recharts",
    ],
  },
  // Next 16 defaults to Turbopack; empty config acknowledges webpack below for --webpack.
  turbopack: {},
  // Local workspace store lives here; rewriting it must not trigger HMR / RSC refresh loops.
  // (Also no-op writes in lib/local-repo/workspace-path.ts.)
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        ...(Array.isArray(config.watchOptions?.ignored)
          ? config.watchOptions.ignored
          : config.watchOptions?.ignored
            ? [config.watchOptions.ignored]
            : []),
        "**/.pagescms/**",
        "**/node_modules/**",
      ],
    };
    return config;
  },
};

export default nextConfig;
