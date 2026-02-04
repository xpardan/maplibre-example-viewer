import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OVERVIEW_URL = "https://maplibre.org/maplibre-gl-js/docs/examples/";
const SITE_ORIGIN = "https://maplibre.org";
const EXAMPLES_PREFIX = "/maplibre-gl-js/docs/examples/";
const PREVIEW_PREFIX = `${SITE_ORIGIN}/maplibre-gl-js/docs/assets/examples/`;
const OUTPUT_PATH = "../src/data/examples.json";

const accentPalette = [
  "from-amber-200 via-rose-200 to-orange-200",
  "from-slate-200 via-zinc-200 to-stone-200",
  "from-sky-200 via-cyan-200 to-teal-200",
  "from-emerald-200 via-lime-200 to-yellow-200",
  "from-violet-200 via-indigo-200 to-blue-200",
  "from-fuchsia-200 via-pink-200 to-rose-200",
  "from-blue-200 via-sky-200 to-cyan-200",
  "from-emerald-100 via-teal-100 to-cyan-100",
  "from-orange-200 via-amber-200 to-yellow-200",
  "from-rose-200 via-orange-200 to-amber-200",
  "from-stone-100 via-amber-100 to-rose-100",
  "from-teal-200 via-cyan-200 to-sky-200",
  "from-amber-100 via-orange-100 to-rose-100",
  "from-cyan-200 via-sky-200 to-blue-200",
  "from-zinc-200 via-stone-200 to-amber-200",
  "from-lime-100 via-emerald-100 to-teal-100",
  "from-rose-100 via-pink-100 to-fuchsia-100",
  "from-sky-100 via-blue-100 to-indigo-100",
  "from-stone-200 via-orange-100 to-amber-100",
  "from-indigo-200 via-blue-200 to-sky-200",
  "from-indigo-200 via-violet-200 to-fuchsia-200",
  "from-amber-100 via-rose-100 to-pink-100",
  "from-cyan-100 via-sky-100 to-blue-100",
  "from-emerald-200 via-green-200 to-lime-200",
  "from-yellow-100 via-amber-100 to-orange-100",
  "from-emerald-100 via-teal-100 to-cyan-100",
  "from-rose-200 via-pink-200 to-red-200"
];

const htmlEntityMap = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'"
};

const decodeEntities = (text) =>
  text.replace(/(&amp;|&lt;|&gt;|&quot;|&#39;)/g, (match) => htmlEntityMap[match] ?? match);

const stripTags = (text) => decodeEntities(text.replace(/<[^>]*>/g, "").trim());

const getMetaContent = (html, name) => {
  const metaRegex = new RegExp(
    `<meta[^>]+(?:property|name)="${name}"[^>]+content="([^"]*)"`,
    "i"
  );
  const match = html.match(metaRegex);
  return match ? stripTags(match[1]) : "";
};

const getTitle = (html) => {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    return stripTags(h1Match[1]);
  }
  const ogTitle = getMetaContent(html, "og:title");
  if (ogTitle) {
    return ogTitle;
  }
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch ? stripTags(titleMatch[1]) : "Untitled example";
};

const getDescription = (html) => {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const after = html.slice(h1Match.index + h1Match[0].length);
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch = pRegex.exec(after);
    while (pMatch) {
      const text = stripTags(pMatch[1]);
      if (
        text &&
        !/meta property/i.test(text) &&
        !/^\s*<meta/i.test(text) &&
        !/^\s*<iframe/i.test(text)
      ) {
        return text;
      }
      pMatch = pRegex.exec(after);
    }
  }
  return (
    getMetaContent(html, "og:description") ||
    getMetaContent(html, "description")
  );
};

const classifyTag = (title, description) => {
  const text = `${title} ${description}`.toLowerCase();

  if (/(terrain|3d|extrusion|globe|sky|fog)/.test(text)) {
    return "3D & Terrain";
  }
  if (/(animate|animation|fly to|camera|easing|orbit)/.test(text)) {
    return "Animation";
  }
  if (/(cluster|performance|pmtiles|large dataset|optimi|realtime|world copy)/.test(text)) {
    return "Performance";
  }
  if (/(popup|hover|click|drag|gesture|control|navigation|interactive|geocode|draw|measure)/.test(text)) {
    return "Interaction";
  }
  if (/(style|label|text|font|color|pattern|symbol|icon|expression)/.test(text)) {
    return "Style";
  }
  if (/(geojson|vector|raster|tile|source|heatmap|data)/.test(text)) {
    return "Data";
  }
  if (/(slider|scroll|sync|story|timeline|filter)/.test(text)) {
    return "UI Patterns";
  }
  return "Basics";
};

const classifyLevel = (title, description) => {
  const text = `${title} ${description}`.toLowerCase();
  if (/(custom layer|deck\.gl|three\.js|babylon|pmtiles|terrain|3d|advanced|scripting)/.test(text)) {
    return "Advanced";
  }
  if (/(animate|cluster|expression|heatmap|vector|raster|data-driven|filter|style)/.test(text)) {
    return "Intermediate";
  }
  return "Beginner";
};

const fetchWithRetry = async (url, attempts = 3) => {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`Failed to fetch ${url}: ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw lastError;
};

const main = async () => {
  const overviewResponse = await fetchWithRetry(OVERVIEW_URL, 4);
  const overviewHtml = await overviewResponse.text();

  const sections = [];
  const sectionRegex =
    /<h2 id="([^"]+)"><a href="([^"]+)">([\s\S]*?)<\/a><\/h2>([\s\S]*?)(?=<h2 id="|$)/gi;
  let match = sectionRegex.exec(overviewHtml);

  while (match) {
    const href = match[2];
    const slug = href.replace(/\/$/, "");
    const title = stripTags(match[3]);
    const sectionHtml = match[4];
    let description = "";
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch = pRegex.exec(sectionHtml);
    while (pMatch) {
      const raw = pMatch[1];
      const text = stripTags(raw);
      if (
        text &&
        !/meta property/i.test(text) &&
        !/<img/i.test(raw) &&
        !/<iframe/i.test(raw)
      ) {
        description = text;
        break;
      }
      pMatch = pRegex.exec(sectionHtml);
    }
    if (slug) {
      sections.push({
        slug,
        title,
        description
      });
    }
    match = sectionRegex.exec(overviewHtml);
  }

  const hrefRegex = /href="([^"]+)"/g;
  const slugList = [];
  const seen = new Set();
  match = hrefRegex.exec(overviewHtml);

  while (match) {
    const href = match[1];
    if (!/^[a-z0-9-]+\/$/i.test(href)) {
      match = hrefRegex.exec(overviewHtml);
      continue;
    }
    const slug = href.replace(/\/$/, "");
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      slugList.push(slug);
    }
    match = hrefRegex.exec(overviewHtml);
  }

  const humanizeSlug = (slug) =>
    slug
      .split("-")
      .map((part) => {
        if (!part) return part;
        if (/^\d+d$/i.test(part)) return part.toUpperCase();
        if (part.toLowerCase() === "pmtiles") return "PMTiles";
        if (part.toLowerCase() === "webgl") return "WebGL";
        if (part.toLowerCase() === "gl") return "GL";
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ");

  const examples = [];
  const sectionMap = new Map(sections.map((section) => [section.slug, section]));
  const sourceEntries = slugList.map((slug) => {
    const section = sectionMap.get(slug);
    if (section) {
      return section;
    }
    return {
      slug,
      title: humanizeSlug(slug),
      description: "MapLibre GL JS example."
    };
  });

  const existingExamples = new Map();
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const outputPath = path.resolve(__dirname, OUTPUT_PATH);
    const existing = JSON.parse(await fs.readFile(outputPath, "utf8"));
    for (const example of existing.examples ?? []) {
      if (example?.slug) {
        existingExamples.set(example.slug, example);
      }
    }
  } catch (error) {
    // Ignore missing or invalid existing data.
  }

  const phraseMap = [
    ["add a", "添加"],
    ["add an", "添加"],
    ["add", "添加"],
    ["create and style", "创建并样式化"],
    ["create", "创建"],
    ["display", "显示"],
    ["change", "切换"],
    ["style", "样式化"],
    ["animate", "动画"],
    ["fly to", "飞行到"],
    ["geocode with", "使用"],
    ["sync movement of", "同步"],
    ["enable", "启用"],
    ["use", "使用"],
    ["render", "渲染"],
    ["visualize", "可视化"],
    ["filter", "过滤"],
    ["search", "搜索"],
    ["load", "加载"],
    ["show", "显示"],
    ["build", "构建"],
    ["based on", "基于"],
    ["in an", "在一个"],
    ["in a", "在一个"],
    ["in the", "在"],
    ["to the", "到"],
    ["to a", "到一个"],
    ["to", "到"],
    ["with", "使用"],
    ["using", "使用"]
  ];

  const wordMap = [
    ["map", "地图"],
    ["maps", "地图"],
    ["a", ""],
    ["an", ""],
    ["the", ""],
    ["marker", "标记"],
    ["markers", "标记"],
    ["layer", "图层"],
    ["layers", "图层"],
    ["source", "数据源"],
    ["sources", "数据源"],
    ["tiles", "瓦片"],
    ["vector", "矢量"],
    ["raster", "栅格"],
    ["geojson", "GeoJSON"],
    ["polygon", "多边形"],
    ["line", "线"],
    ["lines", "线"],
    ["heatmap", "热力图"],
    ["cluster", "聚类"],
    ["clusters", "聚类"],
    ["label", "标签"],
    ["labels", "标签"],
    ["icon", "图标"],
    ["icons", "图标"],
    ["control", "控件"],
    ["controls", "控件"],
    ["navigation", "导航"],
    ["terrain", "地形"],
    ["globe", "地球"],
    ["camera", "相机"],
    ["popup", "弹窗"],
    ["hover", "悬停"],
    ["click", "点击"],
    ["drag", "拖拽"],
    ["pattern", "图案"],
    ["language", "语言"],
    ["time", "时间"],
    ["slider", "滑块"],
    ["scroll", "滚动"],
    ["story", "叙事"],
    ["video", "视频"],
    ["image", "图像"],
    ["example", "示例"],
    ["examples", "示例"],
    ["buildings", "建筑"],
    ["building", "建筑"],
    ["model", "模型"],
    ["models", "模型"],
    ["shadow", "阴影"],
    ["custom", "自定义"],
    ["simple", "简单"],
    ["multiple", "多个"],
    ["interactive", "交互式"],
    ["browser", "浏览器"],
    ["data-driven", "数据驱动"],
    ["data", "数据"],
    ["point", "点"],
    ["points", "点"],
    ["circle", "圆"],
    ["fill", "填充"],
    ["symbol", "符号"],
    ["style", "样式"],
    ["filter", "过滤"],
    ["zoom", "缩放"],
    ["rotate", "旋转"],
    ["pan", "平移"],
    ["move", "移动"],
    ["measure", "测量"],
    ["draw", "绘制"],
    ["elevation", "高程"],
    ["extrusion", "拉伸"],
    ["sky", "天空"],
    ["fog", "雾"],
    ["actual", "真实"],
    ["line", "线"],
    ["routes", "路线"],
    ["route", "路线"],
    ["geocode", "地理编码"],
    ["globe", "地球"],
    ["hillshade", "山体阴影"],
    ["contour", "等高线"],
    ["raster-dem", "栅格高程"],
    ["satellite", "卫星"],
    ["streets", "街道"],
    ["text", "文本"],
    ["font", "字体"],
    ["color", "颜色"],
    ["colors", "颜色"],
    ["opacity", "透明度"],
    ["3d", "3D"],
    ["pmtiles", "PMTiles"],
    ["webgl", "WebGL"]
  ];

  const titleTemplates = [
    [/^Add a (.+)$/i, "添加 $1"],
    [/^Add an (.+)$/i, "添加 $1"],
    [/^Add (.+)$/i, "添加 $1"],
    [/^Create a (.+)$/i, "创建 $1"],
    [/^Create (.+)$/i, "创建 $1"],
    [/^Display a (.+)$/i, "显示 $1"],
    [/^Display (.+)$/i, "显示 $1"],
    [/^Style (.+)$/i, "样式化 $1"],
    [/^Change (.+)$/i, "切换 $1"],
    [/^Animate (.+)$/i, "动画 $1"],
    [/^Fly to (.+)$/i, "飞行到 $1"],
    [/^Sync movement of (.+)$/i, "同步 $1 移动"]
  ];

  const descriptionTemplates = [
    [
      /^Use a custom style layer with (.+?) to add (.+?) to (?:the |a )?(.+?)\.$/i,
      "使用自定义样式图层，通过 $1 将 $2 添加到 $3。"
    ],
    [
      /^Use a custom style layer with (.+?) to add (.+?)\.$/i,
      "使用自定义样式图层，通过 $1 添加 $2。"
    ],
    [/^Add (.+?) to the map\.$/i, "将 $1 添加到地图。"],
    [/^Add (.+?) to a globe\.$/i, "将 $1 添加到地球。"],
    [/^Add (.+?) to the globe\.$/i, "将 $1 添加到地球。"],
    [/^Add (.+?) to a map\.$/i, "将 $1 添加到地图。"],
    [/^Display (.+?) on the map\.$/i, "在地图上显示 $1。"],
    [/^Show (.+?) in (?:an |a )?(.+?)\.$/i, "在 $2 中显示 $1。"],
    [
      /^Initialize a map in an HTML element with MapLibre GL JS\.$/i,
      "在 HTML 元素中使用 MapLibre GL JS 初始化地图。"
    ],
    [
      /^Go beyond hillshade and show elevation in actual 3D\.$/i,
      "不止于山体阴影，显示真实 3D 高程。"
    ]
  ];

  const translateText = (text) => {
    if (!text) return "";
    let output = text;
    for (const [from, to] of phraseMap) {
      output = output.replace(new RegExp(`\\b${from}\\b`, "gi"), to);
    }
    for (const [from, to] of wordMap) {
      output = output.replace(new RegExp(`\\b${from}\\b`, "gi"), to);
    }
    output = output.replace(/\s{2,}/g, " ").trim();
    return output;
  };

  const translateTitle = (title) => {
    if (!title) return "";
    for (const [pattern, replacement] of titleTemplates) {
      if (pattern.test(title)) {
        return translateText(title.replace(pattern, replacement));
      }
    }
    return translateText(title);
  };

  const translateDescription = (description) => {
    if (!description) return "";
    for (const [pattern, replacement] of descriptionTemplates) {
      if (pattern.test(description)) {
        return translateText(description.replace(pattern, replacement));
      }
    }
    return translateText(description);
  };

  const isMostlyChinese = (text) => {
    if (!text) return false;
    const cleaned = text
      .replace(
        /(MapLibre|WebGL|GL|3D|PMTiles|GeoJSON|HTML|CSS|JS|JSON|URL|API|Nominatim|three\\.js|babylon\\.js|deck\\.gl|MapTiler)/gi,
        ""
      )
      .replace(/\s+/g, " ")
      .trim();
    return /[\u4e00-\u9fff]/.test(cleaned) && !/[A-Za-z]{3,}/.test(cleaned);
  };

  for (let index = 0; index < sourceEntries.length; index += 1) {
    const entry = sourceEntries[index];
    const slug = entry.slug;
    const title = entry.title || humanizeSlug(slug);
    const description = entry.description || "MapLibre GL JS example.";
    const tag = classifyTag(title, description);
    const level = classifyLevel(title, description);
    const accent = accentPalette[index % accentPalette.length];
    const existing = existingExamples.get(slug);
    const titleCn = isMostlyChinese(existing?.titleCn)
      ? existing.titleCn
      : translateTitle(title);
    const descriptionCn = isMostlyChinese(existing?.descriptionCn)
      ? existing.descriptionCn
      : translateDescription(description);
    examples.push({
      title,
      description,
      titleCn,
      descriptionCn,
      level,
      tag,
      slug,
      url: `${OVERVIEW_URL}${slug}/`,
      preview: `${PREVIEW_PREFIX}${slug}.webp`,
      accent,
      codeLang: "html"
    });
  }

  const output = {
    meta: {
      source: OVERVIEW_URL,
      lastSynced: new Date().toISOString().slice(0, 10)
    },
    examples
  };

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outputPath = path.resolve(__dirname, OUTPUT_PATH);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`Synced ${examples.length} examples to ${outputPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
