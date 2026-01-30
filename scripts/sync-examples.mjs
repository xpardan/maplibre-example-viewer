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

const main = async () => {
  const overviewResponse = await fetch(OVERVIEW_URL);
  if (!overviewResponse.ok) {
    throw new Error(`Failed to fetch overview: ${overviewResponse.status}`);
  }
  const overviewHtml = await overviewResponse.text();

  const linkRegex = /href="(\/maplibre-gl-js\/docs\/examples\/[^"]+\/)"/g;
  const slugs = new Map();
  let match = linkRegex.exec(overviewHtml);

  while (match) {
    const href = match[1];
    const slug = href.replace(EXAMPLES_PREFIX, "").replace(/\/$/, "");
    if (slug && slug !== "examples") {
      slugs.set(slug, `${SITE_ORIGIN}${href}`);
    }
    match = linkRegex.exec(overviewHtml);
  }

  const examples = [];
  const slugEntries = Array.from(slugs.entries());

  for (let index = 0; index < slugEntries.length; index += 1) {
    const [slug, url] = slugEntries[index];
    const response = await fetch(url);
    if (!response.ok) {
      // Skip entries that fail to load.
      continue;
    }
    const html = await response.text();
    const title = getTitle(html);
    const description = getDescription(html) || "MapLibre GL JS example.";
    const tag = classifyTag(title, description);
    const level = classifyLevel(title, description);
    const accent = accentPalette[index % accentPalette.length];
    examples.push({
      title,
      description,
      level,
      tag,
      slug,
      url,
      preview: `${PREVIEW_PREFIX}${slug}.webp`,
      accent
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
