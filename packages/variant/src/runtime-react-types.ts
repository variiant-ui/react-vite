import type { ComponentType } from "react";

export type ProxyDefinition<Props extends object> = {
  sourceId: string;
  displayName: string;
  selected: string;
  variants: Record<string, ComponentType<Props>>;
};
