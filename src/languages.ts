import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { css } from "@codemirror/lang-css";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { php } from "@codemirror/lang-php";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import {
  codeFolding,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  syntaxHighlighting,
} from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";

export const DEFAULT_LANG = "javascript";

export const LANGUAGE_OPTIONS = [
  { value: "plaintext", label: "Plain Text" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "jsx", label: "JSX" },
  { value: "tsx", label: "TSX" },
  { value: "bash", label: "Bash" },
  { value: "shell", label: "Shell" },
  { value: "powershell", label: "PowerShell" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "objectivec", label: "Objective-C" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "kotlin", label: "Kotlin" },
  { value: "scala", label: "Scala" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "swift", label: "Swift" },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby" },
  { value: "perl", label: "Perl" },
  { value: "r", label: "R" },
  { value: "lua", label: "Lua" },
  { value: "matlab", label: "MATLAB" },
  { value: "html", label: "HTML" },
  { value: "xml", label: "XML" },
  { value: "css", label: "CSS" },
  { value: "scss", label: "SCSS" },
  { value: "less", label: "Less" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "toml", label: "TOML" },
  { value: "ini", label: "INI" },
  { value: "markdown", label: "Markdown" },
  { value: "sql", label: "SQL" },
  { value: "graphql", label: "GraphQL" },
  { value: "dockerfile", label: "Dockerfile" },
  { value: "makefile", label: "Makefile" },
  { value: "nginx", label: "Nginx" },
  { value: "diff", label: "Diff" },
  { value: "latex", label: "LaTeX" },
];

export const LANGUAGE_ALIASES: Record<string, string> = {
  "c++": "cpp",
  "c#": "csharp",
  cplusplus: "cpp",
  cs: "csharp",
  docker: "dockerfile",
  htm: "html",
  js: "javascript",
  m: "objectivec",
  md: "markdown",
  objc: "objectivec",
  plain: "plaintext",
  ps1: "powershell",
  py: "python",
  rb: "ruby",
  sh: "shell",
  text: "plaintext",
  ts: "typescript",
  txt: "plaintext",
  yml: "yaml",
  zsh: "shell",
};

export function normalizeLanguageId(lang: string) {
  const raw = String(lang || "").trim().toLowerCase();
  if (!raw) return DEFAULT_LANG;
  return LANGUAGE_ALIASES[raw] || raw;
}

export function getLanguageLabel(lang: string) {
  const normalized = normalizeLanguageId(lang);
  return LANGUAGE_OPTIONS.find((option) => option.value === normalized)?.label || normalized;
}

export function getLanguageSelectOptions(currentLang: string) {
  const normalized = normalizeLanguageId(currentLang);
  if (LANGUAGE_OPTIONS.some((option) => option.value === normalized)) return LANGUAGE_OPTIONS;
  return [{ value: normalized, label: normalized }, ...LANGUAGE_OPTIONS];
}

export function getLanguageExtension(lang: string): Extension {
  switch (normalizeLanguageId(lang)) {
    case "javascript":
      return javascript();
    case "typescript":
      return javascript({ typescript: true });
    case "jsx":
      return javascript({ jsx: true });
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "python":
      return python();
    case "html":
      return html();
    case "css":
    case "scss":
    case "less":
      return css();
    case "json":
      return json();
    case "markdown":
      return markdown();
    case "xml":
      return xml();
    case "java":
      return java();
    case "c":
    case "cpp":
      return cpp();
    case "rust":
      return rust();
    case "go":
      return go();
    case "php":
      return php();
    case "sql":
      return sql();
    default:
      return [];
  }
}

export function getCodeMirrorBaseExtensions(onChange: (code: string) => void, lang: string): Extension[] {
  return [
    lineNumbers(),
    history(),
    foldGutter(),
    codeFolding(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    getLanguageExtension(lang),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
    }),
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...foldKeymap]),
  ];
}
