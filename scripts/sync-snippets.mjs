import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXAMPLES_PATH = "../src/data/examples.json";
const OUTPUT_DIR = "../src/data/snippets";

const htmlEntityMap = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'"
};

const decodeEntities = (text) =>
  text.replace(/(&amp;|&lt;|&gt;|&quot;|&#39;)/g, (match) => htmlEntityMap[match] ?? match);

const fetchWithRetry = async (url, attempts = 3, timeoutMs = 15000) => {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
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

const toPlainCode = (html) => {
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]*>/g, "");
  return decodeEntities(stripped).replace(/\r\n/g, "\n");
};

const extractCodeBlocks = (html) => {
  const blocks = [];
  const codeRegex =
    /<pre[^>]*>(?:\s*<span[^>]*>.*?<\/span>)?\s*<code([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi;
  let match = codeRegex.exec(html);
  while (match) {
    const attrs = match[1] || "";
    const langMatch = attrs.match(/class="([^"]+)"/i);
    const lang = langMatch ? langMatch[1] : "";
    const code = toPlainCode(match[2]).trim();
    if (code) {
      blocks.push({ lang, code });
    }
    match = codeRegex.exec(html);
  }
  return blocks;
};

const pickSnippet = (blocks) => {
  if (!blocks.length) return null;
  const scored = blocks.map((block) => {
    let score = block.code.length;
    if (/<!doctype html>/i.test(block.code)) score += 5000;
    if (/maplibregl/i.test(block.code)) score += 2000;
    if (/language-html/i.test(block.lang)) score += 1000;
    if (/language-(js|javascript|ts|typescript)/i.test(block.lang)) score += 500;
    return { ...block, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].code;
};

const main = async () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const examplesPath = path.resolve(__dirname, EXAMPLES_PATH);
  const outputDir = path.resolve(__dirname, OUTPUT_DIR);
  await fs.mkdir(outputDir, { recursive: true });

  const data = JSON.parse(await fs.readFile(examplesPath, "utf8"));
  const examples = data.examples ?? [];

  let created = 0;
  let skipped = 0;
  let failed = 0;

  const tasks = [];
  for (const example of examples) {
    const slug = example.slug;
    if (!slug || !example.url) {
      skipped += 1;
      continue;
    }
    const outputPath = path.join(outputDir, `${slug}.html`);
    tasks.push({ slug, url: example.url, outputPath });
  }

  const pending = [];
  for (const task of tasks) {
    try {
      await fs.access(task.outputPath);
      skipped += 1;
      continue;
    } catch (error) {
      // File doesn't exist; create it.
    }
    pending.push(task);
  }

  const batchSize = 6;
  for (let index = 0; index < pending.length; index += batchSize) {
    const batch = pending.slice(index, index + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (task) => {
        const response = await fetchWithRetry(task.url, 4, 15000);
        const html = await response.text();
        const blocks = extractCodeBlocks(html);
        const snippet = pickSnippet(blocks);
        if (!snippet) {
          throw new Error(`No snippet found for ${task.slug}`);
        }
        await fs.writeFile(task.outputPath, snippet);
        return task.slug;
      })
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        created += 1;
      } else {
        failed += 1;
      }
    }
  }

  console.log(
    `Snippets created: ${created}, skipped: ${skipped}, failed: ${failed}`
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
