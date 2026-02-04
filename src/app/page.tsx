"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { foldGutter, indentUnit } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { syntaxHighlighting } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { dracula } from "@uiw/codemirror-theme-dracula";
import examplesData from "../data/examples.json";

type Example = {
  title: string;
  description: string;
  titleCn?: string;
  descriptionCn?: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  tag: string;
  url: string;
  preview: string;
  slug: string;
  accent: string;
  codePreview?: string;
  codeLang?: string;
};

const examples = examplesData.examples as Example[];
const categories = [
  "All",
  "Basics",
  "Style",
  "Data",
  "3D & Terrain",
  "Interaction",
  "Performance",
  "Animation",
  "UI Patterns",
];

export default function Home() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState<"en" | "zh">("en");
  const [columns, setColumns] = useState<2 | 3 | 4>(4);
  const [activeExample, setActiveExample] = useState<Example | null>(null);
  const [activePreview, setActivePreview] = useState<Example | null>(null);
  const [snippetContent, setSnippetContent] = useState<string>("");
  const [snippetStatus, setSnippetStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">(
    "idle"
  );
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = {
    en: {
      brand: "MapLibre GL JS",
      title: "MapLibre GL JS Examples Dashboard",
      subtitle:
        "A curated, searchable grid of MapLibre GL JS demos with previews and full code snippets. Filter by category, scan difficulty, and open the exact example you need.",
      showing: "Showing",
      totalSuffix: "of",
      curated: "curated example tiles",
      searchPlaceholder: "Search examples, layers, or interaction patterns",
      noResults:
        "No examples match your search. Try a different keyword or reset the category.",
      openExample: "Open Example",
      preview: "Preview",
      language: "Language",
      columns: "Columns",
      all: "All",
      code: "Code",
      viewCode: "View Code",
      copyCode: "Copy Code",
      copied: "Copied",
      copyFailed: "Copy failed",
      close: "Close",
      codeLoading: "Loading code snippet...",
      codeError: "Snippet not found.",
      codeEmpty: "No code available for this example.",
    },
    zh: {
      brand: "MapLibre GL JS",
      title: "MapLibre GL JS 示例总览",
      subtitle:
        "可搜索的 MapLibre GL JS 示例看板，提供预览与完整代码。支持分类筛选、难度提示与一键打开示例。",
      showing: "显示",
      totalSuffix: "共",
      curated: "个示例卡片",
      searchPlaceholder: "搜索示例、图层或交互模式",
      noResults: "没有匹配的示例，请更换关键词或重置分类。",
      openExample: "打开示例",
      preview: "预览",
      language: "语言",
      columns: "列数",
      all: "全部",
      code: "代码",
      viewCode: "查看代码",
      copyCode: "复制代码",
      copied: "已复制",
      copyFailed: "复制失败",
      close: "关闭",
      codeLoading: "正在加载代码片段...",
      codeError: "未找到片段。",
      codeEmpty: "此示例暂无代码。",
    },
  } as const;

  const tagLabels: Record<string, { en: string; zh: string }> = {
    All: { en: "All", zh: "全部" },
    Basics: { en: "Basics", zh: "基础" },
    Style: { en: "Style", zh: "样式" },
    Data: { en: "Data", zh: "数据" },
    "3D & Terrain": { en: "3D & Terrain", zh: "3D 与地形" },
    Interaction: { en: "Interaction", zh: "交互" },
    Performance: { en: "Performance", zh: "性能" },
    Animation: { en: "Animation", zh: "动画" },
    "UI Patterns": { en: "UI Patterns", zh: "界面模式" },
  };

  const levelLabels: Record<Example["level"], { en: string; zh: string }> = {
    Beginner: { en: "Beginner", zh: "入门" },
    Intermediate: { en: "Intermediate", zh: "进阶" },
    Advanced: { en: "Advanced", zh: "高级" },
  };

  const filteredExamples = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return examples.filter((example) => {
      const matchesCategory =
        activeCategory === "All" || example.tag === activeCategory;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        example.title.toLowerCase().includes(normalizedQuery) ||
        example.description.toLowerCase().includes(normalizedQuery) ||
        example.tag.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, query]);

  const activeCode = snippetContent || activeExample?.codePreview || "";
  const hasCode = activeCode.trim().length > 0;
  const activeCodeLang = (activeExample?.codeLang || "javascript").toLowerCase();
  const modalContentState =
    snippetStatus === "loading" ? "loading" : hasCode ? "ready" : "empty";
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const languageExtension = useMemo(() => {
    if (activeCodeLang.includes("ts")) {
      return javascript({ typescript: true });
    }
    if (activeCodeLang.includes("json")) {
      return json();
    }
    if (activeCodeLang.includes("html")) {
      return html();
    }
    return javascript();
  }, [activeCodeLang]);

  useEffect(() => {
    setCopyStatus("idle");
    if (copyResetRef.current) {
      clearTimeout(copyResetRef.current);
      copyResetRef.current = null;
    }

    if (!activeExample?.slug) {
      setSnippetContent("");
      setSnippetStatus("idle");
      return;
    }

    const controller = new AbortController();
    const loadSnippet = async () => {
      setSnippetStatus("loading");
      setSnippetContent("");
      try {
        const response = await fetch(
          `snippets/${encodeURIComponent(activeExample.slug)}.html`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error(`Snippet not found: ${response.status}`);
        }
        const text = await response.text();
        setSnippetContent(text);
        setSnippetStatus("ready");
      } catch (error) {
        if (!controller.signal.aborted) {
          setSnippetStatus("error");
        }
      }
    };

    loadSnippet();

    return () => controller.abort();
  }, [activeExample?.slug]);

  useEffect(() => {
    if (!editorHostRef.current || !hasCode) {
      if (editorViewRef.current) {
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
      return;
    }

    if (editorViewRef.current) {
      editorViewRef.current.destroy();
      editorViewRef.current = null;
    }

    const state = EditorState.create({
      doc: activeCode,
      extensions: [
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.lineWrapping,
        indentUnit.of("  "),
        languageExtension,
        dracula,
        foldGutter({
          openText: "▼",
          closedText: "▶",
        }),
        EditorView.theme({
          "&": {
            fontSize: "12px",
            fontFamily:
              "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          },
          ".cm-content": {
            padding: "12px 0",
          },
          ".cm-line": {
            padding: "0 16px",
          },
          ".cm-gutters": {
            borderRight: "1px solid rgba(148,163,184,0.2)",
            paddingRight: "6px",
          },
          ".cm-foldGutter span": {
            color: "#bd93f9",
          },
          ".cm-foldPlaceholder": {
            backgroundColor: "rgba(189,147,249,0.2)",
            border: "1px solid rgba(189,147,249,0.5)",
            color: "#f8f8f2",
            padding: "0 6px",
            borderRadius: "999px",
          },
          ".cm-scroller": {
            fontFamily:
              "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          },
        }),
      ],
    });

    editorViewRef.current = new EditorView({
      state,
      parent: editorHostRef.current,
    });

    return () => {
      if (editorViewRef.current) {
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
    };
  }, [activeCode, hasCode, languageExtension]);

  useEffect(() => {
    if (!activePreview) {
      document.body.style.overflow = "";
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActivePreview(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activePreview]);

  const handleCopyCode = async () => {
    if (!hasCode) {
      return;
    }

    if (copyResetRef.current) {
      clearTimeout(copyResetRef.current);
    }

    try {
      await navigator.clipboard.writeText(activeCode);
      setCopyStatus("success");
    } catch (error) {
      setCopyStatus("error");
    } finally {
      copyResetRef.current = setTimeout(() => {
        setCopyStatus("idle");
        copyResetRef.current = null;
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e6f2ff,_#eef5ff_40%,_#f2f6fb_70%,_#edf2f8)] text-slate-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-12 pt-6 sm:px-10 lg:px-12">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-blue-700">
                {copy[lang].brand}
              </p>
              <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                {copy[lang].title}
              </h1>
              <p className="mt-2 max-w-lg text-xs text-slate-600">
                {copy[lang].subtitle}
              </p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-white/70 p-3 shadow-[0_18px_50px_-36px_rgba(0,0,0,0.4)] backdrop-blur">
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                {copy[lang].showing}
              </div>
              <div className="mt-1 text-xl font-semibold text-slate-900">
                {filteredExamples.length}
              </div>
                <div className="mt-1 text-xs text-slate-500">
                  {copy[lang].totalSuffix} {examples.length} {copy[lang].curated}
                </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                {copy[lang].language}
              </div>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-0.5">
                <button
                  className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition ${
                    lang === "en"
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-500 hover:text-blue-700"
                  }`}
                  type="button"
                  onClick={() => setLang("en")}
                >
                  EN
                </button>
                <button
                  className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition ${
                    lang === "zh"
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-500 hover:text-blue-700"
                  }`}
                  type="button"
                  onClick={() => setLang("zh")}
                >
                  中文
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                {copy[lang].columns}
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                <select
                  className="bg-transparent px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600 outline-none"
                  value={columns}
                  onChange={(event) =>
                    setColumns(Number(event.target.value) as 2 | 3 | 4)
                  }
                >
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 p-3 backdrop-blur">
            <div className="flex w-full max-w-xl items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <input
                className="w-full bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
                placeholder={copy[lang].searchPlaceholder}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((category) => (
                <button
                  key={category}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition ${
                    activeCategory === category
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
                  }`}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                >
                  {category === "All"
                    ? copy[lang].all
                    : (tagLabels[category]?.[lang] ?? category)}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section
          className={`grid gap-3 sm:grid-cols-2 ${
            columns === 2
              ? "lg:grid-cols-2 xl:grid-cols-2"
              : columns === 3
                ? "lg:grid-cols-3 xl:grid-cols-3"
                : "lg:grid-cols-3 xl:grid-cols-4"
          }`}
        >
          {filteredExamples.map((example) => (
            <article
              key={example.title}
              className="group relative overflow-hidden rounded-xl border border-white/80 bg-white/70 p-3 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.6)] transition hover:-translate-y-1 hover:shadow-[0_24px_60px_-36px_rgba(15,23,42,0.7)]"
            >
              <div
                className={`relative overflow-hidden rounded-lg bg-gradient-to-br ${
                  columns === 2 ? "h-32" : columns === 3 ? "h-28" : "h-24"
                } ${example.accent}`}
              >
                <img
                  alt={`Preview of ${example.title}`}
                  className="h-full w-full cursor-zoom-in object-cover opacity-90 transition duration-200 group-hover:opacity-100"
                  decoding="async"
                  loading="lazy"
                  src={example.preview}
                  onClick={() => setActivePreview(example)}
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-white/60 via-white/0 to-white/20" />
              </div>
              <div className="mt-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {lang === "zh" && example.titleCn
                      ? example.titleCn
                      : example.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                    {lang === "zh" && example.descriptionCn
                      ? example.descriptionCn
                      : example.description}
                  </p>
                </div>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.25em] text-blue-700">
                  {levelLabels[example.level][lang]}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                <span className="rounded-full border border-slate-200 px-2 py-1 font-semibold uppercase tracking-[0.2em]">
                  {tagLabels[example.tag]?.[lang] ?? example.tag}
                </span>
                <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                  {example.level === "Advanced" && (
                    <span aria-label="Difficult" title="Difficult">
                      ⭐
                    </span>
                  )}
                  {copy[lang].preview}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
                  type="button"
                  onClick={() => {
                    setActiveExample(example);
                  }}
                >
                  {copy[lang].viewCode}
                </button>
                <a
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                  href={example.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy[lang].openExample}
                </a>
              </div>
            </article>
          ))}
        </section>
        {filteredExamples.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-center text-sm text-slate-500">
            {copy[lang].noResults}
          </div>
        )}
      </div>
      {activeExample && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8">
          <button
            aria-label="Close"
            className="absolute inset-0 cursor-pointer"
            type="button"
            onClick={() => setActiveExample(null)}
          />
          <div className="modal-panel relative z-10 w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.7)]">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  {copy[lang].code}
                </div>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">
                  {lang === "zh" && activeExample.titleCn
                    ? activeExample.titleCn
                    : activeExample.title}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {lang === "zh" && activeExample.descriptionCn
                    ? activeExample.descriptionCn
                    : activeExample.description}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                  type="button"
                  onClick={handleCopyCode}
                  disabled={!hasCode}
                >
                  {copyStatus === "success"
                    ? copy[lang].copied
                    : copyStatus === "error"
                      ? copy[lang].copyFailed
                      : copy[lang].copyCode}
                </button>
                <button
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                  type="button"
                  onClick={() => setActiveExample(null)}
                >
                  {copy[lang].close}
                </button>
              </div>
            </div>
            <div className={`modal-body px-6 py-5 ${modalContentState}`}>
              {snippetStatus === "loading" && (
                <div className="mb-4 flex items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  <span className="loading-dots" aria-hidden="true">
                    <span className="loading-dot" />
                    <span className="loading-dot" />
                    <span className="loading-dot" />
                  </span>
                  <span>{copy[lang].codeLoading}</span>
                </div>
              )}
              {snippetStatus === "error" && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {copy[lang].codeError}
                </div>
              )}
              {!hasCode && snippetStatus !== "loading" && (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
                  {copy[lang].codeEmpty}
                </div>
              )}
              {hasCode && (
                <div className="code-block max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-slate-900">
                  <div ref={editorHostRef} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {activePreview && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6">
          <button
            aria-label="Close preview"
            className="absolute inset-0 cursor-pointer"
            type="button"
            onClick={() => setActivePreview(null)}
          />
          <div className="relative z-10 flex max-h-full max-w-6xl flex-col items-center gap-3">
            <button
              aria-label="Close preview"
              className="absolute -top-4 right-0 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/10 text-lg font-semibold text-white backdrop-blur transition hover:bg-white/20"
              type="button"
              onClick={() => setActivePreview(null)}
            >
              ×
            </button>
            <img
              alt={`Preview of ${activePreview.title}`}
              className="max-h-[85vh] w-auto rounded-2xl border border-white/30 shadow-[0_35px_90px_-45px_rgba(15,23,42,0.8)]"
              src={activePreview.preview}
            />
            <div className="text-center text-xs text-white/80">
              {lang === "zh" && activePreview.titleCn
                ? activePreview.titleCn
                : activePreview.title}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
