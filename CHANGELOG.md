# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Features

- **profile:** multilingual organization READMEs (English, Deutsch, Español, Français, Nederlands, Português, 中文) with SVG language selectors ([d874b29](https://github.com/Continuous-DrivenArchitecture/.github/commit/d874b29614b1a9aa4e438406cf91a7cb50c0ce93))
- **banners:** deterministic multilingual banner pipeline — text-free canonical artwork, semantic mantra source (`profile/mantras.yml`), self-hosted OFL fonts, sharp-based generator, pixel-exact validation script and CI workflow ([d874b29](https://github.com/Continuous-DrivenArchitecture/.github/commit/d874b29614b1a9aa4e438406cf91a7cb50c0ce93))
- **banners:** per-locale typographic sizes with proportionally derived line heights, keeping the largest optical size that fits the safe area ([0d51024](https://github.com/Continuous-DrivenArchitecture/.github/commit/0d5102481bae7e747984246c0b803371e90be241))
- **banners:** deterministic CJK rendering via pure-JS alpha bounding box instead of libvips trim; banner validation now runs on pushes to `develop` as well as `main` ([0d51024](https://github.com/Continuous-DrivenArchitecture/.github/commit/0d5102481bae7e747984246c0b803371e90be241))

### Documentation

- **profile:** each README now links to the matching localized `archi-semantic-core` readme ([ca799de](https://github.com/Continuous-DrivenArchitecture/.github/commit/ca799de814e02a319f9acb2cb35e7ed596c107e3))

### Tests

- add vitest suite covering configuration validation, per-locale typography, manifest and banner generation

### Bug Fixes

- **banners:** render text with resvg instead of the system Pango stack, making rasterization byte-deterministic across platforms (verified Windows vs Linux container); CI validation returns to `ubuntu-latest`

### Build System

- add semantic-release configuration and release workflow for `main`

### Continuous Integration

- run validation and release workflows on Node 24 to satisfy the semantic-release toolchain
