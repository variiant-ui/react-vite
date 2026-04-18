import "@testing-library/jest-dom/vitest";
import { TextDecoder, TextEncoder } from "node:util";
import { beforeEach, vi } from "vitest";

Object.defineProperty(globalThis, "TextEncoder", {
  configurable: true,
  writable: true,
  value: TextEncoder,
});

Object.defineProperty(globalThis, "TextDecoder", {
  configurable: true,
  writable: true,
  value: TextDecoder,
});

const encodedBytes = new TextEncoder().encode("");
if (!(encodedBytes instanceof Uint8Array)) {
  Object.defineProperty(globalThis, "Uint8Array", {
    configurable: true,
    writable: true,
    value: encodedBytes.constructor,
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/__variiant/config")) {
      return new Response(JSON.stringify({
        token: "test-token",
        agent: {
          enabled: false,
          commandLabel: null,
          message: "Local agent bridge unavailable in tests.",
          streaming: null,
          supportsImages: false,
        },
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    return new Response(JSON.stringify({
      error: "Unhandled test fetch request.",
    }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }));
});
