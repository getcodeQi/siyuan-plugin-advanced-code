import { fetchPost } from "siyuan";
import { DEFAULT_LANG, getLanguageLabel, normalizeLanguageId } from "./languages";
import type { BlockAttrs, CodeTab, KernelResponse, NativeCodeBlock, TransactionResult } from "./types";

export const ATTR_MARKER = "custom-advanced-code";
export const ATTR_TABS = "custom-advanced-code-tabs";
export const ATTR_ACTIVE_TAB = "custom-advanced-code-active-tab";
export const ATTR_VERSION = "custom-advanced-code-version";
export const STORAGE_INDEX = "advanced-code-block-index.json";

export function makeTab(code = "", lang = DEFAULT_LANG, index = 1): CodeTab {
  const normalizedLang = normalizeLanguageId(lang);
  return {
    id: `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${index}`,
    label: getLanguageLabel(normalizedLang),
    code,
    lang: normalizedLang,
  };
}

export function makeInitialTabs(code = "", lang = DEFAULT_LANG): CodeTab[] {
  return [{ ...makeTab(code, lang, 1), id: "tab-1" }];
}

export function normalizeTabs(tabs: CodeTab[]): CodeTab[] {
  const normalized = tabs
    .filter((tab) => tab && typeof tab === "object")
    .map((tab, index) => {
      const lang = normalizeLanguageId(tab.lang || DEFAULT_LANG);
      return {
        id: String(tab.id || `tab-${index + 1}`),
        label: String(tab.label || getLanguageLabel(lang)),
        code: String(tab.code || ""),
        lang,
      };
    });

  return normalized.length > 0 ? normalized : makeInitialTabs();
}

export function encodeTabs(tabs: CodeTab[]) {
  const json = JSON.stringify(normalizeTabs(tabs));
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeTabs(raw: string | undefined): CodeTab[] {
  if (!raw) return makeInitialTabs();
  try {
    const padded = raw.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(raw.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return normalizeTabs(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    try {
      return normalizeTabs(JSON.parse(raw));
    } catch {
      return makeInitialTabs();
    }
  }
}

export function attrsFromTabs(tabs: CodeTab[], activeTabId?: string): BlockAttrs {
  const normalizedTabs = normalizeTabs(tabs);
  const active = activeTabId && normalizedTabs.some((tab) => tab.id === activeTabId)
    ? activeTabId
    : normalizedTabs[0].id;

  return {
    [ATTR_MARKER]: "true",
    [ATTR_TABS]: encodeTabs(normalizedTabs),
    [ATTR_ACTIVE_TAB]: active,
    [ATTR_VERSION]: "1",
  };
}

function escapeIal(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

export function makeAdvancedCodeMarkdown(blockId: string, tabs: CodeTab[], activeTabId?: string) {
  const attrs = attrsFromTabs(tabs, activeTabId);
  const ial = Object.entries({ id: blockId, ...attrs })
    .map(([key, value]) => `${key}="${escapeIal(value)}"`)
    .join(" ");

  return `Advanced Code\n{: ${ial}}`;
}

export function makeNativeCodeMarkdown(tab: CodeTab, blockId?: string) {
  const lang = normalizeLanguageId(tab.lang || DEFAULT_LANG);
  const code = String(tab.code || "").replace(/\n?$/, "");
  const ial = blockId ? `\n{: id="${blockId}"}` : "";
  return `\`\`\`${lang}\n${code}\n\`\`\`${ial}`;
}

export function post<T>(url: string, data: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    fetchPost(url, data, (rawResponse) => {
      const response = rawResponse as KernelResponse<T>;
      if (response.code !== 0) {
        reject(new Error(response.msg || `${url} failed with code ${response.code}`));
        return;
      }
      resolve(response.data);
    });
  });
}

export async function getBlockAttrs(id: string): Promise<BlockAttrs> {
  return post<BlockAttrs>("/api/attr/getBlockAttrs", { id });
}

export async function setBlockAttrs(id: string, attrs: BlockAttrs): Promise<void> {
  await post<null>("/api/attr/setBlockAttrs", { id, attrs });
}

export async function updateBlockMarkdown(id: string, markdown: string): Promise<TransactionResult[]> {
  return post<TransactionResult[]>("/api/block/updateBlock", {
    id,
    dataType: "markdown",
    data: markdown,
    lockType: false,
  });
}

export async function insertBlockMarkdown(markdown: string, previousID: string): Promise<TransactionResult[]> {
  return post<TransactionResult[]>("/api/block/insertBlock", {
    dataType: "markdown",
    data: markdown,
    previousID,
  });
}

export async function querySql<T>(stmt: string): Promise<T[]> {
  return post<T[]>("/api/query/sql", { stmt });
}

export async function getBlockKramdown(id: string): Promise<string> {
  const data = await post<{ id: string; kramdown: string }>("/api/block/getBlockKramdown", { id });
  return data.kramdown || "";
}

export function parseNativeCodeKramdown(kramdown: string): NativeCodeBlock {
  const trimmed = kramdown.trimEnd();
  const match = trimmed.match(/^(```+|~~~+)([^\n]*)\n([\s\S]*?)\n\1(?:\n\{:[\s\S]*\})?$/);
  if (!match) {
    return { isCodeBlock: false, code: "", lang: "" };
  }

  return {
    isCodeBlock: true,
    lang: normalizeLanguageId(match[2].trim() || DEFAULT_LANG),
    code: match[3],
  };
}

export async function readNativeCodeBlock(id: string): Promise<NativeCodeBlock> {
  return parseNativeCodeKramdown(await getBlockKramdown(id));
}

export async function saveKnownBlockId(plugin: { loadData(name: string): Promise<unknown>; saveData(name: string, data: unknown): Promise<void> }, blockId: string) {
  if (!blockId) return;
  let ids: string[] = [];
  try {
    const value = await plugin.loadData(STORAGE_INDEX);
    if (Array.isArray(value)) ids = value.filter((id) => typeof id === "string");
  } catch {
    ids = [];
  }
  if (!ids.includes(blockId)) {
    ids.push(blockId);
    await plugin.saveData(STORAGE_INDEX, ids);
  }
}
