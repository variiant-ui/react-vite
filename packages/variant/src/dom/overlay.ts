import type { VariantRuntimeController, VariantRuntimeSnapshot } from "../runtime-core";
import {
  escapeHtml,
  escapeAttributeValue,
  formatCanvasGroupLabel,
} from "./shared";
import {
  submitAgentPrompt,
  loadDeterministicTweaks,
  applyDeterministicTweak,
  getActiveMountedComponent,
} from "./agent";
import { normalizeAgentMessageText } from "./agent-parse";
import { clearVariantToolSketch } from "./tools";
import {
  hudShellStyle,
  dockStageStyle,
  floatingTrayStyle,
  panelStyle,
  promptTrayStyle,
  rowStyle,
  trayHeaderStyle,
  trayHeadingStyle,
  trayEyebrowStyle,
  trayHeaderActionsStyle,
  buttonRowStyle,
  attachmentRowStyle,
  attachmentChipStyle,
  chipButtonStyle,
  dockRailStyle,
  dockButtonsStyle,
  toolbarButtonStyle,
  toolbarButtonBaseStyle,
  toolbarIconWrapStyle,
  toolbarBadgeStyle,
  toolbarAccentColor,
  checkboxRowStyle,
  metaTextStyle,
  hintTextStyle,
  sectionCardStyle,
  stackStyle,
  reviewCardStyle,
  reviewResultTitleStyle,
  statusPillStyle,
  selectStyle,
  textareaStyle,
  textInputStyle,
  progressStripStyle,
  progressTextStyle,
  spinnerStyle,
  buttonStyle,
  promptComposerStyle,
  promptComposerMainStyle,
  promptSendButtonStyle,
  promptAttachmentTabsStyle,
  promptAttachmentTabStyle,
  promptAttachmentIconStyle,
  promptAttachmentLabelStyle,
  promptAttachmentClearStyle,
  promptFooterStyle,
  promptFooterSelectsStyle,
  promptAccessoryCardStyle,
  errorNoteStyle,
  type ToolbarButtonKind,
} from "./overlay-styles";

export { variantOverlayZIndex } from "./overlay-styles";

const markerIconSvg = String.raw`<svg width="42" height="84" viewBox="0 0 42 84" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M20.7806 0C17.758 0 12.8462 11.3348 12.8462 21.1584H29.0928C29.0928 11.3348 23.8032 0 20.7806 0Z" fill="#630000"/>
<path d="M41.5611 71.4095V83.5H1.14441e-05V71.4095C1.14441e-05 49.1176 9.82354 45.3393 9.82354 37.405L10.5792 21.5362C11.9646 20.9065 15.9444 19.647 20.7806 19.647C25.6168 19.647 29.5965 20.9065 30.9819 21.5362L31.7376 37.405C31.7376 45.3393 41.5611 49.1176 41.5611 71.4095Z" fill="#C00404"/>
<mask id="variant-marker-mask" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="19" width="42" height="65">
<path d="M41.5611 71.4095V83.5H1.14441e-05V71.4095C1.14441e-05 49.1176 9.82354 45.3393 9.82354 37.405L10.5792 21.5362C11.9646 20.9065 15.9444 19.647 20.7806 19.647C25.6168 19.647 29.5965 20.9065 30.9819 21.5362L31.7376 37.405C31.7376 45.3393 41.5611 49.1176 41.5611 71.4095Z" fill="#C00404"/>
</mask>
<g mask="url(#variant-marker-mask)">
<ellipse cx="29.8638" cy="52.9327" rx="5.37081" ry="13.6018" transform="rotate(-11.3827 29.8638 52.9327)" fill="url(#variant-marker-paint0)"/>
<ellipse cx="9.82393" cy="54.2351" rx="8.29916" ry="20.3629" transform="rotate(13.5728 9.82393 54.2351)" fill="url(#variant-marker-paint1)"/>
<ellipse cx="15.1136" cy="33.0767" rx="8.29916" ry="20.3629" transform="rotate(1.38484 15.1136 33.0767)" fill="url(#variant-marker-paint2)"/>
<ellipse cx="27.8681" cy="31.3597" rx="2.49525" ry="10.1026" transform="rotate(2.48783 27.8681 31.3597)" fill="url(#variant-marker-paint3)"/>
</g>
<defs>
<radialGradient id="variant-marker-paint0" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(29.8638 52.9327) rotate(90) scale(13.6018 5.37081)">
<stop offset="0.379808" stop-color="#FFB9B9" stop-opacity="0.6"/>
<stop offset="1" stop-color="#737373" stop-opacity="0"/>
</radialGradient>
<radialGradient id="variant-marker-paint1" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(9.82393 54.2351) rotate(90) scale(20.3629 8.29916)">
<stop offset="0.379808" stop-opacity="0.26"/>
<stop offset="1" stop-color="#737373" stop-opacity="0"/>
</radialGradient>
<radialGradient id="variant-marker-paint2" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(15.1136 33.0767) rotate(90) scale(20.3629 8.29916)">
<stop offset="0.379808" stop-opacity="0.26"/>
<stop offset="1" stop-color="#737373" stop-opacity="0"/>
</radialGradient>
<radialGradient id="variant-marker-paint3" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(27.8681 31.3597) rotate(90) scale(10.1026 2.49525)">
<stop offset="0.379808" stop-color="#FFB9B9" stop-opacity="0.6"/>
<stop offset="1" stop-color="#737373" stop-opacity="0"/>
</radialGradient>
</defs>
</svg>`;

const stickyIconSvg = String.raw`<svg width="80" height="90" viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg">
<g filter="url(#variant-sticky-filter)">
<rect x="9.99054" y="-0.381287" width="64.4282" height="64.4282" rx="4" transform="rotate(5.76506 9.99054 -0.381287)" fill="#FFED9C"/>
</g>
<defs>
<filter id="variant-sticky-filter" x="2.43187e-05" y="0" width="79.6116" height="89.7116" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dx="1" dy="15"/>
<feGaussianBlur stdDeviation="2.45"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.17 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_1_49"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_1_49" result="shape"/>
</filter>
</defs>
</svg>`;

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

  const availabilityMessage = snapshot.agent.availability.enabled
    ? snapshot.agent.availability.commandLabel
      ? `Agent: ${snapshot.agent.availability.commandLabel}`
      : "Local agent bridge ready."
    : snapshot.agent.availability.message ?? "Local agent bridge unavailable.";
  const imageSupportMessage = snapshot.agent.availability.supportsImages
    ? null
    : "Configure agent.image.cliFlag in variiant.config.json to attach screenshots.";
  const screenshotOptionMarkup = active
    ? `
    <label style="${checkboxRowStyle(!snapshot.agent.availability.supportsImages)}">
      <input
        data-variant-agent-attach-screenshot="true"
        type="checkbox"
        ${snapshot.agent.attachActiveComponentScreenshot ? "checked" : ""}
        ${!snapshot.agent.availability.supportsImages ? "disabled" : ""}
      />
      <span>Attach ${escapeHtml(active.displayName)} screenshot</span>
    </label>
    ${imageSupportMessage ? `<div style="${hintTextStyle()}">${escapeHtml(imageSupportMessage)}</div>` : ""}`
    : "";

  const statusText = renderStatusText(snapshot);
  const latestAgentMessage = getLatestAgentMessage(snapshot);
  const errorSummary =
    snapshot.agent.status === "error"
      ? normalizeAgentMessageText(snapshot.agent.error ?? "") || latestAgentMessage
      : null;
  const changedFilesMarkup = snapshot.agent.changedFiles.length > 0
    ? `<div style="${metaTextStyle()}">Changed files: ${escapeHtml(snapshot.agent.changedFiles.slice(0, 4).join(", "))}${snapshot.agent.changedFiles.length > 4 ? "..." : ""}</div>`
    : "";
  const runningProgressMarkup = snapshot.agent.status === "running"
    ? `
    <div data-variant-agent-progress="true" style="${progressStripStyle()}">
      <div data-variant-agent-progress-text="true" style="${progressTextStyle()}">${escapeHtml(latestAgentMessage)}</div>
      <div aria-hidden="true" style="${spinnerStyle()}"></div>
    </div>`
    : "";
  const errorSummaryMarkup = errorSummary
    ? `<div data-variant-agent-error="true" style="${errorNoteStyle()}">${escapeHtml(errorSummary)}</div>`
    : "";
  const tweakLoadDisabled = !active || activeSelection === "source";
  const tweakEntriesMarkup = snapshot.tweaks.entries.length > 0
    ? `<div style="${stackStyle()}">${snapshot.tweaks.entries.map((entry) => `
      <div style="${reviewCardStyle()}">
        <div style="${reviewResultTitleStyle()}">${escapeHtml(entry.label)}</div>
        <div style="${hintTextStyle()}">Current: ${escapeHtml(entry.currentValue)}</div>
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
    `).join("")}</div>`
    : `<div style="${hintTextStyle()}">Load copy targets from the active variant to make small deterministic text edits without another agent run.</div>`;
  const attachmentChips = [
    snapshot.comments.length > 0
      ? `<div style="${attachmentChipStyle()}">${escapeHtml(`${snapshot.comments.length} comment${snapshot.comments.length === 1 ? "" : "s"}`)}</div>`
      : "",
    snapshot.sketch.status === "ready"
      ? `<div style="${attachmentChipStyle()}">Sketch attached</div>`
      : "",
  ].filter(Boolean);
  const attachmentChipsMarkup = attachmentChips.join("");
  const reviewResultsMarkup = snapshot.reviewResults.length > 0
    ? `<div style="${stackStyle()}">${snapshot.reviewResults.map((result) => `
      <div data-variant-review-result="${escapeHtml(result.sourceId)}" style="${reviewCardStyle()}">
        <div style="${reviewResultTitleStyle()}">${escapeHtml(formatCanvasGroupLabel(result.sourceId))}</div>
        <div style="${metaTextStyle()}">Variants: ${escapeHtml(result.variantNames.join(", "))}</div>
        <div style="${hintTextStyle()}">${escapeHtml(result.changedFiles.slice(0, 2).join(", "))}${result.changedFiles.length > 2 ? "..." : ""}</div>
      </div>
    `).join("")}</div>`
    : `<div style="${hintTextStyle()}">No generated results yet. Run the agent to populate review targets.</div>`;

  const trayVisible = snapshot.dockExpanded;
  const primarySelection = snapshot.toolMode === "sketch" || snapshot.toolMode === "comment" || snapshot.toolMode === "tweak"
    ? snapshot.toolMode
    : trayVisible
      ? "prompt"
      : "none";
  const trayEyebrow = snapshot.dockMode === "tweak"
    ? "Tweak"
    : snapshot.dockMode === "review"
      ? "Review"
      : "Prompt";
  const traySummary = snapshot.dockMode === "tweak"
    ? snapshot.tweaks.targetFile ?? "Select a generated variant to inspect deterministic copy tweaks."
    : snapshot.dockMode === "review"
      ? snapshot.reviewResults.length > 0
        ? `${snapshot.reviewResults.length} changed component${snapshot.reviewResults.length === 1 ? "" : "s"}`
        : "No generated results yet."
      : availabilityMessage;
  const promptDisabled = !snapshot.agent.availability.enabled || !snapshot.agent.prompt.trim();
  const resultsButtonMarkup = snapshot.reviewResults.length > 0 && snapshot.dockMode !== "review"
    ? `
      <button
        data-variant-dock-mode="review"
        style="${chipButtonStyle(false)}"
      >Results</button>`
    : "";
  const clearAttachmentControlsMarkup = attachmentChips.length > 0
    ? `
      <div style="${attachmentRowStyle()}">
        ${attachmentChipsMarkup}
        ${snapshot.comments.length > 0 ? `
          <button
            data-variant-comments-clear="true"
            style="${chipButtonStyle(false)}"
          >Clear comments</button>` : ""}
        ${snapshot.sketch.status === "ready" ? `
          <button
            data-variant-sketch-clear="true"
            style="${chipButtonStyle(false)}"
          >Clear sketch</button>` : ""}
      </div>`
    : "";
  const promptAttachmentTabsMarkup = [
    snapshot.comments.length > 0
      ? renderPromptAttachmentTab({
        kind: "comment",
        label: `${snapshot.comments.length} comment${snapshot.comments.length === 1 ? "" : "s"}`,
        clearAttribute: "data-variant-comments-clear",
      })
      : "",
    snapshot.sketch.status === "ready"
      ? renderPromptAttachmentTab({
        kind: "sketch",
        label: "Sketch attached",
        clearAttribute: "data-variant-sketch-clear",
      })
      : "",
  ].filter(Boolean).join("");
  const promptComposerMarkup = snapshot.agent.status === "running"
    ? `<div style="${promptComposerStyle()}">${runningProgressMarkup}</div>`
    : `
      <div style="${promptComposerStyle()}">
        <div style="${promptComposerMainStyle()}">
          ${promptAttachmentTabsMarkup ? `<div style="${promptAttachmentTabsStyle()}">${promptAttachmentTabsMarkup}</div>` : ""}
          <textarea
            data-variant-agent-prompt="true"
            style="${textareaStyle()}"
            placeholder="Implement the changes I requested above"
          >${escapeHtml(snapshot.agent.prompt)}</textarea>
          <button
            data-variant-agent-run="true"
            style="${promptSendButtonStyle(promptDisabled)}"
            ${promptDisabled ? "disabled" : ""}
            aria-label="Run prompt"
            title="Run prompt"
          >${renderPromptSendIcon()}</button>
        </div>
      </div>`;
  const promptPanelMarkup = `
      ${promptComposerMarkup}
      <div style="${hintTextStyle()}">${escapeHtml(availabilityMessage)}</div>
      <div style="${promptFooterStyle()}">
        <div style="${promptFooterSelectsStyle()}">
          <select data-variant-active-source="true" style="${selectStyle()}" ${mounted.length === 0 ? "disabled" : ""}>
            ${componentOptions || `<option value="">No mounted components</option>`}
          </select>
          <select data-variant-active-choice="true" style="${selectStyle()}" ${!active ? "disabled" : ""}>
            ${variantOptions || `<option value="">No variants</option>`}
          </select>
        </div>
        <div style="${buttonRowStyle()}">
          ${resultsButtonMarkup}
          <button
            data-variant-open-canvas="true"
            style="${buttonStyle("secondary")}"
          >Review Stack</button>
          <button
            data-variant-agent-clear="true"
            style="${buttonStyle(snapshot.agent.status === "idle" ? "disabled" : "secondary")}"
            ${snapshot.agent.status === "idle" ? "disabled" : ""}
          >Clear</button>
        </div>
      </div>
      ${screenshotOptionMarkup ? `<div style="${promptAccessoryCardStyle()}">${screenshotOptionMarkup}</div>` : ""}`;
  const reviewPanelMarkup = `
    <div style="${sectionCardStyle()}">
      ${reviewResultsMarkup}
    </div>
    <div style="${buttonRowStyle()}">
      <button
        data-variant-dock-mode="ideate"
        style="${buttonStyle("secondary")}"
      >Prompt</button>
      <button
        data-variant-open-canvas="true"
        style="${buttonStyle("primary")}"
      >Open Review Stack</button>
    </div>`;
  const tweakPanelMarkup = `
    <div style="${sectionCardStyle()}">
      <div style="${hintTextStyle()}">${escapeHtml(snapshot.tweaks.targetFile ?? "Select a generated variant to inspect deterministic copy tweaks.")}</div>
      <div style="${buttonRowStyle()}">
        ${resultsButtonMarkup}
        <button
          data-variant-tweaks-load="true"
          style="${buttonStyle(snapshot.tweaks.status === "loading" || tweakLoadDisabled ? "disabled" : "secondary")}"
          ${snapshot.tweaks.status === "loading" || tweakLoadDisabled ? "disabled" : ""}
        >${snapshot.tweaks.status === "loading" ? "Loading..." : "Load Copy Tweaks"}</button>
      </div>
      ${snapshot.tweaks.error ? `<div style="${errorNoteStyle()}">${escapeHtml(snapshot.tweaks.error)}</div>` : ""}
      ${tweakEntriesMarkup}
    </div>`;
  const trayBodyMarkup = snapshot.dockMode === "tweak"
    ? tweakPanelMarkup
    : snapshot.dockMode === "review" && snapshot.agent.status !== "running"
      ? reviewPanelMarkup
      : promptPanelMarkup;
  const trayHeaderMarkup = snapshot.dockMode === "ideate" && snapshot.agent.status !== "running"
    ? ""
    : `
      <div style="${trayHeaderStyle()}">
        <div style="${trayHeadingStyle()}">
          <div style="${trayEyebrowStyle()}">${escapeHtml(trayEyebrow)}</div>
          <div style="${metaTextStyle()}">${escapeHtml(traySummary)}</div>
        </div>
        <div style="${trayHeaderActionsStyle()}">
          <div data-variant-agent-status="true" style="${statusPillStyle(snapshot.agent.status)}">${escapeHtml(statusText)}</div>
        </div>
      </div>`;
  const contextControlsMarkup = snapshot.dockMode === "ideate" && snapshot.agent.status !== "running"
    ? ""
    : `
      <div style="${rowStyle()}">
        <select data-variant-active-source="true" style="${selectStyle()}" ${mounted.length === 0 ? "disabled" : ""}>
          ${componentOptions || `<option value="">No mounted components</option>`}
        </select>
        <select data-variant-active-choice="true" style="${selectStyle()}" ${!active ? "disabled" : ""}>
          ${variantOptions || `<option value="">No variants</option>`}
        </select>
      </div>`;
  const trayShellMarkup = snapshot.dockMode === "ideate" && snapshot.agent.status !== "running"
    ? promptTrayStyle()
    : panelStyle();

  container.innerHTML = `
<div style="${hudShellStyle()}">
  <div style="${dockStageStyle(trayVisible)}">
  <div
    data-variant-dock-tray="true"
    style="${floatingTrayStyle(trayVisible)}"
  >
    <div style="${trayShellMarkup}">
      ${trayHeaderMarkup}
      ${contextControlsMarkup}
      ${snapshot.dockMode === "ideate" && snapshot.agent.status !== "running" ? "" : clearAttachmentControlsMarkup}
      ${trayBodyMarkup}
      ${errorSummaryMarkup}
      ${changedFilesMarkup}
    </div>
  </div>
  <div style="${dockRailStyle(trayVisible)}">
    <div style="${dockButtonsStyle()}">
      ${renderToolbarButton({
        kind: "sketch",
        active: primarySelection === "sketch",
        badge: snapshot.sketch.status === "ready" ? "•" : null,
      })}
      ${renderToolbarButton({
        kind: "comment",
        active: primarySelection === "comment",
        badge: snapshot.comments.length > 0 ? String(snapshot.comments.length) : null,
      })}
      ${renderToolbarButton({
        kind: "tweak",
        active: primarySelection === "tweak",
        badge: snapshot.tweaks.entries.length > 0 ? String(snapshot.tweaks.entries.length) : null,
      })}
      ${renderToolbarButton({
        kind: "prompt",
        active: primarySelection === "prompt",
        badge: snapshot.reviewResults.length > 0 ? String(snapshot.reviewResults.length) : null,
      })}
    </div>
  </div>
  </div>
</div>`;

  restorePreservedOverlayFocus(container, preservedFocus);

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

  container
    .querySelectorAll<HTMLButtonElement>('[data-variant-dock-mode]')
    .forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.variantDockMode as typeof snapshot.dockMode | undefined;
        if (!mode) {
          return;
        }
        controller.actions.setDockMode(mode);
        controller.actions.setDockExpanded(true);
      });
    });

  container
    .querySelectorAll<HTMLButtonElement>('[data-variant-tool-mode]')
    .forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.variantToolMode as typeof snapshot.toolMode | undefined;
        if (!mode) {
          return;
        }
        if (snapshot.toolMode === mode) {
          controller.actions.setToolMode("none");
          controller.actions.setDockExpanded(false);
          return;
        }

        controller.actions.setToolMode(mode);
        controller.actions.setDockExpanded(mode === "tweak");
      });
    });

  container
    .querySelector<HTMLButtonElement>('[data-variant-primary-tool="prompt"]')
    ?.addEventListener("click", () => {
      if (snapshot.agent.status === "running") {
        return;
      }

      const ideateTrayOpen = snapshot.dockExpanded && snapshot.dockMode === "ideate" && snapshot.toolMode !== "tweak";
      if (ideateTrayOpen) {
        controller.actions.setDockExpanded(false);
        return;
      }

      if (snapshot.toolMode !== "none") {
        controller.actions.setToolMode("none");
      }
      controller.actions.setDockMode("ideate");
      controller.actions.setDockExpanded(true);
    });

  container
    .querySelector<HTMLTextAreaElement>('[data-variant-agent-prompt="true"]')
    ?.addEventListener("input", (event) => {
      const target = event.currentTarget as HTMLTextAreaElement;
      controller.actions.setAgentPrompt(target.value);
    });

  container
    .querySelector<HTMLTextAreaElement>('[data-variant-agent-prompt="true"]')
    ?.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void submitAgentPrompt(controller);
      }
    });

  container
    .querySelector<HTMLInputElement>('[data-variant-agent-attach-screenshot="true"]')
    ?.addEventListener("change", (event) => {
      const target = event.currentTarget as HTMLInputElement;
      controller.actions.setAgentAttachActiveComponentScreenshot(target.checked);
    });

  container
    .querySelector<HTMLButtonElement>('[data-variant-open-canvas="true"]')
    ?.addEventListener("click", () => {
      controller.actions.openCanvas();
    });

  container
    .querySelector<HTMLButtonElement>('[data-variant-agent-run="true"]')
    ?.addEventListener("click", () => {
      void submitAgentPrompt(controller);
    });

  container
    .querySelector<HTMLButtonElement>('[data-variant-agent-clear="true"]')
    ?.addEventListener("click", () => {
      controller.actions.clearAgentRun();
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

function renderStatusText(snapshot: VariantRuntimeSnapshot): string {
  if (snapshot.agent.status === "running") {
    return "Running";
  }

  if (snapshot.agent.status === "success") {
    return snapshot.agent.exitCode === 0 ? "Done" : `Exit ${snapshot.agent.exitCode}`;
  }

  if (snapshot.agent.status === "error") {
    return snapshot.agent.exitCode !== null ? `Exit ${snapshot.agent.exitCode}` : "Error";
  }

  return "Idle";
}

function getLatestAgentMessage(snapshot: VariantRuntimeSnapshot): string {
  const latestStreamMessage = [...snapshot.agent.logs]
    .reverse()
    .find((entry) => entry.stream !== "system" && normalizeAgentMessageText(entry.text));

  if (latestStreamMessage) {
    return normalizeAgentMessageText(latestStreamMessage.text);
  }

  if (snapshot.agent.status === "error") {
    return normalizeAgentMessageText(snapshot.agent.error ?? "") || "Agent run failed.";
  }

  if (snapshot.agent.status === "success") {
    return "Agent run finished.";
  }

  return "Starting local agent session...";
}

function renderToolbarButton(input: {
  kind: ToolbarButtonKind;
  active: boolean;
  badge: string | null;
}): string {
  const attributeName = input.kind === "prompt" ? "data-variant-primary-tool" : "data-variant-tool-mode";
  const label = input.kind === "sketch"
    ? "Sketch"
    : input.kind === "comment"
      ? "Comment"
      : input.kind === "tweak"
        ? "Tweak"
        : "Prompt";

  return `
    <button
      type="button"
      ${attributeName}="${input.kind}"
      aria-label="${label}"
      aria-pressed="${input.active ? "true" : "false"}"
      title="${label}"
      style="${toolbarButtonStyle(input.kind, input.active)}"
    >
      <span aria-hidden="true" style="${toolbarButtonBaseStyle(input.active)}"></span>
      <span aria-hidden="true" style="${toolbarIconWrapStyle(input.kind, input.active)}">
        ${renderToolbarIcon(input.kind, input.active)}
      </span>
      ${input.badge ? `<span style="${toolbarBadgeStyle(input.kind)}">${escapeHtml(input.badge)}</span>` : ""}
    </button>`;
}

function renderToolbarIcon(kind: ToolbarButtonKind, active: boolean): string {
  const stroke = active ? toolbarAccentColor(kind) : "#5b5b60";

  if (kind === "sketch") {
    return markerIconSvg;
  }

  if (kind === "comment") {
    return stickyIconSvg;
  }

  if (kind === "tweak") {
    return `
      <svg width="46" height="46" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M11.5 8.7L28.6 19.7L20.8 21.7L24.7 30.5L20.7 32.1L16.8 23.2L11.5 29.3V8.7Z" stroke="${stroke}" stroke-width="2.2" stroke-linejoin="round"/>
      </svg>`;
  }

  return `
    <svg width="46" height="46" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.6 12.3C9.6 10.7 10.9 9.4 12.5 9.4H27.5C29.1 9.4 30.4 10.7 30.4 12.3V20.4C30.4 22 29.1 23.3 27.5 23.3H21.3L15.3 28.2V23.3H12.5C10.9 23.3 9.6 22 9.6 20.4V12.3Z" stroke="${stroke}" stroke-width="2.1" stroke-linejoin="round"/>
      <path d="M15.1 15.2H24.9" stroke="${stroke}" stroke-width="1.9" stroke-linecap="round"/>
      <path d="M15.1 18.9H22.6" stroke="${stroke}" stroke-width="1.9" stroke-linecap="round" opacity="0.7"/>
    </svg>`;
}

function renderPromptSendIcon(): string {
  return `
    <svg width="54" height="54" viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M14 18L38.5 28L14 38V30.5L28.5 28L14 25.5V18Z" fill="currentColor"/>
    </svg>`;
}

function renderPromptAttachmentTab(input: {
  kind: "comment" | "sketch";
  label: string;
  clearAttribute: "data-variant-comments-clear" | "data-variant-sketch-clear";
}): string {
  return `
    <div style="${promptAttachmentTabStyle(input.kind)}">
      <span aria-hidden="true" style="${promptAttachmentIconStyle(input.kind)}">${renderPromptAttachmentIcon(input.kind)}</span>
      <span style="${promptAttachmentLabelStyle()}">${escapeHtml(input.label)}</span>
      <button
        type="button"
        ${input.clearAttribute}="true"
        aria-label="Remove ${escapeHtml(input.label)}"
        title="Remove ${escapeHtml(input.label)}"
        style="${promptAttachmentClearStyle()}"
      >×</button>
    </div>`;
}

function renderPromptAttachmentIcon(kind: "comment" | "sketch"): string {
  if (kind === "comment") {
    return stickyIconSvg;
  }

  return markerIconSvg;
}

