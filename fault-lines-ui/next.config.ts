import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { NextConfig } from "next";

// The pipeline decides which program is the default, so the bare URL follows
// it rather than a slug hard-coded here.
const index = JSON.parse(
  readFileSync(join(process.cwd(), "src", "data", "programs", "index.json"), "utf8"),
) as { default: string };

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      // Temporary, not permanent: browsers cache 308s aggressively, and the
      // default program is expected to change.
      { source: "/", destination: `/${index.default}`, permanent: false },
    ];
  },
};

export default nextConfig;
