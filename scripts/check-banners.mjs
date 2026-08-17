import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import {
  BANNERS_DIR,
  CANONICAL_HEIGHT,
  CANONICAL_WIDTH,
  EXPECTED_LOCALES,
  generateAllBanners,
  loadMantras,
  validateConfig,
} from './generate-banners.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const README_FILES = {
  en: 'README.md',
  de: 'README.de.md',
  es: 'README.es.md',
  fr: 'README.fr.md',
  nl: 'README.nl.md',
  pt: 'README.pt.md',
  zh: 'README.zh.md',
};

const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function readManifest(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function sameManifest(a, b) {
  return (
    a && b &&
    a.source === b.source &&
    a.width === b.width &&
    a.height === b.height &&
    JSON.stringify(a.locales ?? null) === JSON.stringify(b.locales ?? null)
  );
}

const config = loadMantras();
validateConfig(config);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cda-banners-check-'));
let fresh;
try {
  fresh = await generateAllBanners(tempDir);
} catch (error) {
  console.error(`ERROR: regeneration failed: ${error.message}`);
  process.exit(1);
}

console.log('— comparing regenerated banners with committed artifacts —');

for (const locale of EXPECTED_LOCALES) {
  const fileName = `cda-enterprise-ecosystem-banner.${locale}.png`;
  const committed = path.join(BANNERS_DIR, fileName);
  const regenerated = path.join(tempDir, fileName);

  if (!fs.existsSync(committed)) {
    check(false, `${fileName} is missing`);
    continue;
  }

  const meta = await sharp(committed).metadata();
  check(
    meta.width === CANONICAL_WIDTH && meta.height === CANONICAL_HEIGHT,
    `${fileName}: dimensions are ${meta.width}x${meta.height}, expected ${CANONICAL_WIDTH}x${CANONICAL_HEIGHT}`,
  );

  const pixelsEqual = (await sharp(committed).raw().toBuffer()).equals(await sharp(regenerated).raw().toBuffer());
  const bytesEqual = fs.readFileSync(committed).equals(fs.readFileSync(regenerated));

  if (pixelsEqual && bytesEqual) {
    console.log(`  ✔ ${locale}: identical`);
  } else if (pixelsEqual) {
    console.log(`  ✔ ${locale}: identical pixels (encoder bytes differ)`);
  } else {
    check(false, `${fileName}: pixel content differs from regenerated output — run "npm run generate:banners"`);
  }
}

const committedManifest = readManifest(path.join(BANNERS_DIR, 'manifest.json'));
check(sameManifest(committedManifest, fresh.manifest), 'manifest.json is missing or inconsistent with mantras.yml');

const unexpected = fs
  .readdirSync(BANNERS_DIR)
  .filter((name) => !name.endsWith('.png') && name !== 'manifest.json' && name !== 'README.md');
check(unexpected.length === 0, `unexpected files in profile/images/banners/: ${unexpected.join(', ')}`);

console.log('— checking README banner references —');

for (const locale of EXPECTED_LOCALES) {
  const readmePath = path.join(REPO_ROOT, 'profile', README_FILES[locale]);
  if (!fs.existsSync(readmePath)) {
    check(false, `${README_FILES[locale]} does not exist`);
    continue;
  }
  const content = fs.readFileSync(readmePath, 'utf8');
  const bannerRef = `./images/banners/cda-enterprise-ecosystem-banner.${locale}.png`;
  const entry = config.languages[locale];
  check(content.includes(bannerRef), `${README_FILES[locale]}: missing reference to ${bannerRef}`);
  check(content.includes(`alt="${entry.alt}"`), `${README_FILES[locale]}: alt text does not match mantras.yml`);
}

fs.rmSync(tempDir, { recursive: true, force: true });

if (errors.length > 0) {
  for (const message of errors) console.error(`FAIL: ${message}`);
  console.error('Banners are stale or inconsistent. Run "npm run generate:banners" and commit the result.');
  process.exit(1);
}

console.log('All banners are deterministic and consistent with their sources.');
