import type {
  Shortcut,
  VariantRuntimeController,
  VariantRuntimeSnapshot,
} from "./runtime-core";

const installedKeyboardControllers = new WeakSet<VariantRuntimeController>();
const installedOverlayControllers = new WeakSet<VariantRuntimeController>();

function normalizeKey(key: string): string {
  const normalized = key.toLowerCase();
  if (normalized === "esc") {
    return "escape";
  }

  return normalized;
}

function parseShortcut(shortcut: string): {
  key: string;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
} {
  const tokens = shortcut.split("+").map((token) => token.trim().toLowerCase()).filter(Boolean);
  const key = tokens[tokens.length - 1] ?? "";
  const modifiers = new Set(tokens.slice(0, -1));

  return {
    key: normalizeKey(key),
    alt: modifiers.has("alt") || modifiers.has("option"),
    ctrl: modifiers.has("ctrl") || modifiers.has("control"),
    meta: modifiers.has("meta") || modifiers.has("cmd") || modifiers.has("command"),
    shift: modifiers.has("shift"),
  };
}

function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut): boolean {
  const shortcuts = Array.isArray(shortcut) ? shortcut : [shortcut];
  return shortcuts.some((candidate) => {
    const parsed = parseShortcut(candidate);
    return (
      normalizeKey(event.key) === parsed.key &&
      event.altKey === parsed.alt &&
      event.ctrlKey === parsed.ctrl &&
      event.metaKey === parsed.meta &&
      event.shiftKey === parsed.shift
    );
  });
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

export function installVariantKeyboardBindings(controller: VariantRuntimeController): void {
  if (installedKeyboardControllers.has(controller) || typeof window === "undefined") {
    return;
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) {
      return;
    }

    const { shortcutConfig, overlayOpen } = controller.getSnapshot();
    if (matchesShortcut(event, shortcutConfig.toggleOverlay)) {
      event.preventDefault();
      controller.actions.toggleOverlay();
      return;
    }

    if (matchesShortcut(event, shortcutConfig.closeOverlay)) {
      if (overlayOpen) {
        event.preventDefault();
        controller.actions.closeOverlay();
      }
      return;
    }

    if (matchesShortcut(event, shortcutConfig.nextComponent)) {
      event.preventDefault();
      controller.actions.nextComponent();
      return;
    }

    if (matchesShortcut(event, shortcutConfig.previousComponent)) {
      event.preventDefault();
      controller.actions.previousComponent();
      return;
    }

    if (matchesShortcut(event, shortcutConfig.nextVariant)) {
      event.preventDefault();
      controller.actions.nextVariant();
      return;
    }

    if (matchesShortcut(event, shortcutConfig.previousVariant)) {
      event.preventDefault();
      controller.actions.previousVariant();
    }
  };

  window.addEventListener("keydown", onKeyDown);
  installedKeyboardControllers.add(controller);
}

export function installVariantOverlayUi(controller: VariantRuntimeController): void {
  if (installedOverlayControllers.has(controller) || typeof document === "undefined") {
    return;
  }

  const container = document.createElement("div");
  container.setAttribute("data-variant-overlay-root", "true");
  document.body.appendChild(container);

  const render = (): void => {
    renderOverlay(container, controller.getSnapshot(), controller);
  };

  controller.subscribe(render);
  installedOverlayControllers.add(controller);
  render();
}

function renderOverlay(
  container: HTMLDivElement,
  snapshot: VariantRuntimeSnapshot,
  controller: VariantRuntimeController,
): void {
  if (!snapshot.overlayOpen) {
    container.innerHTML = "";
    return;
  }

  const mounted = snapshot.components.filter((component) => component.mountedCount > 0);
  const active =
    mounted.find((component) => component.sourceId === snapshot.activeSourceId) ?? mounted[0] ?? null;
  const activeSelection = active ? snapshot.selections[active.sourceId] ?? active.selected : null;

  const componentOptions = mounted
    .map((component) => {
      const selected = component.sourceId === active?.sourceId;
      return `<option value="${escapeHtml(component.sourceId)}"${selected ? " selected" : ""}>${escapeHtml(
        component.displayName,
      )}</option>`;
    })
    .join("");

  const variantOptions = active
    ? active.variantNames
        .map((variantName) => {
          const selected = activeSelection === variantName;
          return `<option value="${escapeHtml(variantName)}"${selected ? " selected" : ""}>${escapeHtml(
            variantName,
          )}</option>`;
        })
        .join("")
    : "";

  container.innerHTML = `
<div style="${hudShellStyle()}">
  <div style="${panelStyle()}">
    <select data-variant-active-source="true" style="${selectStyle()}" ${mounted.length === 0 ? "disabled" : ""}>
      ${componentOptions || `<option value="">No mounted components</option>`}
    </select>
    <select data-variant-active-choice="true" style="${selectStyle()}" ${!active ? "disabled" : ""}>
      ${variantOptions || `<option value="">No variants</option>`}
    </select>
  </div>
</div>`;

  container
    .querySelector<HTMLSelectElement>('[data-variant-active-source="true"]')
    ?.addEventListener("change", (event) => {
      const target = event.currentTarget as HTMLSelectElement;
      controller.actions.selectComponent(target.value || null);
    });

  container
    .querySelector<HTMLSelectElement>('[data-variant-active-choice="true"]')
    ?.addEventListener("change", (event) => {
      const target = event.currentTarget as HTMLSelectElement;
      if (!active || !target.value) {
        return;
      }

      controller.actions.selectVariant(active.sourceId, target.value);
    });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hudShellStyle(): string {
  return [
    "position:fixed",
    "top:16px",
    "right:16px",
    "z-index:9999",
    "pointer-events:none",
    "max-width:500px",
  ].join(";");
}

function panelStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "height:48px",
    "width:100%",
    "background:rgba(255,255,255,0.98)",
    "backdrop-filter:blur(12px)",
    "box-shadow:0 18px 40px rgba(15,23,42,0.16)",
    "border:1px solid rgba(148,163,184,0.35)",
    "border-radius:14px",
    "padding:8px",
    "pointer-events:auto",
    "overflow:hidden",
    'font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    "color:#0f172a",
  ].join(";");
}

function selectStyle(): string {
  return [
    "flex:1",
    "min-width:0",
    "max-width:100%",
    "border:1px solid #cbd5e1",
    "height:32px",
    "border-radius:10px",
    "background:#fff",
    "color:#0f172a",
    "padding:0 10px",
    "font-size:13px",
    "outline:none",
  ].join(";");
}
