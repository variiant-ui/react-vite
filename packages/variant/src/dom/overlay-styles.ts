import type { VariantRuntimeSnapshot } from "../runtime-core";

export type ToolbarButtonKind = "sketch" | "comment" | "tweak" | "prompt";

export const variantOverlayZIndex = 2147483647;

export function hudShellStyle(): string {
  return [
    "position:fixed",
    "left:50%",
    "bottom:22px",
    "transform:translateX(-50%)",
    `z-index:${variantOverlayZIndex}`,
    "pointer-events:none",
    "width:min(1040px,calc(100vw - 28px))",
  ].join(";");
}

export function dockStageStyle(trayVisible: boolean): string {
  return [
    "position:relative",
    "display:flex",
    "justify-content:center",
    "width:100%",
    trayVisible ? "padding-top:60px" : "padding-top:0",
  ].join(";");
}

export function floatingTrayStyle(visible: boolean): string {
  return [
    "position:relative",
    "z-index:2",
    "width:100%",
    "pointer-events:none",
    visible ? "max-height:560px" : "max-height:0",
    visible ? "opacity:1" : "opacity:0",
    visible ? "transform:translateY(0)" : "transform:translateY(16px)",
    "overflow:hidden",
    "transition:max-height 180ms ease, opacity 180ms ease, transform 180ms ease",
  ].join(";");
}

export function panelStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:12px",
    "width:100%",
    "background:rgba(255,251,247,0.96)",
    "backdrop-filter:blur(22px)",
    "border:1px solid rgba(140,124,110,0.16)",
    "box-shadow:0 22px 60px rgba(53,37,20,0.12)",
    "border-radius:28px",
    "padding:16px",
    "pointer-events:auto",
    "font-family:'Avenir Next','Nunito Sans','Helvetica Neue',ui-sans-serif,system-ui,sans-serif",
    "color:#211f1d",
  ].join(";");
}

export function promptTrayStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:14px",
    "width:100%",
    "padding:18px 18px 16px",
    "border-radius:30px",
    "border:1.5px solid rgba(21,19,17,0.94)",
    "background:rgba(222, 36, 29, 0.97)",
    "box-shadow:0 28px 60px rgba(80,58,34,0.16)",
    "pointer-events:auto",
    "font-family:'Avenir Next','Nunito Sans','Helvetica Neue',ui-sans-serif,system-ui,sans-serif",
    "color:#211f1d",
  ].join(";");
}

export function rowStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "gap:10px",
    "flex-wrap:wrap",
  ].join(";");
}

export function trayHeaderStyle(): string {
  return [
    "display:flex",
    "align-items:flex-start",
    "justify-content:space-between",
    "gap:12px",
  ].join(";");
}

export function trayHeadingStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:4px",
    "min-width:0",
    "flex:1",
  ].join(";");
}

export function trayEyebrowStyle(): string {
  return [
    "font-size:11px",
    "font-weight:700",
    "letter-spacing:0.14em",
    "text-transform:uppercase",
    "color:#8c6b52",
  ].join(";");
}

export function trayHeaderActionsStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "flex-shrink:0",
  ].join(";");
}

export function buttonRowStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "justify-content:flex-end",
    "flex-wrap:wrap",
    "gap:8px",
  ].join(";");
}

export function attachmentRowStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "flex-wrap:wrap",
    "gap:8px",
  ].join(";");
}

export function attachmentChipStyle(): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "height:28px",
    "padding:0 11px",
    "border-radius:999px",
    "background:rgba(241,233,226,0.82)",
    "color:#6f5a49",
    "font-size:12px",
    "font-weight:700",
  ].join(";");
}

export function chipButtonStyle(active: boolean): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "height:28px",
    "padding:0 11px",
    "border-radius:999px",
    active ? "border:1px solid rgba(73,106,97,0.24)" : "border:1px solid rgba(140,124,110,0.16)",
    active ? "background:rgba(222,236,232,0.94)" : "background:rgba(255,255,255,0.72)",
    active ? "color:#31544c" : "color:#6b625a",
    "font-size:12px",
    "font-weight:700",
    "cursor:pointer",
  ].join(";");
}

export function dockRailStyle(trayVisible: boolean): string {
  return [
    trayVisible ? "position:absolute" : "position:relative",
    trayVisible ? "left:20px" : "left:auto",
    trayVisible ? "top:0" : "top:auto",
    "z-index:1",
    "display:flex",
    "align-items:flex-end",
    "justify-content:center",
    "padding:0",
    "pointer-events:auto",
    "overflow:visible",
  ].join(";");
}

export function dockButtonsStyle(): string {
  return [
    "display:flex",
    "align-items:flex-end",
    "gap:12px",
    "overflow:visible",
  ].join(";");
}

export function toolbarButtonStyle(kind: ToolbarButtonKind, active: boolean): string {
  return [
    "position:relative",
    "display:flex",
    "align-items:flex-end",
    "justify-content:center",
    "width:78px",
    active ? "height:86px" : "height:70px",
    "padding:0",
    "border:none",
    "background:transparent",
    active ? "transform:translateY(-16px)" : "transform:translateY(0)",
    "transition:transform 180ms ease, height 180ms ease",
    "cursor:pointer",
    "overflow:visible",
  ].join(";");
}

export function toolbarButtonBaseStyle(active: boolean): string {
  return [
    "position:absolute",
    "left:50%",
    "bottom:0",
    "transform:translateX(-50%)",
    "width:58px",
    active ? "height:46px" : "height:38px",
    "border-radius:20px",
    active ? "background:rgba(255,255,255,0.94)" : "background:rgba(255,255,255,0.76)",
    active ? "box-shadow:0 12px 24px rgba(53,37,20,0.1)" : "box-shadow:0 8px 18px rgba(53,37,20,0.06)",
    "transition:height 180ms ease, background 180ms ease, box-shadow 180ms ease",
  ].join(";");
}

export function toolbarIconWrapStyle(kind: ToolbarButtonKind, active: boolean): string {
  return [
    "position:absolute",
    "left:50%",
    kind === "sketch"
      ? active ? "top:-34px" : "top:-28px"
      : kind === "comment"
        ? active ? "top:-24px" : "top:-18px"
        : active ? "top:-10px" : "top:-4px",
    "transform:translateX(-50%)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    kind === "sketch"
      ? active ? "width:64px" : "width:56px"
      : kind === "comment"
        ? active ? "width:72px" : "width:62px"
        : active ? "width:52px" : "width:46px",
    kind === "sketch"
      ? active ? "height:108px" : "height:96px"
      : kind === "comment"
        ? active ? "height:82px" : "height:72px"
        : active ? "height:52px" : "height:46px",
    active ? "filter:none" : kind === "sketch" || kind === "comment" ? "filter:saturate(0.82) brightness(0.98)" : "filter:none",
    "transition:top 180ms ease, width 180ms ease, height 180ms ease, filter 180ms ease",
  ].join(";");
}

export function toolbarBadgeStyle(kind: ToolbarButtonKind): string {
  const accent = toolbarAccentColor(kind);

  return [
    "position:absolute",
    "right:-3px",
    "top:-6px",
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "min-width:18px",
    "height:18px",
    "padding:0 5px",
    "border-radius:999px",
    `background:${accent}`,
    "color:#fffefb",
    "font-size:10px",
    "font-weight:700",
    "line-height:1",
    "box-shadow:0 6px 14px rgba(43,34,25,0.16)",
  ].join(";");
}

export function toolbarAccentColor(kind: ToolbarButtonKind): string {
  if (kind === "sketch") {
    return "#7a3413";
  }

  if (kind === "comment") {
    return "#9d4565";
  }

  if (kind === "tweak") {
    return "#30495d";
  }

  return "#496a61";
}

export function checkboxRowStyle(disabled: boolean): string {
  return [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "font-size:12px",
    "line-height:1.4",
    disabled ? "color:#b5a89d" : "color:#675b52",
  ].join(";");
}

export function metaTextStyle(): string {
  return [
    "font-size:12px",
    "line-height:1.4",
    "color:#75695f",
    "min-width:0",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
  ].join(";");
}

export function hintTextStyle(): string {
  return [
    "font-size:11px",
    "line-height:1.4",
    "color:#8f8378",
  ].join(";");
}

export function sectionCardStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:10px",
    "padding:12px",
    "border-radius:18px",
    "background:rgba(255,255,255,0.62)",
    "border:1px solid rgba(140,124,110,0.12)",
  ].join(";");
}

export function sectionLabelStyle(): string {
  return [
    "font-size:12px",
    "font-weight:700",
    "letter-spacing:0.02em",
    "text-transform:uppercase",
    "color:#6f6257",
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
    "gap:5px",
    "padding:10px",
    "border-radius:16px",
    "background:rgba(255,255,255,0.78)",
    "border:1px solid rgba(140,124,110,0.1)",
  ].join(";");
}

export function reviewResultTitleStyle(): string {
  return [
    "font-size:13px",
    "font-weight:700",
    "line-height:1.4",
    "color:#2a241f",
  ].join(";");
}

export function statusPillStyle(status: VariantRuntimeSnapshot["agent"]["status"]): string {
  const palette = status === "success"
    ? { background: "#dceddf", color: "#31614e" }
    : status === "error"
      ? { background: "#f9e1e6", color: "#982f58" }
      : status === "running"
        ? { background: "#ece4d8", color: "#8a5a2a" }
        : { background: "#eee5de", color: "#6f6257" };

  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "padding:4px 8px",
    "border-radius:999px",
    `background:${palette.background}`,
    `color:${palette.color}`,
    "font-size:12px",
    "font-weight:700",
    "white-space:nowrap",
  ].join(";");
}

export function selectStyle(): string {
  return [
    "flex:1",
    "min-width:0",
    "max-width:100%",
    "border:1px solid rgba(140,124,110,0.16)",
    "height:36px",
    "border-radius:12px",
    "background:rgba(255,255,255,0.74)",
    "color:#211f1d",
    "padding:0 12px",
    "font-size:13px",
    "outline:none",
  ].join(";");
}

export function textareaStyle(): string {
  return [
    "width:100%",
    "min-height:96px",
    "height:96px",
    "max-height:112px",
    "border:none",
    "background:transparent",
    "color:#383533",
    "padding:0",
    "padding-top:18px",
    "font-size:24px",
    "line-height:1.28",
    "resize:none",
    "outline:none",
    "box-sizing:border-box",
    "font-family:'Avenir Next','Nunito Sans','Helvetica Neue',ui-sans-serif,system-ui,sans-serif",
  ].join(";");
}

export function textInputStyle(): string {
  return [
    "width:100%",
    "height:36px",
    "border:1px solid rgba(140,124,110,0.16)",
    "border-radius:12px",
    "background:rgba(255,255,255,0.82)",
    "color:#211f1d",
    "padding:0 12px",
    "font-size:13px",
    "outline:none",
    "box-sizing:border-box",
  ].join(";");
}

export function progressStripStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "gap:12px",
    "min-height:46px",
    "padding:0 14px",
    "border:1px solid rgba(140,124,110,0.16)",
    "border-radius:16px",
    "background:linear-gradient(180deg,rgba(255,255,255,0.88) 0%,rgba(245,239,233,0.92) 100%)",
  ].join(";");
}

export function progressTextStyle(): string {
  return [
    "flex:1",
    "min-width:0",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
    "font-size:13px",
    "font-weight:700",
    "line-height:1.4",
    "background-image:linear-gradient(90deg,#7a6655 0%,#2a241f 20%,#9d7b63 45%,#2a241f 70%,#7a6655 100%)",
    "background-size:200% 100%",
    "background-clip:text",
    "-webkit-background-clip:text",
    "color:transparent",
    "-webkit-text-fill-color:transparent",
    "animation:variiant-agent-gradient 2.1s linear infinite",
  ].join(";");
}

export function spinnerStyle(): string {
  return [
    "width:16px",
    "height:16px",
    "flex-shrink:0",
    "border-radius:999px",
    "border:2px solid rgba(140,124,110,0.2)",
    "border-top-color:#7a6655",
    "animation:variiant-agent-spin 0.85s linear infinite",
  ].join(";");
}

export function buttonStyle(kind: "primary" | "secondary" | "disabled"): string {
  if (kind === "disabled") {
    return [
      "height:34px",
      "border:none",
      "border-radius:12px",
      "padding:0 13px",
      "background:#ece4de",
      "color:#b2a39a",
      "font-size:12px",
      "font-weight:700",
      "cursor:not-allowed",
    ].join(";");
  }

  const palette = kind === "primary"
    ? {
      background: "linear-gradient(180deg,#7d756c 0%,#6b645c 100%)",
      color: "#fffaf5",
      border: "none",
      shadow: "0 10px 20px rgba(74,60,49,0.18)",
    }
    : {
      background: "rgba(255,255,255,0.74)",
      color: "#5e554e",
      border: "1px solid rgba(140,124,110,0.16)",
      shadow: "none",
    };

  return [
    "height:34px",
    `border:${palette.border}`,
    "border-radius:12px",
    "padding:0 13px",
    `background:${palette.background}`,
    `color:${palette.color}`,
    `box-shadow:${palette.shadow}`,
    "font-size:12px",
    "font-weight:700",
    "cursor:pointer",
  ].join(";");
}

export function promptComposerStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:12px",
  ].join(";");
}

export function promptComposerMainStyle(): string {
  return [
    "position:relative",
    "display:grid",
    "grid-template-columns:minmax(0,1fr) auto",
    "align-items:end",
    "gap:18px",
    "padding:30px",
    "border-radius:22px",
    "border:2px solid rgba(20,19,17,0.95)",
    "background:rgba(251,249,247,0.98)",
    "box-shadow:0 22px 44px rgba(80,58,34,0.12)",
  ].join(";");
}

export function promptSendButtonStyle(disabled: boolean): string {
  return [
    "width:96px",
    "height:96px",
    "border:none",
    "border-radius:10px",
    disabled ? "background:#c5b7ae" : "background:#873117",
    disabled ? "color:#f4ece8" : "color:#fff8f1",
    disabled ? "box-shadow:none" : "box-shadow:0 16px 28px rgba(135,49,23,0.24)",
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    disabled ? "cursor:not-allowed" : "cursor:pointer",
    "flex-shrink:0",
    "transition:transform 180ms ease, box-shadow 180ms ease, background 180ms ease",
  ].join(";");
}

export function promptAttachmentTabsStyle(): string {
  return [
    "position:absolute",
    "left:18px",
    "top:-18px",
    "display:flex",
    "align-items:center",
    "gap:10px",
    "flex-wrap:wrap",
  ].join(";");
}

export function promptAttachmentTabStyle(kind: "comment" | "sketch"): string {
  const palette = kind === "comment"
    ? {
      background: "linear-gradient(180deg,#fff2a9 0%,#f4df76 100%)",
      border: "rgba(146,112,30,0.2)",
      color: "#6d5115",
    }
    : {
      background: "linear-gradient(180deg,#efe2d7 0%,#e7d7c8 100%)",
      border: "rgba(122,52,19,0.18)",
      color: "#7a3413",
    };

  return [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "height:36px",
    "padding:0 12px 0 10px",
    "border-radius:12px 12px 14px 14px",
    `background:${palette.background}`,
    `border:1px solid ${palette.border}`,
    `color:${palette.color}`,
    "box-shadow:0 14px 24px rgba(53,37,20,0.1)",
    "pointer-events:auto",
  ].join(";");
}

export function promptAttachmentIconStyle(kind: "comment" | "sketch"): string {
  return [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    kind === "comment" ? "width:20px" : "width:18px",
    kind === "comment" ? "height:20px" : "height:24px",
    "flex-shrink:0",
  ].join(";");
}

export function promptAttachmentLabelStyle(): string {
  return [
    "font-size:12px",
    "font-weight:700",
    "line-height:1",
    "white-space:nowrap",
  ].join(";");
}

export function promptAttachmentClearStyle(): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "width:20px",
    "height:20px",
    "margin-left:2px",
    "border:none",
    "border-radius:999px",
    "background:rgba(255,255,255,0.42)",
    "color:inherit",
    "font-size:14px",
    "line-height:1",
    "cursor:pointer",
    "padding:0",
  ].join(";");
}

export function promptFooterStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "justify-content:space-between",
    "gap:12px",
    "flex-wrap:wrap",
  ].join(";");
}

export function promptFooterSelectsStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "gap:10px",
    "flex-wrap:wrap",
    "flex:1",
    "min-width:min(520px,100%)",
  ].join(";");
}

export function promptAccessoryCardStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "justify-content:space-between",
    "align-items:center",
    "justify-content:space-between",
    "gap:8px",
    "padding:8px 4px 0",
  ].join(";");
}

export function errorNoteStyle(): string {
  return [
    "font-size:12px",
    "line-height:1.5",
    "word-break:break-word",
    "border-radius:14px",
    "background:#fae8ee",
    "color:#9d4565",
    "padding:10px 12px",
    "border:1px solid rgba(173,91,125,0.18)",
  ].join(";");
}
