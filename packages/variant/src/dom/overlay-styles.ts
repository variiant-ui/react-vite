export type ToolbarButtonKind = "comment" | "sketch";

export const variantOverlayZIndex = 2147483647;

// Override these from DevTools or host-page CSS using
// [data-variant-overlay-root] or [data-variant-toolbar-shell].
// Example: --variiant-toolbar-width, --variiant-toolbar-bottom,
// --variiant-toolbar-surface-radius, --variiant-toolbar-surface-shadow.

export function hudShellStyle(): string {
  return [
    "position:fixed",
    "left:50%",
    "bottom:var(--variiant-toolbar-bottom,18px)",
    "transform:translateX(-50%)",
    `z-index:${variantOverlayZIndex}`,
    "width:var(--variiant-toolbar-width,min(1120px,calc(100vw - 24px)))",
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
    "gap:var(--variiant-toolbar-gap,8px)",
    "flex-wrap:wrap",
    "width:100%",
    visible ? "opacity:1" : "opacity:0",
    visible ? "transform:translateY(0)" : "transform:translateY(10px)",
    "transition:opacity 180ms ease, transform 180ms ease",
  ].join(";");
}

export function toolbarHaloStyle(): string {
  return [
    "position:absolute",
    "left:50%",
    "bottom:var(--variiant-toolbar-halo-bottom,-46px)",
    "transform:translateX(-50%)",
    "width:var(--variiant-toolbar-halo-width,min(980px,92vw))",
    "height:var(--variiant-toolbar-halo-height,220px)",
    "border-radius:999px",
    "background:radial-gradient(ellipse 40% 50% at 50% 100%, rgba(0, 0, 0, 0.24) 28%, rgba(0, 0, 0, 0) 100%)",
    "pointer-events:none",
  ].join(";");
}

export function tabRailStyle(): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "gap:8px",
    "padding:var(--variiant-toolbar-surface-padding,8px)",
    "background:#ffffff",
    "border:var(--variiant-toolbar-surface-border,1px solid rgba(15,23,42,0.12))",
    "border-radius:var(--variiant-toolbar-surface-radius,16px)",
    "box-shadow:var(--variiant-toolbar-surface-shadow,0 12px 30px rgba(15,23,42,0.22))",
    "pointer-events:auto",
    "flex-shrink:0",
  ].join(";");
}

export function tabButtonStyle(active: boolean): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "padding:4px 8px",
    "border:none",
    "border-radius:6px",
    active ? "background:#e8e8e8" : "background:transparent",
    "color:#111111",
    "font-size:14px",
    "font-weight:500",
    "letter-spacing:-0.01em",
    "cursor:pointer",
    "transition:background 150ms ease, color 150ms ease",
  ].join(";");
}

export function panelShellStyle(visible: boolean): string {
  return [
    "flex:1 1 var(--variiant-toolbar-panel-min-width,550px)",
    "min-width:min(var(--variiant-toolbar-panel-min-width,550px),100%)",
    "max-width:100px",
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
    "gap:12px",
    "padding:var(--variiant-toolbar-surface-padding,10px)",
    "background:#ffffff",
    "border:var(--variiant-toolbar-surface-border,1px solid rgba(15,23,42,0.12))",
    "border-radius:var(--variiant-toolbar-surface-radius,16px)",
    "box-shadow:var(--variiant-toolbar-surface-shadow,0 12px 30px rgba(15,23,42,0.22))",
    "overflow:hidden",
  ].join(";");
}

export function composerRowStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "gap:14px",
    "min-width:0",
  ].join(";");
}

export function promptToolRailStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "gap:6px",
    "padding:2px 0 2px 4px",
    "flex-shrink:0",
  ].join(";");
}

export function promptToolButtonStyle(active: boolean): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "width:24px",
    "height:24px",
    "border:none",
    "border-radius:999px",
    active ? "background:rgba(243,244,246,0.96)" : "background:transparent",
    "cursor:pointer",
    "transition:background 150ms ease, transform 150ms ease",
  ].join(";");
}

export function promptToolIconStyle(kind: ToolbarButtonKind, active: boolean): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "width:36px",
    "height:36px",
    active ? "opacity:1" : "opacity:0.92",
    kind === "sketch" ? "color:#b1251b" : "color:#2e24b4",
  ].join(";");
}

export function verticalDividerStyle(): string {
  return [
    "width:1px",
    "align-self:stretch",
    "background:rgba(15,23,42,0.16)",
    "flex-shrink:0",
  ].join(";");
}

export function promptColumnStyle(): string {
  return [
    "flex:1 1 auto",
    "min-width:0",
    "display:flex",
    "flex-direction:column",
    "gap:10px",
  ].join(";");
}

export function promptInputSurfaceStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:10px",
    "min-width:0",
    "padding-right:4px",
    "border-radius:8px",
  ].join(";");
}

export function textareaStyle(): string {
  return [
    "width:100%",
    "min-height:18px",
    "max-height:216px",
    "border:none",
    "background:transparent",
    "color:#111827",
    "padding:0",
    "font-size:16px",
    "font-weight:400",
    "line-height:1.45",
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
    "gap:8px",
    "flex-wrap:wrap",
  ].join(";");
}

export function attachmentChipStyle(kind: "comment" | "sketch"): string {
  const palette = kind === "comment"
    ? {
      background: "rgba(46,36,180,0.08)",
      border: "rgba(46,36,180,0.16)",
      color: "#2e24b4",
    }
    : {
      background: "rgba(177,37,27,0.08)",
      border: "rgba(177,37,27,0.14)",
      color: "#b1251b",
    };

  return [
    "display:inline-flex",
    "align-items:center",
    "gap:8px",
    "min-height:32px",
    "padding:0 10px",
    "border-radius:999px",
    `background:${palette.background}`,
    `border:1px solid ${palette.border}`,
    `color:${palette.color}`,
  ].join(";");
}

export function attachmentLabelStyle(): string {
  return [
    "font-size:12px",
    "font-weight:600",
    "line-height:1.3",
  ].join(";");
}

export function attachmentClearStyle(): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "width:18px",
    "height:18px",
    "padding:0",
    "border:none",
    "border-radius:999px",
    "background:rgba(255,255,255,0.72)",
    "color:inherit",
    "font-size:13px",
    "line-height:1",
    "cursor:pointer",
  ].join(";");
}

export function sendButtonStyle(disabled: boolean): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "width:24px",
    "height:24px",
    "padding:0",
    "border:none",
    "border-radius:999px",
    disabled ? "background:#c8cdd8" : "background:#213cd5",
    "color:#ffffff",
    disabled ? "cursor:not-allowed" : "cursor:pointer",
    "flex-shrink:0",
    "transition:background 150ms ease, transform 150ms ease",
  ].join(";");
}

export function presentSelectGridStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "gap:10px",
    "flex-wrap:wrap",
  ].join(";");
}

export function presentBodyStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:10px",
  ].join(";");
}

export function selectStyle(): string {
  return [
    "flex:1 1 220px",
    "min-width:0",
    "max-width:100%",
    "height:40px",
    "border:1px solid rgba(15,23,42,0.12)",
    "border-radius:12px",
    "background:#ffffff",
    "color:#111827",
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
    "gap:10px",
    "padding:12px",
    "border-radius:12px",
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
    "padding:12px",
    "border-radius:12px",
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
    "height:38px",
    "border:1px solid rgba(15,23,42,0.12)",
    "border-radius:12px",
    "background:#ffffff",
    "color:#111827",
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
      "height:36px",
      "padding:0 12px",
      "border:none",
      "border-radius:10px",
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
    "height:36px",
    "padding:0 12px",
    `border:${palette.border}`,
    "border-radius:10px",
    `background:${palette.background}`,
    `color:${palette.color}`,
    "font-size:12px",
    "font-weight:700",
    "cursor:pointer",
  ].join(";");
}
