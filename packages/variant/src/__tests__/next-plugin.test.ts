import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { withVariantNext } from "../plugin-next";

function requestJson(url: string): Promise<{
  statusCode: number;
  body: Record<string, unknown>;
}> {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode ?? 0,
          body: JSON.parse(body) as Record<string, unknown>,
        });
      });
    }).on("error", reject);
  });
}

describe("withVariantNext", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("adds the Webpack adapter only to the Next.js client compiler", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variiant-next-webpack-"));
    const config = withVariantNext({
      webpack(nextConfig) {
        nextConfig.plugins = ["existing"];
        return nextConfig;
      },
    }, {
      projectRoot,
    });

    const clientConfig = config.webpack?.({ plugins: [] }, { dev: true, isServer: false });
    expect(clientConfig?.plugins).toHaveLength(2);
    expect(clientConfig?.plugins?.[0]).toBe("existing");
    expect(clientConfig?.plugins?.[1]).toMatchObject({
      apply: expect.any(Function),
    });

    const serverConfig = config.webpack?.({ plugins: [] }, { dev: true, isServer: true });
    expect(serverConfig?.plugins).toEqual(["existing"]);
  });

  it("adds a hidden dev rewrite to the internal variiant bridge", async () => {
    process.env.NODE_ENV = "development";
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variiant-next-rewrite-"));
    const config = withVariantNext({
      async rewrites() {
        return [
          {
            source: "/docs/:path*",
            destination: "/documentation/:path*",
          },
        ];
      },
    }, {
      projectRoot,
    });

    const rewrites = await config.rewrites?.();
    expect(rewrites).toEqual({
      beforeFiles: [
        expect.objectContaining({
          source: "/__variiant/:path*",
          basePath: false,
          locale: false,
        }),
      ],
      afterFiles: [
        {
          source: "/docs/:path*",
          destination: "/documentation/:path*",
        },
      ],
      fallback: [],
    });

    const destination = (rewrites as {
      beforeFiles: Array<{ destination: string }>;
    }).beforeFiles[0]!.destination;
    const response = await requestJson(destination.replace(":path*", "config"));
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      token: expect.any(String),
      agent: expect.objectContaining({
        enabled: false,
      }),
    }));
  });

  it("preserves production rewrites without starting the dev bridge", async () => {
    process.env.NODE_ENV = "production";
    const config = withVariantNext({
      async rewrites() {
        return {
          beforeFiles: [
            {
              source: "/health",
              destination: "/api/health",
            },
          ],
        };
      },
    });

    await expect(config.rewrites?.()).resolves.toEqual({
      beforeFiles: [
        {
          source: "/health",
          destination: "/api/health",
        },
      ],
    });
  });
});
