import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { showMessage } from "siyuan";
import { DEFAULT_LANG, getCodeMirrorBaseExtensions, getLanguageLabel, getLanguageSelectOptions, normalizeLanguageId } from "./languages";
import {
  ATTR_ACTIVE_TAB,
  ATTR_TABS,
  attrsFromTabs,
  decodeTabs,
  insertBlockMarkdown,
  makeNativeCodeMarkdown,
  makeTab,
  setBlockAttrs,
} from "./siyuan-api";
import type { BlockAttrs, CodeTab } from "./types";

type AdvancedCodeEditorOptions = {
  blockId: string;
  attrs: BlockAttrs;
  host: HTMLElement;
  onNativeConversion?: (blockId: string, tabs: CodeTab[]) => Promise<void>;
};

function debounce(fn: () => void, ms: number) {
  let handle = 0;
  return () => {
    window.clearTimeout(handle);
    handle = window.setTimeout(fn, ms);
  };
}

export class AdvancedCodeEditor {
  private readonly blockId: string;
  private readonly host: HTMLElement;
  private readonly onNativeConversion?: (blockId: string, tabs: CodeTab[]) => Promise<void>;
  private tabs: CodeTab[];
  private activeTabId: string;
  private editorView?: EditorView;
  private readonly persistSoon: () => void;
  private destroyed = false;

  constructor(options: AdvancedCodeEditorOptions) {
    this.blockId = options.blockId;
    this.host = options.host;
    this.onNativeConversion = options.onNativeConversion;
    this.tabs = decodeTabs(options.attrs[ATTR_TABS]);
    this.activeTabId = options.attrs[ATTR_ACTIVE_TAB] || this.tabs[0].id;
    if (!this.tabs.some((tab) => tab.id === this.activeTabId)) this.activeTabId = this.tabs[0].id;
    this.persistSoon = debounce(() => void this.persist(), 350);
    this.render();
  }

  destroy() {
    this.destroyed = true;
    this.editorView?.destroy();
    const block = this.host.parentElement;
    if (block?.dataset.advancedCodeMounted === "true") {
      delete block.dataset.advancedCodeMounted;
      block.removeAttribute("contenteditable");
      block.replaceChildren(document.createTextNode("Advanced Code"));
    }
    this.host.replaceChildren();
  }

  private get activeTab() {
    return this.tabs.find((tab) => tab.id === this.activeTabId) || this.tabs[0];
  }

  private render() {
    this.editorView?.destroy();
    this.host.classList.add("acode-render-host");
    this.host.replaceChildren();

    const shell = document.createElement("div");
    shell.className = "acode-shell";
    ["beforeinput", "input", "paste", "keydown", "keyup", "compositionstart", "compositionupdate", "compositionend", "pointerdown"].forEach((eventName) => {
      shell.addEventListener(eventName, (event) => event.stopPropagation());
    });

    const header = document.createElement("div");
    header.className = "acode-header";

    const titleIcon = document.createElement("span");
    titleIcon.className = "acode-title-icon";
    titleIcon.innerHTML = `<svg><use xlink:href="#iconCode"></use></svg>`;

    const labelInput = document.createElement("input");
    labelInput.className = "acode-title-input";
    labelInput.value = this.activeTab.label;
    labelInput.placeholder = "Tab name";
    labelInput.addEventListener("input", () => {
      this.activeTab.label = labelInput.value || getLanguageLabel(this.activeTab.lang);
      this.renderTabs(shell.querySelector(".acode-tabs") as HTMLElement);
      this.persistSoon();
    });

    const titleArea = document.createElement("label");
    titleArea.className = "acode-title-area";
    titleArea.append(titleIcon, labelInput);

    const meta = document.createElement("span");
    meta.className = "acode-meta";
    meta.textContent = `${this.tabs.length} tab${this.tabs.length === 1 ? "" : "s"}`;

    const langSelect = document.createElement("select");
    langSelect.className = "acode-lang-select";
    for (const option of getLanguageSelectOptions(this.activeTab.lang)) {
      const item = document.createElement("option");
      item.value = option.value;
      item.textContent = option.label;
      item.selected = option.value === normalizeLanguageId(this.activeTab.lang);
      langSelect.append(item);
    }
    langSelect.addEventListener("change", () => {
      const previousLang = this.activeTab.lang;
      this.activeTab.lang = normalizeLanguageId(langSelect.value || DEFAULT_LANG);
      if (!labelInput.value || labelInput.value === getLanguageLabel(previousLang)) {
        this.activeTab.label = getLanguageLabel(this.activeTab.lang);
      }
      this.persistSoon();
      this.render();
    });

    const actions = document.createElement("div");
    actions.className = "acode-actions";
    actions.append(
      this.iconButton("iconAdd", "Add tab", () => this.addTab()),
      this.iconButton("iconTrashcan", "Delete current tab", () => this.removeActiveTab()),
      this.iconButton("iconCode", "Convert to native code block", () => void this.convertToNative()),
    );

    header.append(titleArea, meta, langSelect, actions);

    const tabsElement = document.createElement("div");
    tabsElement.className = "acode-tabs";
    this.renderTabs(tabsElement);

    const editorHost = document.createElement("div");
    editorHost.className = "acode-editor-host";

    shell.append(header, tabsElement, editorHost);
    this.host.append(shell);

    this.editorView = new EditorView({
      parent: editorHost,
      state: EditorState.create({
        doc: this.activeTab.code,
        extensions: getCodeMirrorBaseExtensions((code) => {
          this.activeTab.code = code;
          this.persistSoon();
        }, this.activeTab.lang),
      }),
    });
  }

  private renderTabs(container: HTMLElement) {
    container.replaceChildren();
    let draggedTabId = "";
    let dragged = false;
    let suppressClickUntil = 0;

    this.tabs.forEach((tab) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `acode-tab${tab.id === this.activeTabId ? " acode-tab-active" : ""}`;
      button.dataset.tabId = tab.id;
      button.textContent = tab.label || getLanguageLabel(tab.lang);
      button.draggable = false;
      button.title = `${button.textContent} (${normalizeLanguageId(tab.lang)})`;
      button.addEventListener("click", () => {
        if (performance.now() < suppressClickUntil) return;
        if (this.activeTabId !== tab.id) {
          this.activeTabId = tab.id;
          this.persistSoon();
          this.render();
        }
      });
      button.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        draggedTabId = tab.id;
        dragged = false;
        const startX = event.clientX;
        const startY = event.clientY;
        button.setPointerCapture?.(event.pointerId);

        const onMove = (moveEvent: PointerEvent) => {
          if (!draggedTabId) return;
          if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 4) dragged = true;
          if (!dragged) return;

          const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest<HTMLButtonElement>(".acode-tab");
          const targetId = target?.dataset.tabId || "";
          if (!target || !targetId || targetId === draggedTabId) return;

          const sourceIndex = this.tabs.findIndex((item) => item.id === draggedTabId);
          const targetIndex = this.tabs.findIndex((item) => item.id === targetId);
          if (sourceIndex < 0 || targetIndex < 0) return;
          this.moveTab(draggedTabId, targetId, false);
          if (sourceIndex < targetIndex) container.insertBefore(button, target.nextSibling);
          else container.insertBefore(button, target);
        };
        const onEnd = () => {
          if (dragged) {
            suppressClickUntil = performance.now() + 300;
            this.persistSoon();
          }
          draggedTabId = "";
          button.removeEventListener("pointermove", onMove);
          button.removeEventListener("pointerup", onEnd);
          button.removeEventListener("pointercancel", onEnd);
        };

        button.addEventListener("pointermove", onMove);
        button.addEventListener("pointerup", onEnd);
        button.addEventListener("pointercancel", onEnd);
      });
      container.append(button);
    });
  }

  private iconButton(icon: string, title: string, onClick: () => void) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "acode-icon-button";
    button.title = title;
    button.ariaLabel = title;
    button.innerHTML = `<svg><use xlink:href="#${icon}"></use></svg>`;
    button.addEventListener("click", onClick);
    return button;
  }

  private addTab() {
    const tab = makeTab("", this.activeTab.lang, this.tabs.length + 1);
    this.tabs.push(tab);
    this.activeTabId = tab.id;
    this.persistSoon();
    this.render();
  }

  private removeActiveTab() {
    if (this.tabs.length === 1) {
      showMessage("Advanced Code needs at least one tab.");
      return;
    }
    const index = this.tabs.findIndex((tab) => tab.id === this.activeTabId);
    this.tabs.splice(Math.max(index, 0), 1);
    this.activeTabId = this.tabs[Math.max(0, index - 1)]?.id || this.tabs[0].id;
    this.persistSoon();
    this.render();
  }

  private moveTab(sourceId: string, targetId: string, render = true) {
    if (sourceId === targetId) return;
    const sourceIndex = this.tabs.findIndex((tab) => tab.id === sourceId);
    const targetIndex = this.tabs.findIndex((tab) => tab.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [source] = this.tabs.splice(sourceIndex, 1);
    this.tabs.splice(targetIndex, 0, source);
    this.persistSoon();
    if (render) this.render();
  }

  private async persist() {
    if (this.destroyed) return;
    try {
      await setBlockAttrs(this.blockId, attrsFromTabs(this.tabs, this.activeTabId));
    } catch (err) {
      console.error("Persist Advanced Code failed:", err);
      showMessage(`Advanced Code save failed: ${String((err as Error).message || err)}`);
    }
  }

  private async convertToNative() {
    try {
      await this.persist();
      if (this.onNativeConversion) {
        await this.onNativeConversion(this.blockId, this.tabs);
        return;
      }

      let previousId = this.blockId;
      for (const tab of this.tabs.slice(1)) {
        const result = await insertBlockMarkdown(makeNativeCodeMarkdown(tab), previousId);
        previousId = result[0]?.doOperations?.[0]?.id || previousId;
      }
      showMessage("Advanced Code tabs were inserted as native code blocks.");
    } catch (err) {
      console.error("Convert Advanced Code to native failed:", err);
      showMessage(`Convert failed: ${String((err as Error).message || err)}`);
    }
  }
}
