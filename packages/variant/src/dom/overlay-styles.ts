export type ToolbarButtonKind = "comment" | "sketch";

export const variantOverlayZIndex = 2147483647;

// Override these from DevTools or host-page CSS using
// [data-variant-overlay-root] or [data-variant-toolbar-shell].
// Example: --variiant-toolbar-width, --variiant-toolbar-bottom,
// --variiant-toolbar-height, --variiant-toolbar-shadow.

export function hudShellStyle(): string {
  return [
    "position:fixed",
    "left:50%",
    "bottom:var(--variiant-toolbar-bottom,18px)",
    "transform:translateX(-50%)",
    `z-index:${variantOverlayZIndex}`,
    "width:var(--variiant-toolbar-width,min(980px,calc(100vw - 24px)))",
    "pointer-events:none",
    "font-family:Inter,'Avenir Next','Helvetica Neue',ui-sans-serif,system-ui,sans-serif",
    "color:#111827",
  ].join(";");
}

export function toolbarSceneStyle(visible: boolean): string {
  return [
    "position:relative",
    "display:flex",
    "align-items:flex-end",
    "justify-content:center",
    "gap:var(--variiant-toolbar-gap,0px)",
    "width:100%",
    visible ? "opacity:1" : "opacity:0",
    visible ? "transform:translateY(0)" : "transform:translateY(10px)",
    "transition:opacity 180ms ease, transform 180ms ease",
  ].join(";");
}

export function tabRailStyle(): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "align-self:flex-end",
    "min-height:var(--variiant-toolbar-height,52px)",
    "padding:6px 8px",
    "background:#ffffff",
    "border:1px solid rgba(0,0,0,0.10)",
    "border-right:none",
    "border-top-left-radius:12px",
    "border-bottom-left-radius:12px",
    "box-shadow:var(--variiant-toolbar-shadow,0 1px 1px rgba(0,0,0,0.08))",
    "pointer-events:auto",
    "flex-shrink:0",
  ].join(";");
}

export function tabButtonStyle(active: boolean): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "min-height:32px",
    "padding:0 12px",
    "border:none",
    "border-radius:6px",
    active ? "background:#ffffff" : "background:transparent",
    active ? "box-shadow:0 0 0 1px rgba(0,0,0,0.06) inset" : "box-shadow:none",
    active ? "opacity:1" : "opacity:0.72",
    "color:#111111",
    "font-size:13px",
    "font-weight:500",
    "letter-spacing:-0.01em",
    "cursor:pointer",
    "transition:background 150ms ease, opacity 150ms ease",
  ].join(";");
}

export function panelShellStyle(visible: boolean): string {
  return [
    "flex:1 1 var(--variiant-toolbar-panel-min-width,420px)",
    "min-width:min(var(--variiant-toolbar-panel-min-width,420px),100%)",
    "max-width:100%",
    "pointer-events:auto",
    visible ? "opacity:1" : "opacity:0",
    visible ? "transform:translateY(0)" : "transform:translateY(8px)",
    "transition:opacity 180ms ease, transform 180ms ease",
  ].join(";");
}

export function panelFrameStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "justify-content:center",
    "min-height:var(--variiant-toolbar-height,52px)",
    "padding:8px",
    "background:#ffffff",
    "border-top:1px solid rgba(0,0,0,0.10)",
    "border-right:1px solid rgba(0,0,0,0.10)",
    "border-bottom:1px solid rgba(0,0,0,0.10)",
    "border-top-right-radius:12px",
    "border-bottom-right-radius:12px",
    "box-shadow:var(--variiant-toolbar-shadow,0 1px 1px rgba(0,0,0,0.08))",
    "overflow:hidden",
  ].join(";");
}

export function composerRowStyle(): string {
  return [
    "display:flex",
    "align-items:flex-end",
    "min-width:0",
  ].join(";");
}

export function promptToolRailStyle(): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "gap:4px",
    "padding:4px",
    "background:rgba(4,4,4,0.06)",
    "border-radius:6px",
  ].join(";");
}

export function promptToolButtonStyle(active: boolean): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "width:32px",
    "height:32px",
    "padding:4px",
    "border:none",
    "border-radius:6px",
    active ? "background:#ffffff" : "background:transparent",
    active ? "opacity:1" : "opacity:0.6",
    "cursor:pointer",
    "transition:background 150ms ease, opacity 150ms ease",
  ].join(";");
}

export function promptToolIconStyle(kind: ToolbarButtonKind, active: boolean): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "width:24px",
    "height:24px",
    active ? "opacity:1" : "opacity:0.6",
    kind === "sketch" ? "color:#c00404" : "color:#111111",
  ].join(";");
}

export function promptColumnStyle(): string {
  return [
    "flex:1 1 auto",
    "min-width:0",
    "display:flex",
    "flex-direction:column",
    "gap:6px",
  ].join(";");
}

export function promptInputSurfaceStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:6px",
    "min-width:0",
    "padding:4px 8px",
    "background:#ffffff",
    "border-radius:6px",
  ].join(";");
}

export function promptInputRowStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "min-height:28px",
    "min-width:0",
  ].join(";");
}

export function textareaStyle(): string {
  return [
    "width:100%",
    "min-height:20px",
    "max-height:216px",
    "border:none",
    "background:linear-gradient(180deg, #ffffff 0%, #f7f7f7 100%)",
    "color:rgba(0,0,0,0.86)",
    "padding:0",
    "font-size:14px",
    "font-weight:500",
    "line-height:20px",
    "resize:none",
    "outline:none",
    "box-sizing:border-box",
    "overflow:hidden",
    "font-family:Inter,'Avenir Next','Helvetica Neue',ui-sans-serif,system-ui,sans-serif",
  ].join(";");
}

export function attachmentTabsStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "gap:6px",
    "flex-wrap:wrap",
  ].join(";");
}

export function attachmentChipStyle(kind: "comment" | "sketch"): string {
  const palette = kind === "comment"
    ? {
        background: "rgba(17,17,17,0.06)",
        border: "rgba(17,17,17,0.10)",
        color: "#111111",
      }
    : {
        background: "rgba(192,4,4,0.08)",
        border: "rgba(192,4,4,0.12)",
        color: "#c00404",
      };

  return [
    "display:inline-flex",
    "align-items:center",
    "gap:6px",
    "min-height:24px",
    "padding:0 8px",
    "border-radius:999px",
    `background:${palette.background}`,
    `border:1px solid ${palette.border}`,
    `color:${palette.color}`,
  ].join(";");
}

export function attachmentLabelStyle(): string {
  return [
    "font-size:11px",
    "font-weight:600",
    "line-height:1.2",
  ].join(";");
}

export function attachmentClearStyle(): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "width:16px",
    "height:16px",
    "padding:0",
    "border:none",
    "border-radius:999px",
    "background:rgba(255,255,255,0.82)",
    "color:inherit",
    "font-size:11px",
    "line-height:1",
    "cursor:pointer",
  ].join(";");
}

export function sendButtonStyle(disabled: boolean): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "width:28px",
    "height:28px",
    "padding:2px",
    "border:none",
    "border-radius:999px",
    disabled ? "background:#c8cdd8" : "background:#213cd5",
    "color:#ffffff",
    disabled ? "cursor:not-allowed" : "cursor:pointer",
    "flex-shrink:0",
    "transition:background 150ms ease",
  ].join(";");
}

export function presentSelectGridStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "flex-wrap:wrap",
  ].join(";");
}

export function presentBodyStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:8px",
  ].join(";");
}

export function selectStyle(): string {
  return [
    "flex:1 1 200px",
    "min-width:0",
    "max-width:100%",
    "height:36px",
    "border:1px solid rgba(0,0,0,0.10)",
    "border-radius:8px",
    "background:#ffffff",
    "color:#111111",
    "padding:0 12px",
    "font-size:13px",
    "font-weight:500",
    "outline:none",
  ].join(";");
}

export function metaTextStyle(): string {
  return [
    "font-size:12px",
    "line-height:1.45",
    "color:#6b7280",
  ].join(";");
}

export function hintTextStyle(): string {
  return [
    "font-size:12px",
    "line-height:1.5",
    "color:#6b7280",
  ].join(";");
}

export function sectionCardStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:8px",
    "padding:10px",
    "border-radius:10px",
    "background:rgba(249,250,251,0.96)",
    "border:1px solid rgba(15,23,42,0.08)",
  ].join(";");
}

export function stackStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:8px",
  ].join(";");
}

export function reviewCardStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:6px",
    "padding:10px",
    "border-radius:10px",
    "background:#ffffff",
    "border:1px solid rgba(15,23,42,0.08)",
  ].join(";");
}

export function reviewResultTitleStyle(): string {
  return [
    "font-size:13px",
    "font-weight:700",
    "line-height:1.4",
    "color:#111827",
  ].join(";");
}

export function textInputStyle(): string {
  return [
    "width:100%",
    "height:36px",
    "border:1px solid rgba(0,0,0,0.10)",
    "border-radius:8px",
    "background:#ffffff",
    "color:#111111",
    "padding:0 12px",
    "font-size:13px",
    "outline:none",
    "box-sizing:border-box",
  ].join(";");
}

export function buttonRowStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "justify-content:flex-end",
    "gap:8px",
    "flex-wrap:wrap",
  ].join(";");
}

export function buttonStyle(kind: "primary" | "secondary" | "disabled"): string {
  if (kind === "disabled") {
    return [
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "height:32px",
      "padding:0 12px",
      "border:none",
      "border-radius:8px",
      "background:#e5e7eb",
      "color:#9ca3af",
      "font-size:12px",
      "font-weight:700",
      "cursor:not-allowed",
    ].join(";");
  }

  const palette = kind === "primary"
    ? {
        background: "#111827",
        color: "#ffffff",
        border: "none",
      }
    : {
        background: "#ffffff",
        color: "#374151",
        border: "1px solid rgba(15,23,42,0.12)",
      };

  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "height:32px",
    "padding:0 12px",
    `border:${palette.border}`,
    "border-radius:8px",
    `background:${palette.background}`,
    `color:${palette.color}`,
    "font-size:12px",
    "font-weight:700",
    "cursor:pointer",
  ].join(";");
}
