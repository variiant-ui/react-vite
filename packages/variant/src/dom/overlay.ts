import type { VariantRuntimeController, VariantRuntimeSnapshot } from "../runtime-core";
import {
  escapeAttributeValue,
  escapeHtml,
  formatCanvasGroupLabel,
} from "./shared";
import {
  applyDeterministicTweak,
  getActiveMountedComponent,
  loadDeterministicTweaks,
  submitAgentPrompt,
} from "./agent";
import { clearVariantToolSketch } from "./tools";
import {
  attachmentChipStyle,
  attachmentClearStyle,
  attachmentLabelStyle,
  attachmentTabsStyle,
  buttonRowStyle,
  buttonStyle,
  composerRowStyle,
  hintTextStyle,
  hudShellStyle,
  metaTextStyle,
  panelFrameStyle,
  panelShellStyle,
  presentBodyStyle,
  presentSelectGridStyle,
  promptColumnStyle,
  promptInputSurfaceStyle,
  promptToolButtonStyle,
  promptToolIconStyle,
  promptToolRailStyle,
  reviewCardStyle,
  reviewResultTitleStyle,
  sectionCardStyle,
  selectStyle,
  sendButtonStyle,
  stackStyle,
  tabButtonStyle,
  tabRailStyle,
  textareaStyle,
  textInputStyle,
  toolbarHaloStyle,
  toolbarSceneStyle,
  verticalDividerStyle,
} from "./overlay-styles";

export { variantOverlayZIndex } from "./overlay-styles";

type PreservedOverlayFocus =
  | {
      key: "prompt";
      selectionStart: number | null;
      selectionEnd: number | null;
    }
  | {
      key: "tweak-input";
      tweakId: string;
      selectionStart: number | null;
      selectionEnd: number | null;
    }
  | null;

export function renderOverlay(
  container: HTMLDivElement,
  snapshot: VariantRuntimeSnapshot,
  controller: VariantRuntimeController,
): void {
  if (snapshot.surface !== "overlay") {
    container.innerHTML = "";
    return;
  }

  const preservedFocus = capturePreservedOverlayFocus(container);
  const mounted = snapshot.components.filter((component) => component.mountedCount > 0);
  const active = getActiveMountedComponent(snapshot);
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

  const promptDisabled = !snapshot.agent.availability.enabled || snapshot.agent.status === "running" || !snapshot.agent.prompt.trim();
  const panelVisible = snapshot.dockExpanded || snapshot.dockMode !== "ideate";
  const ideateActive = snapshot.dockMode === "ideate";
  const presentMode = snapshot.dockMode === "tweak" ? "tweak" : "review";

  container.innerHTML = `
    <div data-variant-toolbar-shell="true" style="${hudShellStyle()}">
      <div style="${toolbarSceneStyle(true)}">
        <div style="${tabRailStyle()}">
          <button
            type="button"
            data-variant-primary-tool="prompt"
            aria-pressed="${ideateActive ? "true" : "false"}"
            style="${tabButtonStyle(ideateActive)}"
          >Ideate</button>
          <button
            type="button"
            data-variant-panel-tab="present"
            aria-pressed="${ideateActive ? "false" : "true"}"
            style="${tabButtonStyle(!ideateActive)}"
          >Present</button>
        </div>
        <div data-variant-toolbar-panel="true" style="${panelShellStyle(panelVisible)}">
          <div style="${panelFrameStyle()}">
            ${ideateActive
      ? renderIdeatePanel(snapshot, promptDisabled)
      : renderPresentPanel({
        snapshot,
        mountedCount: mounted.length,
        active,
        activeSelection,
        componentOptions,
        variantOptions,
        presentMode,
      })}
          </div>
        </div>
      </div>
    </div>`;

  restorePreservedOverlayFocus(container, preservedFocus);

  container
    .querySelectorAll<HTMLSelectElement>('[data-variant-active-source="true"]')
    .forEach((field) => {
      field.addEventListener("change", (event) => {
        const target = event.currentTarget as HTMLSelectElement;
        controller.actions.selectComponent(target.value || null);
      });
    });

  container
    .querySelectorAll<HTMLSelectElement>('[data-variant-active-choice="true"]')
    .forEach((field) => {
      field.addEventListener("change", (event) => {
        const target = event.currentTarget as HTMLSelectElement;
        if (!active || !target.value) {
          return;
        }

        controller.actions.selectVariant(active.sourceId, target.value);
      });
    });

  container
    .querySelector<HTMLButtonElement>('[data-variant-panel-tab="present"]')
    ?.addEventListener("click", () => {
      openPresentDock(snapshot, controller);
    });

  container
    .querySelectorAll<HTMLButtonElement>('[data-variant-primary-tool="prompt"]')
    .forEach((button) => {
      button.addEventListener("click", () => {
        if (snapshot.toolMode === "tweak") {
          controller.actions.setToolMode("none");
        }

        openIdeateDock(controller);
      });
    });

  container
    .querySelectorAll<HTMLButtonElement>('[data-variant-tool-mode]')
    .forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.variantToolMode;
        if (mode !== "comment" && mode !== "sketch") {
          return;
        }

        togglePromptTool(snapshot, controller, mode);
      });
    });

  const promptField = container.querySelector<HTMLTextAreaElement>('[data-variant-agent-prompt="true"]');
  if (promptField) {
    syncPromptTextareaHeight(promptField);
    promptField.addEventListener("input", (event) => {
      const target = event.currentTarget as HTMLTextAreaElement;
      syncPromptTextareaHeight(target);
      controller.actions.setAgentPrompt(target.value);
    });

    promptField.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void submitAgentPrompt(controller);
      }
    });
  }

  container
    .querySelector<HTMLButtonElement>('[data-variant-agent-run="true"]')
    ?.addEventListener("click", () => {
      void submitAgentPrompt(controller);
    });

  container
    .querySelector<HTMLButtonElement>('[data-variant-comments-clear="true"]')
    ?.addEventListener("click", () => {
      controller.actions.clearComments();
    });

  container
    .querySelector<HTMLButtonElement>('[data-variant-sketch-clear="true"]')
    ?.addEventListener("click", () => {
      clearVariantToolSketch(controller);
    });

  container
    .querySelector<HTMLButtonElement>('[data-variant-tweaks-load="true"]')
    ?.addEventListener("click", () => {
      void loadDeterministicTweaks(controller);
    });

  container
    .querySelectorAll<HTMLInputElement>("[data-variant-tweak-input]")
    .forEach((field) => {
      field.addEventListener("input", (event) => {
        const target = event.currentTarget as HTMLInputElement;
        const id = target.dataset.variantTweakInput;
        if (!id) {
          return;
        }

        controller.actions.updateTweakDraft(id, target.value);
      });
    });

  container
    .querySelectorAll<HTMLButtonElement>("[data-variant-tweak-apply]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.variantTweakApply;
        if (!id) {
          return;
        }

        void applyDeterministicTweak(controller, id);
      });
    });
}

function renderIdeatePanel(snapshot: VariantRuntimeSnapshot, promptDisabled: boolean): string {
  return `
    <div style="${composerRowStyle()}">
      <div style="${promptToolRailStyle()}">
        ${renderPromptToolButton({
    kind: "sketch",
    active: snapshot.toolMode === "sketch",
  })}
        ${renderPromptToolButton({
    kind: "comment",
    active: snapshot.toolMode === "comment",
  })}
      </div>
      <div aria-hidden="true" style="${verticalDividerStyle()}"></div>
      <div style="${promptColumnStyle()}">
        <div style="${promptInputSurfaceStyle()}">
          <textarea
            data-variant-agent-prompt="true"
            style="${textareaStyle()}"
            placeholder="Create something new..."
            ${snapshot.agent.status === "running" ? "disabled" : ""}
          >${escapeHtml(snapshot.agent.prompt)}</textarea>
          ${renderAttachmentChips(snapshot)}
        </div>
      </div>
      <button
        data-variant-agent-run="true"
        style="${sendButtonStyle(promptDisabled)}"
        ${promptDisabled ? "disabled" : ""}
        aria-label="Run prompt"
        title="Run prompt"
      >${renderPromptSendIcon()}</button>
    </div>`;
}

function renderPresentPanel(input: {
  snapshot: VariantRuntimeSnapshot;
  mountedCount: number;
  active: ReturnType<typeof getActiveMountedComponent>;
  activeSelection: string | null;
  componentOptions: string;
  variantOptions: string;
  presentMode: "review" | "tweak";
}): string {
  return `
    <div style="${presentSelectGridStyle()}">
      <select data-variant-active-source="true" style="${selectStyle()}" ${input.mountedCount === 0 ? "disabled" : ""}>
        ${input.componentOptions || `<option value="">No mounted components</option>`}
      </select>
      <select data-variant-active-choice="true" style="${selectStyle()}" ${!input.active ? "disabled" : ""}>
        ${input.variantOptions || `<option value="">No variants</option>`}
      </select>
    </div>
    <div style="${presentBodyStyle()}">
      ${renderPresentBody(input.snapshot, input.presentMode, input.active, input.activeSelection)}
    </div>`;
}

function renderPresentBody(
  snapshot: VariantRuntimeSnapshot,
  presentMode: "review" | "tweak",
  active: ReturnType<typeof getActiveMountedComponent>,
  activeSelection: string | null,
): string {
  if (presentMode === "tweak") {
    const tweakLoadDisabled = !active || activeSelection === "source";
    return `
      <div style="${sectionCardStyle()}">
        <div style="${buttonRowStyle()}">
          <button
            data-variant-tweaks-load="true"
            style="${buttonStyle(snapshot.tweaks.status === "loading" || tweakLoadDisabled ? "disabled" : "secondary")}"
            ${snapshot.tweaks.status === "loading" || tweakLoadDisabled ? "disabled" : ""}
          >${snapshot.tweaks.status === "loading" ? "Loading..." : "Load Copy Tweaks"}</button>
        </div>
        ${renderTweakEntries(snapshot)}
      </div>`;
  }

  const reviewResultsMarkup = renderReviewResults(snapshot);
  return reviewResultsMarkup ? `<div style="${sectionCardStyle()}">${reviewResultsMarkup}</div>` : "";
}

function renderReviewResults(snapshot: VariantRuntimeSnapshot): string {
  if (snapshot.reviewResults.length === 0) {
    return "";
  }

  return `<div style="${stackStyle()}">${snapshot.reviewResults.map((result) => `
      <div data-variant-review-result="${escapeHtml(result.sourceId)}" style="${reviewCardStyle()}">
        <div style="${reviewResultTitleStyle()}">${escapeHtml(formatCanvasGroupLabel(result.sourceId))}</div>
        <div style="${metaTextStyle()}">${escapeHtml(result.variantNames.join(", "))}</div>
      </div>
    `).join("")}</div>`;
}

function renderTweakEntries(snapshot: VariantRuntimeSnapshot): string {
  if (snapshot.tweaks.entries.length === 0) {
    return "";
  }

  return `<div style="${stackStyle()}">${snapshot.tweaks.entries.map((entry) => `
      <div style="${reviewCardStyle()}">
        <div style="${reviewResultTitleStyle()}">${escapeHtml(entry.label)}</div>
        <div style="${hintTextStyle()}">${escapeHtml(entry.currentValue)}</div>
        <input
          data-variant-tweak-input="${escapeHtml(entry.id)}"
          value="${escapeHtml(entry.draftValue)}"
          style="${textInputStyle()}"
        />
        <div style="${buttonRowStyle()}">
          <button
            data-variant-tweak-apply="${escapeHtml(entry.id)}"
            style="${buttonStyle(snapshot.tweaks.status === "applying" ? "disabled" : "secondary")}"
            ${snapshot.tweaks.status === "applying" ? "disabled" : ""}
          >Apply</button>
        </div>
      </div>
    `).join("")}</div>`;
}

function openPresentDock(
  snapshot: VariantRuntimeSnapshot,
  controller: VariantRuntimeController,
): void {
  if (snapshot.toolMode !== "none") {
    controller.actions.setToolMode("none");
  }

  controller.actions.setDockMode(snapshot.dockMode === "tweak" ? "tweak" : "review");
  controller.actions.setDockExpanded(true);
}

function openIdeateDock(
  controller: VariantRuntimeController,
): void {
  controller.actions.setDockMode("ideate");
  controller.actions.setDockExpanded(true);
}

function togglePromptTool(
  snapshot: VariantRuntimeSnapshot,
  controller: VariantRuntimeController,
  mode: "comment" | "sketch",
): void {
  controller.actions.setToolMode(snapshot.toolMode === mode ? "none" : mode);
  openIdeateDock(controller);
}

function syncPromptTextareaHeight(field: HTMLTextAreaElement): void {
  field.style.height = "0px";
  const nextHeight = Math.min(field.scrollHeight, 216);
  field.style.height = `${Math.max(nextHeight, 24)}px`;
  field.style.overflowY = field.scrollHeight > 216 ? "auto" : "hidden";
}

function renderAttachmentChips(snapshot: VariantRuntimeSnapshot): string {
  const chips = [
    snapshot.comments.length > 0
      ? renderAttachmentChip({
        kind: "comment",
        label: `${snapshot.comments.length} comment${snapshot.comments.length === 1 ? "" : "s"}`,
        clearAttribute: "data-variant-comments-clear",
      })
      : "",
    snapshot.sketch.status === "ready"
      ? renderAttachmentChip({
        kind: "sketch",
        label: "Sketch",
        clearAttribute: "data-variant-sketch-clear",
      })
      : "",
  ].filter(Boolean);

  return chips.length > 0 ? `<div style="${attachmentTabsStyle()}">${chips.join("")}</div>` : "";
}

function capturePreservedOverlayFocus(container: HTMLDivElement): PreservedOverlayFocus {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLTextAreaElement) && !(activeElement instanceof HTMLInputElement)) {
    return null;
  }

  if (!container.contains(activeElement)) {
    return null;
  }

  if (activeElement instanceof HTMLTextAreaElement && activeElement.matches('[data-variant-agent-prompt="true"]')) {
    return {
      key: "prompt",
      selectionStart: activeElement.selectionStart,
      selectionEnd: activeElement.selectionEnd,
    };
  }

  if (activeElement instanceof HTMLInputElement && activeElement.matches("[data-variant-tweak-input]")) {
    return {
      key: "tweak-input",
      tweakId: activeElement.dataset.variantTweakInput ?? "",
      selectionStart: activeElement.selectionStart,
      selectionEnd: activeElement.selectionEnd,
    };
  }

  return null;
}

function restorePreservedOverlayFocus(
  container: HTMLDivElement,
  preservedFocus: PreservedOverlayFocus,
): void {
  if (!preservedFocus) {
    return;
  }

  if (preservedFocus.key === "prompt") {
    const nextField = container.querySelector<HTMLTextAreaElement>('[data-variant-agent-prompt="true"]');
    if (!nextField || nextField.disabled) {
      return;
    }

    nextField.focus();
    if (preservedFocus.selectionStart !== null && preservedFocus.selectionEnd !== null) {
      nextField.setSelectionRange(preservedFocus.selectionStart, preservedFocus.selectionEnd);
    }
  }

  if (preservedFocus.key === "tweak-input") {
    const nextField = container.querySelector<HTMLInputElement>(
      `[data-variant-tweak-input="${escapeAttributeValue(preservedFocus.tweakId)}"]`,
    );
    if (!nextField || nextField.disabled) {
      return;
    }

    nextField.focus();
    if (preservedFocus.selectionStart !== null && preservedFocus.selectionEnd !== null) {
      nextField.setSelectionRange(preservedFocus.selectionStart, preservedFocus.selectionEnd);
    }
  }
}

function renderPromptToolButton(input: {
  kind: "comment" | "sketch";
  active: boolean;
}): string {
  const label = input.kind === "sketch" ? "Sketch" : "Comment";

  return `
    <button
      type="button"
      data-variant-tool-mode="${input.kind}"
      aria-label="${label}"
      aria-pressed="${input.active ? "true" : "false"}"
      title="${label}"
      style="${promptToolButtonStyle(input.active)}"
    >
      <span aria-hidden="true" style="${promptToolIconStyle(input.kind, input.active)}">
        ${input.kind === "sketch" ? renderSketchToolIcon() : renderCommentToolIcon()}
      </span>
    </button>`;
}

function renderAttachmentChip(input: {
  kind: "comment" | "sketch";
  label: string;
  clearAttribute: "data-variant-comments-clear" | "data-variant-sketch-clear";
}): string {
  return `
    <div style="${attachmentChipStyle(input.kind)}">
      <span aria-hidden="true">${input.kind === "comment" ? renderCommentToolIcon(16) : renderSketchToolIcon(16)}</span>
      <span style="${attachmentLabelStyle()}">${escapeHtml(input.label)}</span>
      <button
        type="button"
        ${input.clearAttribute}="true"
        aria-label="Remove ${escapeHtml(input.label)}"
        title="Remove ${escapeHtml(input.label)}"
        style="${attachmentClearStyle()}"
      >×</button>
    </div>`;
}

function renderPromptSendIcon(): string {
  return `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 19.5V5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M6.5 10.5L12 5L17.5 10.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function renderSketchToolIcon(size = 36): string {
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 8.8C11.4 6.9 15.8 6.5 18.1 8.9C20.5 11.4 18.5 13.5 15.2 14.5C12 15.5 10.1 17.1 10.6 20C11.1 22.7 13.6 24.4 16.5 24.2C20 23.9 22.1 21.8 24.9 20.8C27.2 20 28.8 20.7 29.8 22.3"
        stroke="#B1251B"
        stroke-width="${size <= 18 ? "1.8" : "2.6"}"
        stroke-linecap="round"
        stroke-linejoin="round"/>
    </svg>`;
}

function renderCommentToolIcon(size = 36): string {
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 20.4C8.1 17.4 8.1 12.5 11 9.6C13.9 6.7 18.6 6.7 21.5 9.6C24.4 12.5 24.4 17.4 21.5 20.4C18.6 23.3 13.9 23.3 11 20.4Z"
        stroke="#2E24B4"
        stroke-width="${size <= 18 ? "1.8" : "2.4"}"/>
      <path d="M22.8 22.1L25.6 24.9" stroke="#2E24B4" stroke-width="${size <= 18 ? "1.6" : "2"}" stroke-linecap="round"/>
    </svg>`;
}
