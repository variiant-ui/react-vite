import http from "node:http";
import path from "node:path";

import {
  createVariantDevMiddleware,
  type VariantDevMiddleware,
  type VariantPluginOptions,
} from "./plugin";
import { variantWebpackPlugin } from "./plugin-webpack";

export type VariantNextPluginOptions = VariantPluginOptions;

type NextWebpackContext = {
  dev?: boolean;
  isServer?: boolean;
};

type NextConfig = Record<string, unknown> & {
  webpack?: (config: WebpackConfig, context: NextWebpackContext) => WebpackConfig;
  rewrites?: () => Promise<NextRewrites> | NextRewrites;
};

type WebpackConfig = {
  plugins?: unknown[];
  context?: string;
  mode?: string;
  entry?: unknown;
  resolve?: unknown;
};

type NextRewrite = {
  source: string;
  destination: string;
  basePath?: false;
  locale?: false;
};

type NextRewriteObject = {
  beforeFiles?: NextRewrite[];
  afterFiles?: NextRewrite[];
  fallback?: NextRewrite[];
};

type NextRewrites = NextRewrite[] | NextRewriteObject;

type VariantNextBridge = {
  origin: string;
  server: http.Server;
};

const bridgeByProjectRoot = new Map<string, Promise<VariantNextBridge>>();

export function withVariantNext<Config extends NextConfig>(
  nextConfig: Config = {} as Config,
  options: VariantNextPluginOptions = {},
): Config {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const userWebpack = nextConfig.webpack;
  const userRewrites = nextConfig.rewrites;

  return {
    ...nextConfig,
    webpack(config: WebpackConfig, context: NextWebpackContext): WebpackConfig {
      const nextConfigResult = userWebpack ? userWebpack(config, context) : config;
      if (context.isServer) {
        return nextConfigResult;
      }

      nextConfigResult.plugins = [
        ...(nextConfigResult.plugins ?? []),
        variantWebpackPlugin({
          ...options,
          projectRoot,
        }),
      ];
      return nextConfigResult;
    },
    async rewrites(): Promise<NextRewrites> {
      const existingRewrites = userRewrites ? await userRewrites() : [];
      if (process.env.NODE_ENV === "production") {
        return existingRewrites;
      }

      const bridge = await getOrStartVariantNextBridge(projectRoot, options);
      return mergeVariantRewrite(existingRewrites, {
        source: "/__variiant/:path*",
        destination: `${bridge.origin}/__variiant/:path*`,
        basePath: false,
        locale: false,
      });
    },
  };
}

export const variantNextPlugin = withVariantNext;

function mergeVariantRewrite(existingRewrites: NextRewrites, rewrite: NextRewrite): NextRewrites {
  if (Array.isArray(existingRewrites)) {
    return {
      beforeFiles: [rewrite],
      afterFiles: existingRewrites,
      fallback: [],
    };
  }

  return {
    ...existingRewrites,
    beforeFiles: [
      rewrite,
      ...(existingRewrites.beforeFiles ?? []),
    ],
    afterFiles: existingRewrites.afterFiles ?? [],
    fallback: existingRewrites.fallback ?? [],
  };
}

async function getOrStartVariantNextBridge(
  projectRoot: string,
  options: VariantNextPluginOptions,
): Promise<VariantNextBridge> {
  const bridgeKey = getVariantNextBridgeKey(projectRoot, options);
  const existing = bridgeByProjectRoot.get(bridgeKey);
  if (existing) {
    return existing;
  }

  const created = startVariantNextBridge(projectRoot, options).catch((error) => {
    bridgeByProjectRoot.delete(bridgeKey);
    throw error;
  });
  bridgeByProjectRoot.set(bridgeKey, created);
  return created;
}

function getVariantNextBridgeKey(projectRoot: string, options: VariantNextPluginOptions): string {
  return [
    projectRoot,
    options.variantsDir ?? "",
    options.agentRefresh ?? "",
  ].join("\0");
}

async function startVariantNextBridge(
  projectRoot: string,
  options: VariantNextPluginOptions,
): Promise<VariantNextBridge> {
  const middleware = createVariantDevMiddleware({
    ...options,
    projectRoot,
  });
  const server = http.createServer((req, res) => {
    handleVariantBridgeRequest(middleware, req, res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      server.unref();
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Failed to start the variiant Next.js bridge server.");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    server,
  };
}

function handleVariantBridgeRequest(
  middleware: VariantDevMiddleware,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  middleware(req, res, () => {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
  });
}
