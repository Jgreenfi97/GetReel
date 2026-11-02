#!/usr/bin/env python3
"""
Generate GetReel's seamless marble textures.

    python3 scripts/generate-marble.py            # writes public/textures/*.webp
    python3 scripts/generate-marble.py --seed 7   # try a different slab

The textures are built from periodic gradient noise, so every tile repeats
seamlessly in both directions. Veins are contour lines of a domain-warped
fractal noise field; their width and strength drift along their length the way
real Calacatta veins do. Only numpy and Pillow are required.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "textures"


# ── Periodic gradient noise ──────────────────────────────────────────────────


class PeriodicNoise:
    """2D Perlin-style gradient noise that repeats every `period` lattice cells."""

    def __init__(self, period: int, rng: np.random.Generator):
        angles = rng.uniform(0.0, 2.0 * np.pi, (period, period))
        self.gx = np.cos(angles)
        self.gy = np.sin(angles)
        self.period = period

    def __call__(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        p = self.period
        x0f = np.floor(x)
        y0f = np.floor(y)
        fx = x - x0f
        fy = y - y0f
        x0 = x0f.astype(np.int64) % p
        y0 = y0f.astype(np.int64) % p
        x1 = (x0 + 1) % p
        y1 = (y0 + 1) % p

        def corner(ix, iy, dx, dy):
            return self.gx[iy, ix] * dx + self.gy[iy, ix] * dy

        n00 = corner(x0, y0, fx, fy)
        n10 = corner(x1, y0, fx - 1.0, fy)
        n01 = corner(x0, y1, fx, fy - 1.0)
        n11 = corner(x1, y1, fx - 1.0, fy - 1.0)
        u = fx * fx * fx * (fx * (fx * 6.0 - 15.0) + 10.0)
        v = fy * fy * fy * (fy * (fy * 6.0 - 15.0) + 10.0)
        nx0 = n00 + u * (n10 - n00)
        nx1 = n01 + u * (n11 - n01)
        return (nx0 + v * (nx1 - nx0)) * 1.41421356  # roughly [-1, 1]


class Fbm:
    """Fractal sum of periodic noise octaves. Coordinates are in base-lattice units."""

    def __init__(self, base_period: int, octaves: int, rng: np.random.Generator,
                 gain: float = 0.5, lacunarity: int = 2):
        self.layers = [PeriodicNoise(base_period * lacunarity**i, rng) for i in range(octaves)]
        self.gain = gain
        self.lacunarity = lacunarity

    def __call__(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        total = np.zeros_like(x)
        amp = 1.0
        norm = 0.0
        freq = 1.0
        for layer in self.layers:
            total += amp * layer(x * freq, y * freq)
            norm += amp
            amp *= self.gain
            freq *= self.lacunarity
        return total / norm


# ── Slab recipe ──────────────────────────────────────────────────────────────


@dataclass
class Palette:
    base_light: tuple[int, int, int]
    base_dark: tuple[int, int, int]
    vein_primary: tuple[int, int, int]
    vein_secondary: tuple[int, int, int]
    vein_gold: tuple[int, int, int]
    hairline: tuple[int, int, int]
    primary_strength: float
    secondary_strength: float
    gold_strength: float
    hairline_strength: float
    cloud_strength: float
    grain: float


WHITE = Palette(
    base_light=(251, 249, 245),
    base_dark=(238, 234, 226),
    vein_primary=(112, 107, 100),
    vein_secondary=(158, 152, 143),
    vein_gold=(170, 138, 82),
    hairline=(150, 144, 136),
    primary_strength=0.78,
    secondary_strength=0.5,
    gold_strength=0.5,
    hairline_strength=0.32,
    cloud_strength=0.75,
    grain=1.0,
)

BLACK = Palette(
    base_light=(26, 24, 22),
    base_dark=(10, 10, 9),
    vein_primary=(226, 220, 208),
    vein_secondary=(150, 145, 136),
    vein_gold=(196, 160, 98),
    hairline=(120, 116, 108),
    primary_strength=0.85,
    secondary_strength=0.42,
    gold_strength=0.6,
    hairline_strength=0.3,
    cloud_strength=0.8,
    grain=1.4,
)


def blend(base: np.ndarray, color: tuple[int, int, int], alpha: np.ndarray) -> np.ndarray:
    c = np.array(color, dtype=np.float64)[None, None, :]
    a = np.clip(alpha, 0.0, 1.0)[..., None]
    return base * (1.0 - a) + c * a


def vein_layer(field: np.ndarray, frequency: float, sharpness: np.ndarray) -> np.ndarray:
    """Thin lines along evenly spaced contours of `field`."""
    s = np.abs(np.sin(field * np.pi * frequency))
    return np.power(1.0 - s, sharpness)


def render(size: int, seed: int, palette: Palette) -> Image.Image:
    rng = np.random.default_rng(seed)
    cells = 3  # base lattice cells across one tile: sets the scale of the noise

    coords = (np.arange(size, dtype=np.float64) + 0.5) / size
    u, v = np.meshgrid(coords, coords)  # tile-normalised [0, 1)
    x, y = u * cells, v * cells  # lattice units

    # Domain warp: large, slow folds so veins sweep rather than crinkle.
    warp_a = Fbm(cells, 3, rng, gain=0.5)
    warp_b = Fbm(cells, 3, rng, gain=0.5)
    wx = x + 0.9 * warp_a(x + 0.37, y + 1.91)
    wy = y + 0.9 * warp_b(x + 2.73, y + 0.58)

    # Classic marble: a directional ramp plus turbulence. Integer ramp slopes
    # keep |sin| seamless across tile edges.
    primary_field = (1.0 * u + 1.0 * v) + 0.36 * Fbm(cells, 4, rng, gain=0.42)(wx, wy)
    secondary_field = (2.0 * u - 1.0 * v) + 0.55 * Fbm(cells, 5, rng, gain=0.5)(wx + 3.1, wy - 1.2)
    hair_field = (1.0 * u + 3.0 * v) + 0.9 * Fbm(cells * 2, 5, rng, gain=0.55)(wx + 1.7, wy + 0.9)

    # Masks so veins swell, fade and break along their length.
    mask_a = Fbm(cells, 3, rng)(x + 4.1, y + 2.2)
    mask_b = Fbm(cells * 2, 3, rng)(x + 0.6, y + 5.3)
    gold_mask = Fbm(cells, 3, rng)(x + 7.7, y + 3.3)
    width_noise = Fbm(cells * 2, 3, rng)(x + 9.1, y + 1.4)

    primary_sharp = 30.0 * np.exp(0.9 * width_noise)
    primary = vein_layer(primary_field, 1.0, primary_sharp)
    # A fainter companion strand that peels away where the warp pulls them apart.
    strand = vein_layer(primary_field + 0.018 + 0.02 * width_noise, 1.0, primary_sharp * 1.6) * 0.55
    primary = np.maximum(primary, strand)
    primary *= np.clip(0.55 + 1.1 * mask_a, 0.0, 1.0)
    # Feathered bloom around the main veins, like mineral bleeding into stone.
    bloom = vein_layer(primary_field, 1.0, primary_sharp * 0.06) * np.clip(0.4 + mask_a, 0.0, 1.0)

    secondary = vein_layer(secondary_field, 1.0, 70.0 * np.exp(0.7 * width_noise))
    secondary *= np.clip(0.2 + 1.2 * mask_b, 0.0, 1.0)

    gold = vein_layer(primary_field + 0.012, 1.0, primary_sharp * 2.2)
    gold *= np.clip(gold_mask * 1.8 - 0.1, 0.0, 1.0)

    hair = vein_layer(hair_field, 2.0, 180.0)
    hair *= np.clip(0.3 + 0.9 * mask_b, 0.0, 1.0)

    cloud = Fbm(cells, 4, rng, gain=0.55)(x + 3.3, y + 8.8)
    cloud = np.clip(0.5 + 1.1 * cloud, 0.0, 1.0) * palette.cloud_strength

    light = np.array(palette.base_light, dtype=np.float64)[None, None, :]
    dark = np.array(palette.base_dark, dtype=np.float64)[None, None, :]
    img = light * (1.0 - cloud[..., None]) + dark * cloud[..., None]

    img = blend(img, palette.vein_secondary, bloom * 0.22 * palette.primary_strength)
    img = blend(img, palette.hairline, hair * palette.hairline_strength)
    img = blend(img, palette.vein_secondary, secondary * palette.secondary_strength)
    img = blend(img, palette.vein_primary, primary * palette.primary_strength)
    img = blend(img, palette.vein_gold, gold * palette.gold_strength)

    if palette.grain > 0:
        img += rng.normal(0.0, palette.grain, img.shape)

    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--seed", type=int, default=1979)
    parser.add_argument("--size", type=int, default=1600, help="tile size in pixels (white marble)")
    parser.add_argument("--out", type=Path, default=OUT_DIR)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)

    white = render(args.size, args.seed, WHITE)
    white.save(args.out / "marble-white.webp", "WEBP", quality=82, method=6)

    black = render(args.size * 3 // 4, args.seed + 11, BLACK)
    black.save(args.out / "marble-black.webp", "WEBP", quality=80, method=6)

    # Small previews for social cards and low-bandwidth contexts.
    white.resize((640, 640), Image.LANCZOS).save(args.out / "marble-white-sm.webp", "WEBP", quality=80)

    for name in ("marble-white.webp", "marble-black.webp", "marble-white-sm.webp"):
        path = args.out / name
        print(f"{path.relative_to(ROOT)}  {path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
