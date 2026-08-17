import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import yaml from 'yaml';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MANTRAS_PATH = path.join(REPO_ROOT, 'profile', 'mantras.yml');
const SOURCE_PATH = path.join(REPO_ROOT, 'profile', 'images', 'source', 'cda-enterprise-ecosystem-banner.png');
export const BANNERS_DIR = path.join(REPO_ROOT, 'profile', 'images', 'banners');
const MANIFEST_PATH = path.join(BANNERS_DIR, 'manifest.json');

export const EXPECTED_LOCALES = ['en', 'de', 'es', 'fr', 'nl', 'pt', 'zh'];
export const CANONICAL_WIDTH = 1280;
export const CANONICAL_HEIGHT = 320;
const TEXT_CANVAS_WIDTH = 2048;
const TEXT_CANVAS_HEIGHT = 512;
const TEXT_BASELINE_Y = 300;

function fail(message) {
  throw new Error(message);
}

function xmlEscape(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function loadMantras() {
  let raw;
  try {
    raw = fs.readFileSync(MANTRAS_PATH, 'utf8');
  } catch {
    fail(`cannot read ${path.relative(REPO_ROOT, MANTRAS_PATH)}`);
  }
  try {
    return yaml.parse(raw);
  } catch (error) {
    fail(`mantras.yml is not valid YAML: ${error.message}`);
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) fail(`${name} must be a positive integer, got ${value}`);
}

function assertNonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) fail(`${name} must be a non-negative integer, got ${value}`);
}

export function validateConfig(config) {
  if (!config || typeof config !== 'object') fail('mantras.yml must contain a top-level object');

  const layout = config.layout ?? fail('mantras.yml: missing "layout"');
  const text = layout.text ?? fail('mantras.yml: missing "layout.text"');

  assertPositiveInteger(layout.width, 'layout.width');
  assertPositiveInteger(layout.height, 'layout.height');
  if (layout.width !== CANONICAL_WIDTH || layout.height !== CANONICAL_HEIGHT) {
    fail(`layout is ${layout.width}x${layout.height}, canonical banner is ${CANONICAL_WIDTH}x${CANONICAL_HEIGHT}`);
  }

  assertNonNegativeInteger(text.x, 'layout.text.x');
  assertNonNegativeInteger(text.y, 'layout.text.y');
  assertPositiveInteger(text.fontSize, 'layout.text.fontSize');
  assertPositiveInteger(text.lineHeight, 'layout.text.lineHeight');
  assertPositiveInteger(text.fontWeight, 'layout.text.fontWeight');
  assertPositiveInteger(text.maxWidth, 'layout.text.maxWidth');
  if (typeof text.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(text.color)) {
    fail('layout.text.color must be a #rrggbb color');
  }
  if (text.x + text.maxWidth > layout.width) fail('layout.text.maxWidth overflows the banner width');

  const fonts = config.fonts ?? fail('mantras.yml: missing "fonts"');
  if (typeof fonts !== 'object' || Array.isArray(fonts)) fail('mantras.yml: "fonts" must be a map');
  const fontKeys = Object.keys(fonts);
  if (fontKeys.length === 0) fail('mantras.yml: "fonts" must declare at least one font');
  for (const key of fontKeys) {
    const font = fonts[key];
    if (!font || typeof font !== 'object') fail(`fonts.${key} must be an object`);
    if (typeof font.family !== 'string' || font.family.trim() === '') fail(`fonts.${key}.family must be a non-empty string`);
    if (typeof font.file !== 'string' || font.file.trim() === '') fail(`fonts.${key}.file must be a non-empty string`);
    const resolved = path.resolve(REPO_ROOT, font.file);
    if (!fs.existsSync(resolved)) fail(`font file not found: ${font.file} (resolved to ${resolved})`);
    font.resolvedFile = resolved;
  }

  const languages = config.languages ?? fail('mantras.yml: missing "languages"');
  if (typeof languages !== 'object' || Array.isArray(languages)) fail('mantras.yml: "languages" must be a map');
  const localeKeys = Object.keys(languages);
  for (const locale of EXPECTED_LOCALES) {
    if (!localeKeys.includes(locale)) fail(`missing expected locale "${locale}"`);
  }
  for (const locale of localeKeys) {
    if (!EXPECTED_LOCALES.includes(locale)) fail(`unexpected locale "${locale}" (expected: ${EXPECTED_LOCALES.join(', ')})`);
  }
  for (const [locale, entry] of Object.entries(languages)) {
    if (!entry || typeof entry !== 'object') fail(`languages.${locale} must be an object`);
    if (!fontKeys.includes(entry.font)) fail(`languages.${locale}: unknown font key "${entry.font}"`);
    if (entry.fontSize !== undefined) assertPositiveInteger(entry.fontSize, `languages.${locale}.fontSize`);
    if (!Array.isArray(entry.lines) || entry.lines.length === 0) fail(`languages.${locale}: "lines" must be a non-empty array`);
    entry.lines.forEach((line, index) => {
      if (typeof line !== 'string' || line.trim() === '') fail(`languages.${locale}: line ${index + 1} must be a non-empty string`);
    });
    if (typeof entry.alt !== 'string' || entry.alt.trim() === '') fail(`languages.${locale}: "alt" must be a non-empty string`);
  }
}

export async function inspectCanonical() {
  if (!fs.existsSync(SOURCE_PATH)) fail(`canonical banner not found: ${path.relative(REPO_ROOT, SOURCE_PATH)}`);
  let metadata;
  try {
    metadata = await sharp(SOURCE_PATH).metadata();
  } catch {
    fail(`cannot read canonical banner: ${path.relative(REPO_ROOT, SOURCE_PATH)}`);
  }
  if (metadata.width !== CANONICAL_WIDTH || metadata.height !== CANONICAL_HEIGHT) {
    fail(`canonical banner is ${metadata.width}x${metadata.height}, expected ${CANONICAL_WIDTH}x${CANONICAL_HEIGHT}`);
  }
  return metadata;
}

export function renderTextLine(line, font, text, fontFiles) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TEXT_CANVAS_WIDTH}" height="${TEXT_CANVAS_HEIGHT}">` +
    `<text x="0" y="${TEXT_BASELINE_Y}" font-family="${font.family}" font-weight="${text.fontWeight}" font-size="${text.fontSize}" fill="${text.color}">${xmlEscape(line)}</text>` +
    '</svg>';
  const rendered = new Resvg(svg, {
    font: { fontFiles, loadSystemFonts: false },
  }).render();

  const src = rendered.pixels;
  const canvasWidth = rendered.width;
  const canvasHeight = rendered.height;
  let minX = canvasWidth;
  let minY = canvasHeight;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvasHeight; y++) {
    for (let x = 0; x < canvasWidth; x++) {
      if (src[(y * canvasWidth + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) fail(`line "${line}" rendered no visible ink with font ${font.family}`);

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const crop = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    src.copy(crop, y * w * 4, ((minY + y) * canvasWidth + minX) * 4, ((minY + y) * canvasWidth + minX) * 4 + w * 4);
  }
  return { pixels: crop, width: w, height: h };
}

export async function renderLine(locale, config) {
  const entry = config.languages[locale];
  const font = config.fonts[entry.font];
  const base = config.layout.text;
  const fontSize = entry.fontSize ?? base.fontSize;
  const lineHeight =
    entry.fontSize === undefined
      ? base.lineHeight
      : Math.round(fontSize * (base.lineHeight / base.fontSize));
  const text = { ...base, fontSize, lineHeight };
  const fontFiles = Object.values(config.fonts).map((f) => f.resolvedFile);

  const rendered = [];
  for (const line of entry.lines) {
    let overlay;
    try {
      overlay = renderTextLine(line, font, text, fontFiles);
    } catch (error) {
      fail(`languages.${locale}: ${error.message}`);
    }

    const w = overlay.width;
    const h = overlay.height;
    if (w > text.maxWidth) {
      fail(`languages.${locale}: line "${line}" renders ${w}px wide, exceeding maxWidth ${text.maxWidth}px. ` +
        'Do not shrink the font automatically; adjust languages.<locale>.fontSize (or layout.text.fontSize) explicitly.');
    }
    if (h > text.lineHeight) {
      fail(`languages.${locale}: line "${line}" renders ${h}px tall, exceeding lineHeight ${text.lineHeight}px. ` +
        'Adjust the editorial layout configuration explicitly.');
    }
    rendered.push({ buffer: overlay.pixels, width: w, height: h, text: line });
  }

  const blockHeight = text.y + (entry.lines.length - 1) * text.lineHeight + rendered[rendered.length - 1].height;
  if (blockHeight > config.layout.height) {
    fail(`languages.${locale}: text block bottom (${blockHeight}px) exceeds banner height ${config.layout.height}px`);
  }
  return rendered;
}

export function renderManifest() {
  const locales = {};
  for (const locale of EXPECTED_LOCALES) {
    locales[locale] = { file: `cda-enterprise-ecosystem-banner.${locale}.png` };
  }
  return {
    source: 'cda-enterprise-ecosystem-banner.png',
    width: CANONICAL_WIDTH,
    height: CANONICAL_HEIGHT,
    locales,
  };
}

export async function generateAllBanners(outDir = BANNERS_DIR) {
  const config = loadMantras();
  validateConfig(config);
  await inspectCanonical();

  fs.mkdirSync(outDir, { recursive: true });
  const text = config.layout.text;
  const results = [];

  console.log(`→ rendering ${EXPECTED_LOCALES.length} banners from profile/mantras.yml`);

  for (const locale of EXPECTED_LOCALES) {
    const lines = await renderLine(locale, config);
    const overlays = lines.map((line, index) => ({
      input: line.buffer,
      raw: { width: line.width, height: line.height, channels: 4 },
      left: text.x,
      top: text.y + index * text.lineHeight,
    }));

    const file = path.join(outDir, `cda-enterprise-ecosystem-banner.${locale}.png`);
    const { data } = await sharp(SOURCE_PATH)
      .composite(overlays)
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
    fs.writeFileSync(file, data);

    const meta = await sharp(file).metadata();
    if (meta.width !== CANONICAL_WIDTH || meta.height !== CANONICAL_HEIGHT) {
      fail(`output ${path.relative(REPO_ROOT, file)} is ${meta.width}x${meta.height}, expected ${CANONICAL_WIDTH}x${CANONICAL_HEIGHT}`);
    }
    results.push({ locale, file, widths: lines.map((line) => line.width), heights: lines.map((line) => line.height) });
    console.log(`  ✔ ${locale.padEnd(2)} → ${path.relative(REPO_ROOT, file)} (${meta.width}x${meta.height}, lines ${lines.map((line) => `${line.width}x${line.height}`).join(', ')})`);
  }

  const manifest = renderManifest();
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`✔ ${EXPECTED_LOCALES.length} banners written to ${path.relative(REPO_ROOT, outDir)}`);
  return { manifest, results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateAllBanners().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}
