#!/usr/bin/env python3
"""
Version "split" du générateur : au lieu d'un seul .bloxdschem énorme,
on découpe en centaines de petits fichiers, chacun sous la limite
pratique de ~200 chunks/fichier que Bloxd.io respecte au chargement
(//schematic load), comme le fait l'outil officiel M2B pour les gros
schematics.

Calcul de la taille de tuile :
  - hauteur réelle utilisée par le terrain (pas les 400 max théoriques,
    la vraie donnée) = 9 chunks (y=70..270, cf. la 1ère passe du
    générateur non-split)
  - budget 200 chunks / fichier -> T (chunks en X et Z) tel que
    T*T*9 <= 200  =>  T = 4 chunks = 128 blocs par tuile (~127 demandés)
  - 125 chunks-de-base en X et Z (4000/32) / 4 => 32 tuiles par axe
  - 32 x 32 = 1024 fichiers .bloxdschem, regroupés dans un .zip
"""

import os
import sys
import time
import zipfile

sys.path.insert(0, "/home/claude")
import numpy as np

import generate_terrain as gt
from bloxd_format import BloxdSchemWriter

TILE_CHUNKS = 4          # chunks per axis per output file (X and Z)
TILE_BLOCKS = TILE_CHUNKS * gt.CHUNK   # 128 blocks
OUT_DIR = "/home/claude/split_tiles"
ZIP_PATH = "/mnt/user-data/outputs/giant_terrain_split.zip"


def compute_column_data(x0, z0, w, d):
    """Compute per-column top/filler block ids + topY for a w x d tile."""
    X, Z = gt.build_grid(x0, x0 + w, z0, z0 + d)
    Xi = X.astype(np.int64)
    Zi = Z.astype(np.int64)

    H = gt.get_terrain_height(X, Z)
    topY = (gt.BASE_Y + H).astype(np.int64)

    main_biome, blend_mask, second_biome = gt.get_biome_ids(X, Z, H, topY)

    top_block_main = gt.pick_block(main_biome, Xi, Zi)
    top_block_second = gt.pick_block(second_biome, Xi, Zi, 500, 500)
    # GRADIENT DE BIOMES : probabilite de melange progressive (0 -> 50%)
    # selon la proximite de la frontiere, au lieu d'un simple 15% uniforme
    d_sea = np.abs(topY - (gt.SEA_Y + 3)).astype(np.float64)
    d_mtn = np.abs(topY - 95).astype(np.float64)
    dist = np.minimum(d_sea, d_mtn)
    mix_p = np.clip(0.5 * (1.0 - dist / 5.0), 0.0, 0.5)
    blend_roll = gt.rand01_from_xz(Xi + 913, Zi - 271)
    top_block = np.where(blend_mask & (blend_roll < mix_p), top_block_second, top_block_main)

    filler_block = gt.get_filler_block(main_biome, top_block, Xi, Zi)
    underwater = gt.FILL_WATER & (topY < gt.SEA_Y)

    return topY, top_block, filler_block, underwater


def write_tile_file(path, x0, z0, w, d, chunk_y_lo, chunk_y_hi, water_id):
    topY, top_block, filler_block, underwater = compute_column_data(x0, z0, w, d)
    n_y_chunks = chunk_y_hi - chunk_y_lo + 1

    with open(path, "wb") as f:
        # FIX BUG "HTTP 400 sur les parties 2+" : comme dans generator.js, Bloxd.io n'utilise
        # pas le champ position (x, z) du header pour replacer automatiquement une tuile
        # ailleurs dans le monde (seul Y garde un sens). Écrire x0/z0 ici faisait que seule la
        # toute première tuile (x0 = z0 = 0) était acceptée par le serveur, les autres étant
        # rejetées avec une erreur 400. Le déplacement doit être fait manuellement par le
        # joueur entre deux "//schematic load" : le nom du fichier (x{x0}-z{z0}) indique de
        # combien de blocs se décaler sur X et Z par rapport à la tuile x0=0/z0=0.
        writer = BloxdSchemWriter(
            f, gt.SCHEM_NAME, w, n_y_chunks * gt.CHUNK, d, pos=(0, chunk_y_lo * gt.CHUNK, 0)
        )

        n_tx = w // gt.CHUNK if w % gt.CHUNK == 0 else (w // gt.CHUNK) + 1
        n_tz = d // gt.CHUNK if d % gt.CHUNK == 0 else (d // gt.CHUNK) + 1

        for ltx in range(n_tx):
            lx0 = ltx * gt.CHUNK
            lx1 = min(lx0 + gt.CHUNK, w)
            for ltz in range(n_tz):
                lz0 = ltz * gt.CHUNK
                lz1 = min(lz0 + gt.CHUNK, d)

                sub_top = topY[lx0:lx1, lz0:lz1]
                sub_filler = filler_block[lx0:lx1, lz0:lz1]
                sub_top_block = top_block[lx0:lx1, lz0:lz1]
                sub_underwater = underwater[lx0:lx1, lz0:lz1]

                cw = lx1 - lx0
                cd = lz1 - lz0

                for cy in range(chunk_y_lo, chunk_y_hi + 1):
                    y_base = cy * gt.CHUNK
                    ly = np.arange(gt.CHUNK)
                    world_y = y_base + ly

                    wy = world_y[np.newaxis, np.newaxis, :]
                    topY3 = sub_top[:, :, np.newaxis]
                    filler3 = sub_filler[:, :, np.newaxis]
                    top3 = sub_top_block[:, :, np.newaxis]
                    underwater3 = sub_underwater[:, :, np.newaxis]

                    is_top = wy == topY3
                    is_filler = (wy < topY3) & (wy >= gt.BASE_Y)
                    is_water = underwater3 & (wy > topY3) & (wy <= gt.SEA_Y)

                    # full 32x32x32 block, zero-padded if this is an edge (partial) chunk
                    block_arr = np.zeros((gt.CHUNK, gt.CHUNK, gt.CHUNK), dtype=np.int32)
                    core = np.zeros((cw, cd, gt.CHUNK), dtype=np.int32)
                    core = np.where(is_filler, filler3, core)
                    core = np.where(is_top, top3, core)
                    core = np.where(is_water, water_id, core)
                    block_arr[:cw, :cd, :] = core

                    if not block_arr.any():
                        continue

                    flat = np.transpose(block_arr, (0, 2, 1)).reshape(-1)
                    rle = gt.rle_encode_vectorized(flat)
                    writer.add_chunk(ltx, cy - chunk_y_lo, ltz, rle)

        writer.finish()


def main():
    t_start = time.time()
    os.makedirs(OUT_DIR, exist_ok=True)

    # --- reuse pass 1 (real vertical span) ---
    print("Pass 1: calcul de l'étendue verticale réelle...")
    min_top = 10 ** 9
    max_top = -10 ** 9
    tiles_z_base = gt.WORLD_SIZE_Z // gt.CHUNK
    for tz in range(tiles_z_base):
        z0 = gt.WORLD_MIN_Z + tz * gt.CHUNK
        X, Z = gt.build_grid(gt.WORLD_MIN_X, gt.WORLD_MIN_X + gt.WORLD_SIZE_X, z0, z0 + gt.CHUNK)
        H = gt.get_terrain_height(X, Z)
        topY = gt.BASE_Y + H
        min_top = min(min_top, int(topY.min()))
        max_top = max(max_top, int(topY.max()))

    y_lo = min(min_top, gt.BASE_Y, gt.SEA_Y)
    y_hi = max(max_top, gt.SEA_Y)
    chunk_y_lo = (y_lo // gt.CHUNK) - 1
    chunk_y_hi = (y_hi // gt.CHUNK) + 1
    n_y_chunks = chunk_y_hi - chunk_y_lo + 1
    print(f"y={y_lo}..{y_hi} -> {n_y_chunks} chunks de hauteur")

    chunks_per_tile = TILE_CHUNKS * TILE_CHUNKS * n_y_chunks
    print(f"Taille de tuile: {TILE_BLOCKS}x{TILE_BLOCKS} blocs x {n_y_chunks*gt.CHUNK} de haut "
          f"= {chunks_per_tile} chunks/fichier (budget: 200)")
    if chunks_per_tile > 200:
        print("ATTENTION: depasse le budget de 200 chunks, reduis TILE_CHUNKS.")

    water_id = gt.block_id(gt.WATER_BLOCK)

    n_tiles_x = (gt.WORLD_SIZE_X + TILE_BLOCKS - 1) // TILE_BLOCKS
    n_tiles_z = (gt.WORLD_SIZE_Z + TILE_BLOCKS - 1) // TILE_BLOCKS
    total_tiles = n_tiles_x * n_tiles_z
    print(f"{n_tiles_x} x {n_tiles_z} = {total_tiles} fichiers .bloxdschem a generer")

    t_last = time.time()
    done = 0
    file_list = []
    for tix in range(n_tiles_x):
        x0 = gt.WORLD_MIN_X + tix * TILE_BLOCKS
        w = min(TILE_BLOCKS, gt.WORLD_MIN_X + gt.WORLD_SIZE_X - x0)
        for tiz in range(n_tiles_z):
            z0 = gt.WORLD_MIN_Z + tiz * TILE_BLOCKS
            d = min(TILE_BLOCKS, gt.WORLD_MIN_Z + gt.WORLD_SIZE_Z - z0)

            fname = f"giant_terrain-x{x0}-z{z0}.bloxdschem"
            fpath = os.path.join(OUT_DIR, fname)
            if not (os.path.exists(fpath) and os.path.getsize(fpath) > 0):
                write_tile_file(fpath, x0, z0, w, d, chunk_y_lo, chunk_y_hi, water_id)
            file_list.append(fpath)
            done += 1

        if time.time() - t_last > 10:
            pct = 100.0 * done / total_tiles
            print(f"  ... {done}/{total_tiles} fichiers ({pct:.1f}%), {time.time()-t_start:.0f}s", flush=True)
            t_last = time.time()

    print(f"Generation terminee ({done} fichiers) en {time.time()-t_start:.0f}s. Compression en zip...")
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_STORED) as zf:
        for fpath in file_list:
            zf.write(fpath, arcname=os.path.basename(fpath))

    total_dt = time.time() - t_start
    zip_size_mb = os.path.getsize(ZIP_PATH) / (1024 * 1024)
    print(f"Termine en {total_dt:.0f}s. {ZIP_PATH} ({zip_size_mb:.1f} Mo), {done} fichiers .bloxdschem")


if __name__ == "__main__":
    main()
