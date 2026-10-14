import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // File uploads (documents, compliance files) go through server actions,
      // whose default body limit is 1 MB. Vercel rejects any function request
      // over 4.5 MB, so that is the real ceiling — MAX_UPLOAD_BYTES in
      // src/lib/upload-limits.ts sits just under it to leave room for the
      // multipart overhead.
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
