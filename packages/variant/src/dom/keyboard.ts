import type { Shortcut, VariantRuntimeController } from "../runtime-core";

const installedKeyboardControllers = new WeakSet<VariantRuntimeController>();

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

    const { shortcutConfig, surface } = controller.getSnapshot();
    if (matchesShortcut(event, shortcutConfig.toggleOverlay)) {
      event.preventDefault();
      controller.actions.toggleOverlay();
      return;
    }

    if (matchesShortcut(event, shortcutConfig.toggleCanvas)) {
      event.preventDefault();
      controller.actions.toggleCanvas();
      return;
    }

    if (matchesShortcut(event, shortcutConfig.closeOverlay)) {
      if (surface !== "closed") {
        event.preventDefault();
        controller.actions.closeSurface();
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
