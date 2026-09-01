import {
  confirm,
  getAllEditor,
  getFrontend,
  Plugin,
  showMessage,
  type Protyle,
} from "siyuan";
import { AdvancedCodeEditor } from "./editor";
import { DEFAULT_LANG, getLanguageLabel, normalizeLanguageId } from "./languages";
import {
  ATTR_MARKER,
  ATTR_TABS,
  decodeTabs,
  getBlockAttrs,
  insertBlockMarkdown,
  makeAdvancedCodeMarkdown,
  makeInitialTabs,
  makeNativeCodeMarkdown,
  querySql,
  readNativeCodeBlock,
  saveKnownBlockId,
  updateBlockMarkdown,
} from "./siyuan-api";
import type { BlockAttrs, CodeTab } from "./types";
import "./styles.scss";

type ProtyleLike = Protyle & {
  element?: HTMLElement;
  wysiwyg?: { element?: HTMLElement };
  protyle?: {
    block?: { rootID?: string };
    wysiwyg?: { element?: HTMLElement };
  };
  getInstance?: () => Protyle;
};

type BlockIconEvent = CustomEvent<{
  menu: {
    addItem(item: {
      id?: string;
      icon?: string;
      iconHTML?: string;
      label: string;
      click: () => void;
    }): void;
  };
  protyle: ProtyleLike;
  blockElements: HTMLElement[];
}>;

type SqlBlockRow = {
  id: string;
};

type SqlRootRow = {
  root_id: string;
};

const ICON = `<symbol id="iconAdvancedCode" viewBox="0 0 32 32">
  <path d="M8.6 11.2 3.8 16l4.8 4.8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M23.4 11.2 28.2 16l-4.8 4.8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="m19.3 6.8-6.6 18.4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
</symbol>`;

export default class AdvancedCodePlugin extends Plugin {
  private readonly mountedEditors = new Map<string, AdvancedCodeEditor>();
  private readonly originalBlockHTML = new Map<string, string>();
  private observer?: MutationObserver;
  private lastProtyle?: ProtyleLike;
  private lastBlockElements: HTMLElement[] = [];
  private isMobile = false;

  onload() {
    this.isMobile = ["mobile", "browser-mobile"].includes(getFrontend());
    this.addIcons(ICON);
    this.registerCommands();
    this.registerSlashCommands();
    this.eventBus.on("click-blockicon", this.onBlockIcon);
    this.eventBus.on("click-editorcontent", this.onEditorContent);
    this.startDomObserver();
  }

  onunload() {
    this.eventBus.off("click-blockicon", this.onBlockIcon);
    this.eventBus.off("click-editorcontent", this.onEditorContent);
    this.observer?.disconnect();
    this.mountedEditors.forEach((editor) => editor.destroy());
    this.mountedEditors.clear();
    this.originalBlockHTML.clear();
    this.lastBlockElements = [];
  }

  async uninstall() {
    try {
      const count = await this.convertAllAdvancedCodeBlocksToNative();
      if (count > 0) showMessage(`Advanced Code uninstall converted ${count} block(s) back to native code.`);
    } catch (err) {
      console.error("Advanced Code uninstall conversion failed:", err);
      showMessage(`Advanced Code uninstall conversion failed: ${String((err as Error).message || err)}`, 6000, "error");
    }
  }

  onLayoutReady() {
    this.scanAdvancedCodeBlocks();
  }

  private startDomObserver() {
    this.observer = new MutationObserver(() => this.scanAdvancedCodeBlocks());
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [ATTR_MARKER],
    });
    window.setTimeout(() => this.scanAdvancedCodeBlocks(), 300);
  }

  private scanAdvancedCodeBlocks() {
    document.querySelectorAll<HTMLElement>(`[data-node-id][${ATTR_MARKER}="true"]`).forEach((element) => {
      void this.mountAdvancedCodeElement(element);
    });
  }

  private async mountAdvancedCodeElement(element: HTMLElement) {
    const blockId = element.dataset.nodeId || "";
    if (!blockId || element.dataset.advancedCodeMounted === "true") return;
    element.dataset.advancedCodeMounted = "true";

    const mount = document.createElement("div");
    mount.className = "acode-render-host";
    if (!this.originalBlockHTML.has(blockId)) {
      const original = element.cloneNode(true) as HTMLElement;
      delete original.dataset.advancedCodeMounted;
      original.removeAttribute("contenteditable");
      this.originalBlockHTML.set(blockId, original.outerHTML);
    }
    // Keep Protyle from treating CodeMirror input as edits to the paragraph.
    element.setAttribute("contenteditable", "false");
    element.replaceChildren(mount);

    try {
      const attrs = await getBlockAttrs(blockId);
      if (!element.isConnected || element.getAttribute(ATTR_MARKER) !== "true" || element.dataset.advancedCodeMounted !== "true") {
        return;
      }
      this.mountedEditors.get(blockId)?.destroy();
      const editor = new AdvancedCodeEditor({
        blockId,
        attrs,
        host: mount,
        onNativeConversion: async (id, tabs) => this.convertAdvancedCodeBlockToNative(id, tabs),
      });
      this.mountedEditors.set(blockId, editor);
    } catch (err) {
      console.error("Render Advanced Code failed:", err);
      mount.textContent = `Advanced Code render failed: ${String((err as Error).message || err)}`;
    }
  }

  private registerCommands() {
    this.addCommand({
      langKey: "Convert selected native code block to Advanced Code",
      langText: "Convert selected native code block to Advanced Code",
      hotkey: "",
      callback: () => void this.convertCurrentSelectionToAdvancedCode(),
    });
    this.addCommand({
      langKey: "Convert selected Advanced Code block to native code",
      langText: "Convert selected Advanced Code block to native code",
      hotkey: "",
      callback: () => void this.convertCurrentSelectionToNativeCode(),
    });
    this.addCommand({
      langKey: "Batch convert current document native code blocks to Advanced Code",
      langText: "Batch convert current document native code blocks to Advanced Code",
      hotkey: "",
      callback: () => void this.batchConvertDocumentNativeCodeBlocks(),
    });
    this.addCommand({
      langKey: "Batch convert current document Advanced Code blocks to native code",
      langText: "Batch convert current document Advanced Code blocks to native code",
      hotkey: "",
      callback: () => void this.batchConvertDocumentAdvancedCodeBlocks(),
    });
  }

  private registerSlashCommands() {
    this.protyleSlash = [
      {
        id: "insertAdvancedCode",
        filter: ["advanced code", "高级代码块", "多标签代码块", "acode"],
        html: `<div class="b3-list-item__first"><span class="b3-list-item__text">Advanced Code</span><span class="b3-list-item__meta">CodeMirror</span></div>`,
        callback: (protyle: Protyle, nodeElement: HTMLElement) => {
          this.lastProtyle = protyle as ProtyleLike;
          const blockId = nodeElement.dataset.nodeId || nodeElement.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId;
          if (!blockId) {
            showMessage("Cannot locate the current block.", 4000, "error");
            return;
          }
          void this.convertBlockToAdvancedCode(blockId, "", DEFAULT_LANG);
        },
      },
    ];
  }

  private readonly onEditorContent = (event: CustomEvent<{ protyle: ProtyleLike; event?: Event }>) => {
    this.lastProtyle = event.detail.protyle;
    const target = event.detail.event?.target;
    const element = target instanceof Element ? target.closest<HTMLElement>("[data-node-id]") : undefined;
    this.lastBlockElements = element ? [element] : [];
  };

  private readonly onBlockIcon = (event: Event) => {
    const { detail } = event as BlockIconEvent;
    this.lastProtyle = detail.protyle;
    const blockElements = detail.blockElements || [];
    this.lastBlockElements = blockElements;
    const first = blockElements[0];
    const isNative = first ? this.isNativeCodeElement(first) : false;
    const isAdvanced = first ? this.isAdvancedCodeElement(first) : false;

    if (isNative) {
      detail.menu.addItem({
        id: "advanced-code-convert-native",
        icon: "iconAdvancedCode",
        label: "转换为 Advanced Code",
        click: () => void this.convertElementsToAdvancedCode(blockElements),
      });
    }

    if (isAdvanced) {
      detail.menu.addItem({
        id: "advanced-code-convert-back",
        icon: "iconCode",
        label: "转回原生代码块",
        click: () => void this.convertElementsToNativeCode(blockElements),
      });
    }

    detail.menu.addItem({
      id: "advanced-code-batch-native",
      icon: "iconAdvancedCode",
      label: "批量转换整个文档原生代码块",
      click: () => void this.batchConvertDocumentNativeCodeBlocks(),
    });
    detail.menu.addItem({
      id: "advanced-code-batch-advanced",
      icon: "iconCode",
      label: "批量转回整个文档 Advanced Code",
      click: () => void this.batchConvertDocumentAdvancedCodeBlocks(),
    });
  };

  private getActiveProtyle(): ProtyleLike | undefined {
    if (this.lastProtyle) return this.lastProtyle;
    const editors = getAllEditor();
    return editors[0] as ProtyleLike | undefined;
  }

  private getActiveBlockElements() {
    const protyle = this.getActiveProtyle();
    const root = this.getEditorRoot(protyle);
    const cached = this.lastBlockElements.filter((element) => element.isConnected);
    if (cached.length > 0) return cached;

    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const element = (node instanceof HTMLElement ? node : node?.parentElement)?.closest<HTMLElement>("[data-node-id]");
    if (element) return [element];

    if (!root) return [];
    const selected = Array.from(root.querySelectorAll<HTMLElement>(".protyle-wysiwyg--select[data-node-id]"));
    if (selected.length > 0) return selected;

    const focused = document.activeElement?.closest<HTMLElement>("[data-node-id]");
    return focused ? [focused] : [];
  }

  private getVisibleBlockElements(predicate: (element: HTMLElement) => boolean) {
    const protyle = this.getActiveProtyle();
    const root = this.getEditorRoot(protyle);
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>("[data-node-id]")).filter(predicate);
  }

  private getEditorRoot(protyle?: ProtyleLike) {
    return protyle?.protyle?.wysiwyg?.element
      || protyle?.wysiwyg?.element
      || protyle?.element?.querySelector<HTMLElement>(".protyle-wysiwyg");
  }

  private isNativeCodeElement(element: HTMLElement) {
    return element.dataset.type === "NodeCodeBlock" || element.classList.contains("code-block");
  }

  private isAdvancedCodeElement(element: HTMLElement) {
    return element.getAttribute(ATTR_MARKER) === "true";
  }

  private async convertCurrentSelectionToAdvancedCode() {
    const elements = this.getActiveBlockElements();
    if (elements.length === 0) {
      showMessage("Select a native code block first.", 4000, "error");
      return;
    }
    await this.convertElementsToAdvancedCode(elements);
  }

  private async convertCurrentSelectionToNativeCode() {
    const elements = this.getActiveBlockElements();
    if (elements.length === 0) {
      showMessage("Select an Advanced Code block first.", 4000, "error");
      return;
    }
    await this.convertElementsToNativeCode(elements);
  }

  private async batchConvertDocumentNativeCodeBlocks() {
    const rootId = await this.getActiveDocumentId();
    if (!rootId) {
      showMessage("Cannot locate the current document.", 4000, "error");
      return;
    }
    const rows = await this.getDocumentNativeCodeBlocks(rootId);
    if (rows.length === 0) {
      showMessage("No native code blocks found in the current document.");
      return;
    }
    confirm("Advanced Code", `Convert ${rows.length} native code block(s) in the current document to Advanced Code?`, () => {
      void this.convertNativeCodeRowsToAdvancedCode(rows);
    });
  }

  private async batchConvertDocumentAdvancedCodeBlocks() {
    const rootId = await this.getActiveDocumentId();
    if (!rootId) {
      showMessage("Cannot locate the current document.", 4000, "error");
      return;
    }
    const rows = await this.getDocumentAdvancedCodeBlocks(rootId);
    if (rows.length === 0) {
      showMessage("No Advanced Code blocks found in the current document.");
      return;
    }
    confirm("Advanced Code", `Convert ${rows.length} Advanced Code block(s) in the current document back to native code?`, () => {
      void this.convertAdvancedCodeRowsToNativeCode(rows);
    });
  }

  private async convertElementsToAdvancedCode(elements: HTMLElement[]) {
    let converted = 0;
    for (const element of elements) {
      const id = element.dataset.nodeId;
      if (!id || !this.isNativeCodeElement(element)) continue;
      const native = await readNativeCodeBlock(id);
      if (!native.isCodeBlock) continue;
      await this.convertBlockToAdvancedCode(id, native.code, native.lang);
      converted += 1;
    }
    showMessage(`Converted ${converted} native code block(s) to Advanced Code.`);
  }

  private async convertElementsToNativeCode(elements: HTMLElement[]) {
    let converted = 0;
    for (const element of elements) {
      const id = element.dataset.nodeId;
      if (!id || !this.isAdvancedCodeElement(element)) continue;
      await this.convertAdvancedCodeBlockToNative(id);
      converted += 1;
    }
    showMessage(`Converted ${converted} Advanced Code block(s) to native code.`);
  }

  private async convertNativeCodeRowsToAdvancedCode(rows: SqlBlockRow[]) {
    let converted = 0;
    for (const row of rows) {
      if (!row.id) continue;
      const native = await readNativeCodeBlock(row.id);
      if (!native.isCodeBlock) continue;
      await this.convertBlockToAdvancedCode(row.id, native.code, native.lang);
      converted += 1;
    }
    showMessage(`Converted ${converted} native code block(s) in the current document to Advanced Code.`);
  }

  private async convertAdvancedCodeRowsToNativeCode(rows: SqlBlockRow[]) {
    let converted = 0;
    for (const row of rows) {
      if (!row.id) continue;
      await this.convertAdvancedCodeBlockToNative(row.id);
      converted += 1;
    }
    showMessage(`Converted ${converted} Advanced Code block(s) in the current document to native code.`);
  }

  private async convertBlockToAdvancedCode(blockId: string, code: string, lang: string) {
    const tabs = makeInitialTabs(code, lang);
    await this.updateBlockForConversion(blockId, makeAdvancedCodeMarkdown(blockId, tabs, tabs[0].id));
    await saveKnownBlockId(this, blockId);
  }

  private async convertAdvancedCodeBlockToNative(blockId: string, knownTabs?: CodeTab[]) {
    const attrs = await getBlockAttrs(blockId);
    const tabs = knownTabs || decodeTabs(attrs[ATTR_TABS]);
    const normalizedTabs = tabs.length > 0 ? tabs : makeInitialTabs("", DEFAULT_LANG);
    const originalHTML = this.originalBlockHTML.get(blockId);
    // The kernel already knows the target block id; embedding it in the fenced
    // markdown makes the generated inverse operation invalid in SiYuan 3.8.x.
    await this.updateBlockForConversion(
      blockId,
      makeNativeCodeMarkdown(normalizedTabs[0]),
      normalizedTabs.length === 1 ? originalHTML : undefined,
      normalizedTabs.length === 1,
    );

    let previousId = blockId;
    for (const tab of normalizedTabs.slice(1)) {
      const result = await insertBlockMarkdown(makeNativeCodeMarkdown(tab), previousId);
      previousId = result[0]?.doOperations?.[0]?.id || previousId;
    }
    this.originalBlockHTML.delete(blockId);
  }

  private getBlockElement(blockId: string) {
    return Array.from(document.querySelectorAll<HTMLElement>("[data-node-id]"))
      .find((element) => element.dataset.nodeId === blockId);
  }

  private getTransactionProtyle() {
    const candidate = this.getActiveProtyle();
    const instance = candidate?.getInstance?.() || candidate;
    return typeof instance?.updateTransaction === "function" ? instance : undefined;
  }

  private async getActiveDocumentId() {
    const visibleBlockId = this.getVisibleEditorBlockId();
    if (visibleBlockId) {
      const rootId = await this.getRootIdForBlock(visibleBlockId);
      if (rootId) return rootId;
    }

    const protyle = this.getActiveProtyle();
    const rootId = protyle?.protyle?.block?.rootID;
    if (rootId) return rootId;

    const candidates = [
      ...this.getActiveBlockElements(),
      ...(this.getEditorRoot(protyle) ? Array.from(this.getEditorRoot(protyle)!.querySelectorAll<HTMLElement>("[data-node-id]")).slice(0, 1) : []),
    ];
    const blockId = candidates.find((element) => element.dataset.nodeId)?.dataset.nodeId;
    if (!blockId) return undefined;

    return this.getRootIdForBlock(blockId);
  }

  private getVisibleEditorBlockId() {
    const focusedBlock = document.activeElement?.closest<HTMLElement>("[data-node-id]");
    if (focusedBlock && this.isElementVisible(focusedBlock)) return focusedBlock.dataset.nodeId;

    const selection = window.getSelection();
    const anchorElement = selection?.anchorNode instanceof HTMLElement ? selection.anchorNode : selection?.anchorNode?.parentElement;
    const selectionBlock = anchorElement?.closest<HTMLElement>("[data-node-id]");
    if (selectionBlock && this.isElementVisible(selectionBlock)) return selectionBlock.dataset.nodeId;

    const selectedBlock = Array.from(document.querySelectorAll<HTMLElement>(".protyle-wysiwyg--select[data-node-id]"))
      .find((element) => this.isElementVisible(element));
    if (selectedBlock?.dataset.nodeId) return selectedBlock.dataset.nodeId;

    const visibleEditor = Array.from(document.querySelectorAll<HTMLElement>(".protyle-wysiwyg"))
      .find((element) => this.isElementVisible(element));
    return visibleEditor?.querySelector<HTMLElement>("[data-node-id]")?.dataset.nodeId;
  }

  private isElementVisible(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0
      && rect.height > 0
      && rect.bottom >= 0
      && rect.right >= 0
      && rect.top <= window.innerHeight
      && rect.left <= window.innerWidth
      && getComputedStyle(element).visibility !== "hidden"
      && getComputedStyle(element).display !== "none";
  }

  private async getRootIdForBlock(blockId: string) {
    const rows = await querySql<SqlRootRow>(
      `select root_id from blocks where id = '${this.escapeSql(blockId)}' limit 1`,
    );
    return rows[0]?.root_id || undefined;
  }

  private async getDocumentNativeCodeBlocks(rootId: string) {
    return querySql<SqlBlockRow>(
      `select id from blocks where root_id = '${this.escapeSql(rootId)}' and type = 'c' order by sort, id`,
    );
  }

  private async getDocumentAdvancedCodeBlocks(rootId: string) {
    return querySql<SqlBlockRow>(
      `select id from blocks where root_id = '${this.escapeSql(rootId)}' and ial like '%${ATTR_MARKER}="true"%' order by sort, id`,
    );
  }

  private escapeSql(value: string) {
    return value.replaceAll("'", "''");
  }

  private async updateBlockForConversion(
    blockId: string,
    markdown: string,
    originalHTMLOverride?: string,
    registerUndo = true,
  ) {
    const originalHTML = originalHTMLOverride || (registerUndo ? this.getBlockElement(blockId)?.outerHTML : undefined);
    const result = await updateBlockMarkdown(blockId, markdown);
    if (!registerUndo || !originalHTML) return result;

    const update = result
      .flatMap((transaction) => transaction.doOperations || [])
      .find((operation) => operation.action === "update" && operation.id === blockId && typeof operation.data === "string");
    const protyle = this.getTransactionProtyle();
    if (protyle && update?.data) {
      protyle.updateTransaction(blockId, update.data, originalHTML);
    }
    return result;
  }

  private async convertAllAdvancedCodeBlocksToNative() {
    const rows = await querySql<SqlBlockRow>(
      `select id from blocks where ial like '%${ATTR_MARKER}="true"%' order by created`,
    );
    let count = 0;
    for (const row of rows) {
      await this.convertAdvancedCodeBlockToNative(row.id);
      count += 1;
    }
    return count;
  }
}
