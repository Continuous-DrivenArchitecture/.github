import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  BANNERS_DIR,
  CANONICAL_HEIGHT,
  CANONICAL_WIDTH,
  EXPECTED_LOCALES,
  generateAllBanners,
  loadMantras,
  renderLine,
  renderManifest,
  validateConfig,
} from '../scripts/generate-banners.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const tempDirs = [];
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cda-banners-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function validConfig() {
  const config = loadMantras();
  validateConfig(config);
  return config;
}

function cloneConfig(config) {
  return structuredClone(config);
}

describe('mantras.yml', () => {
  it('loads a valid configuration for the seven expected locales', () => {
    const config = validConfig();
    expect(Object.keys(config.languages).sort()).toEqual([...EXPECTED_LOCALES].sort());
  });

  it('every line of every locale fits the safe area at its declared font size', async () => {
    const config = validConfig();
    for (const locale of EXPECTED_LOCALES) {
      const lines = await renderLine(locale, config);
      expect(lines.length).toBe(config.languages[locale].lines.length);
      for (const line of lines) {
        expect(line.width).toBeGreaterThan(0);
        expect(line.width).toBeLessThanOrEqual(config.layout.text.maxWidth);
        expect(line.height).toBeLessThanOrEqual(config.languages[locale].fontSize ? Math.round(config.languages[locale].fontSize * (config.layout.text.lineHeight / config.layout.text.fontSize)) : config.layout.text.lineHeight);
      }
    }
  });

  it('every locale declares a supported font', () => {
    const config = validConfig();
    for (const [locale, entry] of Object.entries(config.languages)) {
      expect(Object.keys(config.fonts)).toContain(entry.font);
    }
  });
});

describe('validateConfig', () => {
  it('rejects an unexpected locale', () => {
    const config = validConfig();
    config.languages.xx = { font: 'latin', fontSize: 34, lines: ['Hello'], alt: 'Hello' };
    expect(() => validateConfig(config)).toThrow(/unexpected locale "xx"/);
  });

  it('rejects a missing locale', () => {
    const config = validConfig();
    delete config.languages.zh;
    expect(() => validateConfig(config)).toThrow(/missing expected locale "zh"/);
  });

  it('rejects an unknown font key', () => {
    const config = validConfig();
    config.languages.en.font = 'serif';
    expect(() => validateConfig(config)).toThrow(/unknown font key "serif"/);
  });

  it('rejects a non-integer per-locale fontSize', () => {
    const config = validConfig();
    config.languages.en.fontSize = 54.5;
    expect(() => validateConfig(config)).toThrow(/fontSize/);
  });

  it('rejects a missing font file', () => {
    const config = validConfig();
    config.fonts.latin.file = 'assets/fonts/does-not-exist.ttf';
    expect(() => validateConfig(config)).toThrow(/font file not found/);
  });

  it('rejects a malformed color', () => {
    const config = validConfig();
    config.layout.text.color = 'red';
    expect(() => validateConfig(config)).toThrow(/#rrggbb/);
  });

  it('rejects a layout that does not match the canonical banner size', () => {
    const config = validConfig();
    config.layout.width = 1024;
    expect(() => validateConfig(config)).toThrow(/canonical banner/);
  });

  it('rejects a maxWidth that overflows the banner', () => {
    const config = validConfig();
    config.layout.text.maxWidth = 1400;
    expect(() => validateConfig(config)).toThrow(/overflows the banner width/);
  });

  it('rejects empty lines and missing alt text', () => {
    const config = validConfig();
    config.languages.en.lines = [''];
    expect(() => validateConfig(config)).toThrow(/non-empty string/);
    const altConfig = validConfig();
    altConfig.languages.en.alt = '';
    expect(() => validateConfig(altConfig)).toThrow(/non-empty string/);
  });
});

describe('renderLine', () => {
  it('applies the per-locale fontSize override', async () => {
    const config = validConfig();
    const big = await renderLine('en', config);
    const smallConfig = cloneConfig(config);
    smallConfig.languages.en.fontSize = config.layout.text.fontSize;
    const small = await renderLine('en', smallConfig);
    expect(big[0].width).toBeGreaterThan(small[0].width);
  });

  it('keeps the text block inside the banner height', async () => {
    const config = validConfig();
    for (const locale of EXPECTED_LOCALES) {
      const lines = await renderLine(locale, config);
      const entry = config.languages[locale];
      const lineHeight = entry.fontSize === undefined
        ? config.layout.text.lineHeight
        : Math.round(entry.fontSize * (config.layout.text.lineHeight / config.layout.text.fontSize));
      const bottom = config.layout.text.y + (lines.length - 1) * lineHeight + lines[lines.length - 1].height;
      expect(bottom).toBeLessThanOrEqual(config.layout.height);
    }
  });

  it('fails loudly when a line exceeds maxWidth', async () => {
    const config = validConfig();
    config.layout.text.maxWidth = 100;
    await expect(renderLine('en', config)).rejects.toThrow(/exceeding maxWidth 100/);
  });

  it('escapes XML markup characters in lines', async () => {
    const config = validConfig();
    config.languages.en.lines = ['Tom & Jerry <3'];
    config.languages.en.alt = 'Tom & Jerry <3';
    const lines = await renderLine('en', config);
    expect(lines[0].width).toBeGreaterThan(0);
  });
});

describe('renderManifest', () => {
  it('describes the canonical source, dimensions and one artifact per locale', () => {
    const manifest = renderManifest();
    expect(manifest.source).toBe('cda-enterprise-ecosystem-banner.png');
    expect(manifest.width).toBe(CANONICAL_WIDTH);
    expect(manifest.height).toBe(CANONICAL_HEIGHT);
    expect(Object.keys(manifest.locales).sort()).toEqual([...EXPECTED_LOCALES].sort());
    for (const [locale, entry] of Object.entries(manifest.locales)) {
      expect(entry.file).toBe(`cda-enterprise-ecosystem-banner.${locale}.png`);
    }
  });
});

describe('generateAllBanners', () => {
  it('writes seven 1280x320 banners and a manifest into the output directory', async () => {
    const outDir = tempDir();
    const { manifest } = await generateAllBanners(outDir);
    expect(manifest.locales).toBeDefined();
    for (const locale of EXPECTED_LOCALES) {
      const file = path.join(outDir, `cda-enterprise-ecosystem-banner.${locale}.png`);
      expect(fs.existsSync(file)).toBe(true);
      const meta = await sharp(file).metadata();
      expect([meta.width, meta.height]).toEqual([CANONICAL_WIDTH, CANONICAL_HEIGHT]);
    }
    expect(fs.existsSync(path.join(outDir, 'manifest.json'))).toBe(true);
  });

  it('renders the text overlay in the safe area of each banner', async () => {
    const outDir = tempDir();
    await generateAllBanners(outDir);
    const file = path.join(outDir, 'cda-enterprise-ecosystem-banner.en.png');
    const raw = await sharp(file).raw().toBuffer();
    const stride = raw.length / (CANONICAL_WIDTH * CANONICAL_HEIGHT);
    const box = [72, 90, 560, 220];
    let ink = 0;
    for (let y = box[1]; y < box[3]; y++) {
      for (let x = box[0]; x < box[2]; x++) {
        const i = (y * CANONICAL_WIDTH + x) * stride;
        if (raw[i] < 245 || raw[i + 1] < 245 || raw[i + 2] < 245) ink++;
      }
    }
    expect(ink).toBeGreaterThan(0);
  });
});

describe('check-banners', () => {
  it('passes against the committed artifacts', () => {
    const script = path.join(REPO_ROOT, 'scripts', 'check-banners.mjs');
    const result = spawnSync(process.execPath, [script], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 120000 });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  }, 120000);
});
