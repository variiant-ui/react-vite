export function formatCanvasGroupLabel(sourceId: string): string {
  const [filePath, namedExport] = sourceId.split("#");
  const fileName = filePath?.split("/").filter(Boolean).at(-1) ?? sourceId;
  if (!namedExport) {
    return fileName;
  }

  return `${fileName} -> ${namedExport}`;
}

export function escapeAttributeValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function getRenderableComponentRect(
  boundary: HTMLElement,
): { left: number; top: number; width: number; height: number } | null {
  const boundaryRect = boundary.getBoundingClientRect();
  if (boundaryRect.width >= 1 && boundaryRect.height >= 1) {
    return {
      left: boundaryRect.left,
      top: boundaryRect.top,
      width: Math.max(1, Math.round(boundaryRect.width)),
      height: Math.max(1, Math.round(boundaryRect.height)),
    };
  }

  const descendantRects = Array.from(boundary.querySelectorAll<HTMLElement>("*"))
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width >= 1 && rect.height >= 1);

  if (descendantRects.length === 0) {
    return null;
  }

  const left = Math.min(...descendantRects.map((rect) => rect.left));
  const top = Math.min(...descendantRects.map((rect) => rect.top));
  const right = Math.max(...descendantRects.map((rect) => rect.right));
  const bottom = Math.max(...descendantRects.map((rect) => rect.bottom));

  return {
    left,
    top,
    width: Math.max(1, Math.round(right - left)),
    height: Math.max(1, Math.round(bottom - top)),
  };
}
