#!/usr/bin/env python3
"""
Générateur de terrain Bloxd.io personnalisé (.bloxdschem)
Généré par Bloxd Terrain Editor (Web App)
Date: 2026-07-02

Ce script utilise numpy et la spécification Avro M2B pour générer un fichier .bloxdschem
compatible avec Bloxd.io via la commande en jeu //schematic load.
"""


import os
import json
import math
import numpy as np
from bloxd_format import BloxdSchemWriter

# ============================================================
# PARAMÈTRES DU MONDE CONFIGURÉS
# ============================================================
SEED = 54321
WORLD_SIZE_X = 4000
WORLD_SIZE_Z = 4000
WORLD_MIN_X = -WORLD_SIZE_X // 2
WORLD_MIN_Z = -WORLD_SIZE_Z // 2

BASE_Y = 70
SEA_Y = 88
MIN_HEIGHT = 1
MAX_HEIGHT = 400

NOISE_SCALE = 0.008
TERRAIN_INTENSITY = 15
ROUGHNESS = 0.65

FILL_WATER = True
WATER_BLOCK = "Water"
CHUNK = 32
SCHEM_NAME = "Custom Bloxd World"
OUTPUT_PATH = "custom_terrain.bloxdschem"

# ============================================================
# CHARGEMENT TABLE DES BLOCS BLOXD
# ============================================================
try:
    with open("nameToId.json", "r", encoding="utf-8") as fp:
        NAME_TO_ID = json.load(fp)
except FileNotFoundError:
    print("⚠️  Warning: nameToId.json not found. Using fallback block mappings.")
    NAME_TO_ID = {
        "Air": 0, "Unloaded": 1, "Dirt": 2, "Messy Dirt": 3, "Grass Block": 4, "Sand": 5, "Clay": 6, "Gravel": 7, "Snow": 8,
        "Maple Log": 9, "Pine Log": 10, "Plum Log": 11, "Cedar Log": 12, "Aspen Log": 13, "Elm Log": 14,
        "Stone": 28, "Messy Stone": 29, "Smooth Stone": 31, "Diorite": 32, "Smooth Diorite": 33, "Andesite": 34, "Smooth Andesite": 35,
        "Granite": 36, "Smooth Granite": 37, "Sandstone": 38, "Yellowstone": 39,
        "White Wool": 51, "Orange Wool": 52, "Magenta Wool": 53, "Light Blue Wool": 54, "Yellow Wool": 55, "Lime Wool": 56,
        "Pink Wool": 57, "Gray Wool": 58, "Light Gray Wool": 59, "Cyan Wool": 60, "Purple Wool": 61, "Blue Wool": 62, "Brown Wool": 63,
        "Green Wool": 64, "Red Wool": 65, "Black Wool": 66,
        "Baked Clay": 67, "White Baked Clay": 68, "Orange Baked Clay": 69, "Magenta Baked Clay": 70, "Light Blue Baked Clay": 71,
        "Yellow Baked Clay": 72, "Lime Baked Clay": 73, "Pink Baked Clay": 74, "Gray Baked Clay": 75, "Light Gray Baked Clay": 76,
        "Cyan Baked Clay": 77, "Purple Baked Clay": 78, "Blue Baked Clay": 79, "Brown Baked Clay": 80, "Green Baked Clay": 81,
        "Red Baked Clay": 82, "Black Baked Clay": 83,
        "Gray Concrete": 84, "Light Gray Concrete": 85, "Black Concrete": 86, "Blue Concrete": 87, "Brown Concrete": 88,
        "Cyan Concrete": 89, "Light Blue Concrete": 90, "Lime Concrete": 91, "Magenta Concrete": 92, "Orange Concrete": 93,
        "Pink Concrete": 94, "Purple Concrete": 95, "Red Concrete": 96, "White Concrete": 97, "Green Concrete": 98, "Yellow Concrete": 99,
        "Water": 126, "Bricks": 128, "Stone Bricks": 129, "Block of Quartz": 132, "Mossy Stone Bricks": 135, "Cracked Stone Bricks": 136,
        "Smooth Sandstone": 137, "Ice": 139, "Obsidian": 140, "Bedrock": 147, "Lime Planks": 233, "Green Planks": 241,
        "Packed Snow": 8, "Overgrown Jungle Grass Block": 4, "White Chalk": 97
    }

_SUBSTITUTIONS = {
    "Overgrown Jungle Grass Block": "Grass Block",
    "Packed Snow": "Snow",
    "White Chalk": "White Concrete",
}

def block_id(name: str) -> int:
    if name in NAME_TO_ID: return NAME_TO_ID[name]
    sub = _SUBSTITUTIONS.get(name)
    if sub and sub in NAME_TO_ID: return NAME_TO_ID[sub]
    return NAME_TO_ID.get("Grass Block", 4)

biomes = {
    "plain": ["Lime Concrete", "Grass Block", "Lime Wool", "Lime Planks"],
    "forest": ["Lime Baked Clay", "Green Wool", "Green Planks", "Green Concrete", "Green Baked Clay"],
    "sand": ["Sand", "Smooth Sandstone"],
    "mountain": ["Smooth Stone", "Stone", "Stone Bricks", "Cracked Stone Bricks"],
    "snow": ["Snow", "Packed Snow", "White Concrete"],
    "desert": ["Orange Baked Clay", "Baked Clay", "Smooth Red Sandstone", "Red Sand"],
    "volcano": ["Cherry Log", "Dark Red Brick", "Dark Red Stone", "Red Baked Clay", "Magma"],
}

def _init_biome_globals():
    global biome_names, biome_index, biome_blocks_ids
    biome_names = list(biomes.keys())
    biome_index = {name: idx for idx, name in enumerate(biome_names)}
    biome_blocks_ids = {b: [block_id(n) for n in lst] for b, lst in biomes.items()}

_init_biome_globals()

# ============================================================
# FONCTIONS DE BRUIT ET HAUTEUR
# ============================================================
def rand01_from_xz(x, z):
    h = x * 374761393 + z * 668265263
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0x7fffffff) / 2147483648.0

def value_noise2d(x, z):
    xi = np.floor(x).astype(np.int64) & 255
    zi = np.floor(z).astype(np.int64) & 255
    xf = x - np.floor(x)
    zf = z - np.floor(z)
    u = xf * xf * (3.0 - 2.0 * xf)
    v = zf * zf * (3.0 - 2.0 * zf)
    
    global _PERM_TABLE
    if '_PERM_TABLE' not in globals():
        rng = np.random.RandomState(SEED)
        p = rng.permutation(256).astype(np.int64)
        _PERM_TABLE = np.concatenate([p, p])
    
    perm = _PERM_TABLE
    aa = perm[perm[xi] + zi] / 255.0
    ab = perm[perm[xi] + zi + 1] / 255.0
    ba = perm[perm[xi + 1] + zi] / 255.0
    bb = perm[perm[xi + 1] + zi + 1] / 255.0
    
    x1 = aa + u * (ba - aa)
    x2 = ab + u * (bb - ab)
    return x1 + v * (x2 - x1)

def get_terrain_height(X, Z):
    n1 = value_noise2d(X * NOISE_SCALE, Z * NOISE_SCALE)
    n2 = value_noise2d(X * NOISE_SCALE * 2.3 + 19.7, Z * NOISE_SCALE * 2.3 - 41.2)
    ridges = 1 - np.abs(2 * n2 - 1)
    
    h = BASE_Y + (n1 - 0.5) * TERRAIN_INTENSITY * 2.5
    h = h + ridges * TERRAIN_INTENSITY * ROUGHNESS * 1.8
    h = np.round(np.clip(h, MIN_HEIGHT, MAX_HEIGHT))
    return h.astype(np.int32)

def build_grid(x0, x1, z0, z1):
    xs = np.arange(x0, x1, dtype=np.float64)
    zs = np.arange(z0, z1, dtype=np.float64)
    return np.meshgrid(xs, zs, indexing="ij")



def get_biome_ids(X, Z, H, topY):
    """Attribution des biomes par colonne + infos de GRADIENT aux frontieres.
    Retourne (main_biome, blend_mask, second_biome) :
      - main_biome   : id du biome principal de chaque colonne
      - blend_mask   : True pres d'une frontiere de biome (zone de transition)
      - second_biome : id du biome voisin a melanger dans la zone de transition
    """
    main_biome = np.zeros(topY.shape, dtype=np.int32)
    main_biome = np.where(topY <= SEA_Y + 3, 2 if len(biome_names) > 2 else 0, main_biome)
    main_biome = np.where((topY > SEA_Y + 3) & (topY < 95), 0, main_biome)
    main_biome = np.where(topY >= 95, 3 if len(biome_names) > 3 else 0, main_biome)

    # Zone de transition : a moins de 4 blocs d'altitude d'un seuil de biome
    d_sea = np.abs(topY - (SEA_Y + 3))
    d_mtn = np.abs(topY - 95)
    blend_mask = (d_sea <= 4) | (d_mtn <= 4)

    # Biome secondaire : celui de l'autre cote du seuil le plus proche
    second_biome = main_biome.copy()
    sand_id = 2 if len(biome_names) > 2 else 0
    mtn_id = 3 if len(biome_names) > 3 else 0
    near_sea = d_sea <= d_mtn
    second_biome = np.where(blend_mask & near_sea & (main_biome == 0), sand_id, second_biome)
    second_biome = np.where(blend_mask & near_sea & (main_biome == sand_id), 0, second_biome)
    second_biome = np.where(blend_mask & ~near_sea & (main_biome == 0), mtn_id, second_biome)
    second_biome = np.where(blend_mask & ~near_sea & (main_biome == mtn_id), 0, second_biome)
    return main_biome, blend_mask, second_biome

def blend_biomes_at_borders(main_biome, Xi, Zi, radius=3):
    """GRADIENT DE BIOMES : dithering spatial aux frontieres.
    Chaque colonne echantillonne le biome d'un voisin pseudo-aleatoire dans
    un rayon donne. Au coeur d'un biome rien ne change ; pres d'une frontiere
    les blocs des deux biomes s'entremelent progressivement (~2*radius blocs)."""
    r1 = rand01_from_xz(Xi + 977, Zi + 331)
    r2 = rand01_from_xz(Xi + 613, Zi + 199)
    dx = (np.floor(r1 * (2 * radius + 1)).astype(np.int64) - radius)
    dz = (np.floor(r2 * (2 * radius + 1)).astype(np.int64) - radius)
    ix = np.clip(np.arange(main_biome.shape[0])[:, None] + dx, 0, main_biome.shape[0] - 1)
    iz = np.clip(np.arange(main_biome.shape[1])[None, :] + dz, 0, main_biome.shape[1] - 1)
    return main_biome[ix, iz]

def pick_block(biome_id_arr, x_int, z_int, offx=0, offz=0):
    r = rand01_from_xz(x_int + offx, z_int + offz)
    out = np.zeros(biome_id_arr.shape, dtype=np.int32)
    for bname, bidx in biome_index.items():
        if bname not in biome_blocks_ids: continue
        ids = np.array(biome_blocks_ids[bname], dtype=np.int32)
        mask = biome_id_arr == bidx
        if not mask.any(): continue
        sel = np.floor(r[mask] * len(ids)).astype(np.int64) % len(ids)
        out[mask] = ids[sel]
    return out

def get_filler_block(main_biome_arr, top_block_arr, x_int, z_int):
    out = np.zeros(main_biome_arr.shape, dtype=np.int32)
    dirt_id = block_id("Dirt")
    sand_filler_id = block_id("Smooth Sandstone")
    for bname, bidx in biome_index.items():
        mask = main_biome_arr == bidx
        if not mask.any(): continue
        if bname in ("plain", "forest"): out[mask] = dirt_id
        elif bname == "sand": out[mask] = sand_filler_id
        else: out[mask] = top_block_arr[mask]
    return out

def rle_encode_vectorized(arr_1d):
    n = len(arr_1d)
    if n == 0: return b""
    change = np.nonzero(np.diff(arr_1d))[0] + 1
    starts = np.concatenate(([0], change))
    ends = np.concatenate((change, [n]))
    lengths = (ends - starts).tolist()
    values = arr_1d[starts].tolist()
    out = bytearray()
    from bloxd_format import _uvarint
    for length, val in zip(lengths, values):
        out += _uvarint(length)
        out += _uvarint(int(val))
    return bytes(out)

# ============================================================
# GÉNÉRATION SCHEMATIC
# ============================================================
def main():
    import time
    t_start = time.time()
    tiles_x = WORLD_SIZE_X // CHUNK
    tiles_z = WORLD_SIZE_Z // CHUNK
    water_id = block_id(WATER_BLOCK)
    
    y_lo = min(BASE_Y, MIN_HEIGHT, SEA_Y)
    y_hi = max(BASE_Y, MAX_HEIGHT, SEA_Y)
    chunk_y_lo = (y_lo // CHUNK) - 1
    chunk_y_hi = (y_hi // CHUNK) + 1
    n_y_chunks = chunk_y_hi - chunk_y_lo + 1
    total_chunks = tiles_x * tiles_z * n_y_chunks

    print(f"🚀 Génération du monde {WORLD_SIZE_X}x{WORLD_SIZE_Z} ({tiles_x}x{tiles_z} tuiles, {n_y_chunks} couches Y = {total_chunks} chunks)...")

    with open(OUTPUT_PATH, "wb") as f:
        writer = BloxdSchemWriter(f, SCHEM_NAME, WORLD_SIZE_X, n_y_chunks * CHUNK, WORLD_SIZE_Z, pos=(WORLD_MIN_X, 0, WORLD_MIN_Z))
        chunks_done = 0

        for tx in range(tiles_x):
            x0 = WORLD_MIN_X + tx * CHUNK
            for tz in range(tiles_z):
                z0 = WORLD_MIN_Z + tz * CHUNK
                X, Z = build_grid(x0, x0 + CHUNK, z0, z0 + CHUNK)
                Xi = X.astype(np.int64)
                Zi = Z.astype(np.int64)

                H = get_terrain_height(X, Z)
                topY = (BASE_Y + H).astype(np.int64)

                main_biome = np.zeros_like(Xi, dtype=np.int32)
                main_biome = np.where(topY <= SEA_Y + 3, 2 if len(biome_names)>2 else 0, main_biome)
                main_biome = np.where((topY > SEA_Y + 3) & (topY < 95), 0, main_biome)
                main_biome = np.where(topY >= 95, 3 if len(biome_names)>3 else 0, main_biome)

                # GRADIENT DE BIOMES : melange des textures aux frontieres
                main_biome = blend_biomes_at_borders(main_biome, Xi, Zi)

                top_block = pick_block(main_biome, Xi, Zi)
                filler_block = get_filler_block(main_biome, top_block, Xi, Zi)
                underwater = FILL_WATER & (topY < SEA_Y)

                for cy in range(chunk_y_lo, chunk_y_hi + 1):
                    y_base = cy * CHUNK
                    ly = np.arange(CHUNK)
                    wy = (y_base + ly)[np.newaxis, np.newaxis, :]
                    topY3 = topY[:, :, np.newaxis]
                    filler3 = filler_block[:, :, np.newaxis]
                    top3 = top_block[:, :, np.newaxis]
                    underwater3 = underwater[:, :, np.newaxis]

                    is_top = wy == topY3
                    is_filler = (wy < topY3) & (wy >= BASE_Y)
                    is_water = underwater3 & (wy > topY3) & (wy <= SEA_Y)

                    block_arr = np.zeros((CHUNK, CHUNK, CHUNK), dtype=np.int32)
                    block_arr = np.where(is_filler, filler3, block_arr)
                    block_arr = np.where(is_top, top3, block_arr)
                    block_arr = np.where(is_water, water_id, block_arr)

                    if not block_arr.any():
                        chunks_done += 1
                        continue

                    flat = np.transpose(block_arr, (0, 2, 1)).reshape(-1)
                    rle = rle_encode_vectorized(flat)
                    writer.add_chunk(tx, cy - chunk_y_lo, tz, rle)
                    chunks_done += 1

            if (tx + 1) % 15 == 0 or tx == tiles_x - 1:
                pct = 100.0 * chunks_done / total_chunks
                print(f"  ... {chunks_done}/{total_chunks} chunks ({pct:.1f}%), {time.time() - t_start:.1f}s écoulées", flush=True)

        writer.finish()

    dt = time.time() - t_start
    size_mb = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
    print(f"✅ Terminé en {dt:.1f}s ! Fichier créé : {OUTPUT_PATH} ({size_mb:.2f} Mo, {chunks_done} chunks écrits)")

if __name__ == "__main__":
    main()
