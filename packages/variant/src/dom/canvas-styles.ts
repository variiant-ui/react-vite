export const variantCanvasZIndex = 2147483646;

export function canvasRootStyle(): string {
  return [
    "position:fixed",
    "inset:0",
    `z-index:${variantCanvasZIndex}`,
    "display:flex",
    "flex-direction:column",
    "background-image:radial-gradient(circle at 1px 1px, rgba(148,163,184,0.35) 1px, transparent 0)",
    "background-size:24px 24px",
    "background-color:#f8fafc",
    "color:#0f172a",
    'font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
  ].join(";");
}

export function canvasChromeStyle(): string {
  return [
    "display:grid",
    "grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)",
    "align-items:center",
    "gap:16px",
    "padding:18px 24px 14px",
    "background:rgba(255,255,255,0.94)",
    "border-bottom:1px solid rgba(148,163,184,0.22)",
  ].join(";");
}

export function canvasTitleStyle(): string {
  return [
    "font-size:14px",
    "font-weight:700",
    "letter-spacing:0.01em",
  ].join(";");
}

export function canvasTabsStyle(): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "justify-self:center",
    "gap:6px",
    "padding:6px",
    "border-radius:999px",
    "background:rgba(226,232,240,0.92)",
  ].join(";");
}

export function canvasModeButtonStyle(): string {
  return [
    "height:34px",
    "padding:0 14px",
    "border:none",
    "border-radius:999px",
    "background:transparent",
    "color:#475569",
    "font-size:13px",
    "font-weight:700",
    "cursor:pointer",
  ].join(";");
}

export function canvasModeButtonActiveStyle(): string {
  return [
    "height:34px",
    "padding:0 14px",
    "border:none",
    "border-radius:999px",
    "background:#ffffff",
    "color:#0f172a",
    "font-size:13px",
    "font-weight:700",
    "cursor:pointer",
  ].join(";");
}

export function canvasActionsStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "justify-content:flex-end",
    "gap:10px",
    "min-width:0",
  ].join(";");
}

export function canvasSelectStyle(): string {
  return [
    "min-width:260px",
    "max-width:min(36vw,480px)",
    "height:36px",
    "border:1px solid rgba(203,213,225,1)",
    "border-radius:12px",
    "background:#ffffff",
    "padding:0 12px",
    "font-size:13px",
    "color:#0f172a",
    "outline:none",
  ].join(";");
}

export function canvasSecondaryButtonStyle(): string {
  return [
    "height:36px",
    "padding:0 14px",
    "border:1px solid rgba(203,213,225,1)",
    "border-radius:12px",
    "background:#ffffff",
    "color:#334155",
    "font-size:13px",
    "font-weight:700",
    "cursor:pointer",
  ].join(";");
}

export function canvasPrimaryButtonStyle(): string {
  return [
    "height:36px",
    "padding:0 14px",
    "border:none",
    "border-radius:12px",
    "background:#0f172a",
    "color:#f8fafc",
    "font-size:13px",
    "font-weight:700",
    "cursor:pointer",
  ].join(";");
}

export function canvasViewportStyle(): string {
  return [
    "position:relative",
    "flex:1",
    "overflow:hidden",
    "touch-action:none",
    "cursor:grab",
    "user-select:none",
    "-webkit-user-select:none",
  ].join(";");
}

export function canvasStageStyle(): string {
  return [
    "position:absolute",
    "left:0",
    "top:0",
    "transform-origin:0 0",
    "will-change:transform",
    "padding:96px",
    "user-select:none",
    "-webkit-user-select:none",
  ].join(";");
}

export function canvasContentStyle(): string {
  return [
    "display:block",
    "min-width:max-content",
    "user-select:none",
    "-webkit-user-select:none",
  ].join(";");
}

export function canvasEmptyStateStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "min-width:720px",
    "min-height:360px",
    "padding:48px",
    "border:2px dashed rgba(148,163,184,0.45)",
    "border-radius:28px",
    "background:rgba(255,255,255,0.72)",
    "color:#475569",
    "font-size:15px",
    "font-weight:600",
  ].join(";");
}

export function canvasGroupsRowStyle(): string {
  return [
    "display:flex",
    "align-items:flex-start",
    "gap:88px",
    "min-width:max-content",
  ].join(";");
}

export function canvasGroupStyle(width: number): string {
  return [
    "position:relative",
    `width:${width}px`,
    "padding:18px 14px 14px",
    "border:1px solid rgba(203,213,225,0.9)",
    "background:rgba(255,255,255,0.72)",
  ].join(";");
}

export function canvasGroupLabelStyle(): string {
  return [
    "position:absolute",
    "left:10px",
    "top:-12px",
    "display:inline-flex",
    "align-items:center",
    "padding:2px 8px",
    "border:1px solid rgba(203,213,225,0.9)",
    "background:rgba(248,250,252,0.96)",
    "color:#334155",
    "font-size:14px",
    "font-weight:600",
    "line-height:1.2",
    "white-space:nowrap",
    "transform-origin:top left",
    "transform:scale(calc(1 / var(--variiant-canvas-zoom, 1)))",
    "pointer-events:none",
  ].join(";");
}

export function canvasVariantStackStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:18px",
  ].join(";");
}

export function canvasVariantTileStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:8px",
  ].join(";");
}

export function canvasVariantTileHeaderStyle(): string {
  return [
    "font-size:12px",
    "font-weight:600",
    "color:#64748b",
    "pointer-events:none",
  ].join(";");
}

export function canvasVariantSlotStyle(height: number): string {
  return [
    `min-height:${height}px`,
    "border:1px solid rgba(226,232,240,1)",
    "background:#ffffff",
    "padding:14px",
    "overflow:hidden",
  ].join(";");
}

export function canvasPagesRowStyle(): string {
  return [
    "display:flex",
    "align-items:flex-start",
    "gap:64px",
    "min-width:max-content",
  ].join(";");
}

export function canvasPageTileStyle(): string {
  return [
    "position:relative",
    "width:420px",
    "padding:18px 14px 14px",
    "border:1px solid rgba(203,213,225,0.9)",
    "background:rgba(255,255,255,0.72)",
  ].join(";");
}

export function canvasPageFrameStyle(): string {
  return [
    "display:flex",
    "align-items:flex-start",
    "justify-content:center",
    "min-height:700px",
    "border:1px solid rgba(226,232,240,1)",
    "background:#ffffff",
    "padding:12px",
    "overflow:hidden",
  ].join(";");
}

export function canvasPageContentStyle(width: number, height: number): string {
  const scale = Math.min(396 / Math.max(width, 1), 676 / Math.max(height, 1), 1);
  const scaledWidth = Math.max(1, Math.round(width * scale));
  const scaledHeight = Math.max(1, Math.round(height * scale));
  return [
    `width:${width}px`,
    `height:${height}px`,
    `transform:scale(${scale})`,
    "transform-origin:top left",
    "overflow:hidden",
    `margin-right:-${Math.max(0, width - scaledWidth)}px`,
    `margin-bottom:-${Math.max(0, height - scaledHeight)}px`,
    `min-width:${scaledWidth}px`,
    `min-height:${scaledHeight}px`,
  ].join(";");
}

export function canvasPagePreviewBodyStyle(width: number, height: number): string {
  return [
    "display:block",
    `width:${width}px`,
    `height:${height}px`,
    "background:#ffffff",
    "overflow:hidden",
    "pointer-events:none",
    "user-select:none",
  ].join(";");
}

export function canvasPagePlaceholderStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "width:100%",
    "min-height:640px",
    "border:2px dashed rgba(148,163,184,0.45)",
    "border-radius:16px",
    "color:#64748b",
    "font-size:13px",
    "font-weight:700",
    "background:rgba(255,255,255,0.72)",
  ].join(";");
}
