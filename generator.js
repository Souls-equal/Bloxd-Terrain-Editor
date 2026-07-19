window.safeStorage = window.safeStorage || {
    _data: {},
    getItem(k) {
        try { return window.localStorage.getItem(k); }
        catch (e) { return this._data[k] || null; }
    },
    setItem(k, v) {
        try { window.localStorage.setItem(k, v); }
        catch (e) { this._data[k] = v; }
    },
    removeItem(k) {
        try { window.localStorage.removeItem(k); }
        catch (e) { delete this._data[k]; }
    }
};

/**
 * GIGA PROMPT - Bloxd Terrain Editor
 * Module : generator.js
 * Rôle : Générateur procédural de terrain (bruit 2D, biomes, gestion de la grille, outils de peinture/édition)
 * Adapté de generate_terrain.py (M2B / Bloxd.io Format)
 */

class TerrainGenerator {
    constructor() {
        // Configuration par défaut inspirée de generate_terrain.py
        this.config = {
            worldSizeX: 4000,
            worldSizeZ: 4000,
            gridResolution: 256, // Résolution de la grille globale (96/128/256)
            pixelatedExport: false, // Export en gros blocs texturés (effet pixelisé) au lieu du lissage bilinéaire
            forceSingleSchem: false, // Forcer l'export en un seul .bloxdschem (pour outils externes, dépasse la limite Bloxd)
            viewportMode: 'global', // Mode unique : grille globale (le "Focus Écran Dynamique" a été retiré ;
            // le détail au zoom est désormais assuré par les chunks 16x16 chargés à la demande, cf. getDetailChunk)
            seed: 54321,
            baseY: 70,
            seaLevel: 88,
            minHeight: 1,
            maxHeight: 400,
            noiseScale: 0.008,
            terrainIntensity: 15,
            roughness: 0.65,
            defaultBiome: 'plain',
            hillshading: true,
            showGrid: false,
            showWater: true,
            meshType: 'voxel' // 'voxel' | 'smooth'
        };

        // Stockage spatial persistant des modifications "Edit" (pinceau/hauteur/biome) : clé `${worldX},${worldZ}`
        this.customEdits = new Map();
        // Fenêtre active du viewport à l'écran (+ un peu plus / marge)
        this.viewport = { minX: -350, maxX: 350, minZ: -350, maxZ: 350, active: true };
        // Piles d'historique Undo / Redo (Ctrl+Z / Ctrl+Y)
        this.undoStack = [];
        this.redoStack = [];
        // Catalogue des biomes avec leurs blocs Bloxd par défaut et couleurs associées
        this.biomes = {
            plain: {
                name: 'Plaines (Plain)',
                color: '#4ade80', // Vert prairie clair
                blocks: ['Lime Concrete', 'Grass Block', 'Lime Wool', 'Lime Planks'],
                minHeight: 0,
                maxHeight: 110
            },
            forest: {
                name: 'Forêt (Forest)',
                color: '#15803d', // Vert forêt profond
                blocks: ['Lime Baked Clay', 'Green Wool', 'Green Planks', 'Green Concrete', 'Green Baked Clay'],
                minHeight: 60,
                maxHeight: 130
            },
            sand: {
                name: 'Sable / Plage (Sand)',
                color: '#e0cda9', // Beige sable
                blocks: ['Sand', 'Smooth Sandstone'],
                minHeight: 0,
                maxHeight: 93 // Proche du sea level
            },
            mountain: {
                name: 'Montagne (Mountain)',
                color: '#64748b', // Gris rocheux
                blocks: ['Smooth Stone', 'Stone', 'Stone Bricks', 'Cracked Stone Bricks'],
                minHeight: 105,
                maxHeight: 250
            },
            snow: {
                name: 'Neige (Snow)',
                color: '#f8fafc', // Blanc neigeux
                blocks: ['Snow', 'Packed Snow', 'White Concrete'],
                minHeight: 140,
                maxHeight: 400
            },
            desert: {
                name: 'Mesa (Mesa)',
                color: '#ea580c', // Orange terre cuite
                blocks: ['Orange Baked Clay', 'Baked Clay', 'Smooth Red Sandstone', 'Red Sand'],
                minHeight: 65,
                maxHeight: 150
            },
            volcano: {
                name: 'Volcan (Volcano)',
                color: '#dc2626', // Rouge magma / basalte
                blocks: ['Cherry Log', 'Dark Red Brick', 'Dark Red Stone', 'Red Baked Clay', 'Magma'],
                minHeight: 120,
                maxHeight: 350
            }
        };


        // REGLES DE HAUTEUR PAR BIOME : { active, yMin, yMax, locked }
        // - active : la règle force ce biome entre yMin et yMax à la génération
        // - locked : "prioritaire" = le pinceau biome ne peut pas peindre par-dessus
        this.initBiomeRules();
        // Presets prédéfinis pour charger rapidement des univers intéressants
        this.presets = {
            classic: {
                name: "🟢 Plaines Bloxd Classique",
                config: { worldSizeX: 4000, worldSizeZ: 4000, seed: 54321, baseY: 70, seaLevel: 88, minHeight: 1, maxHeight: 250, noiseScale: 0.008, terrainIntensity: 15, roughness: 0.65 }
            },
            archipelago: {
                name: "🏝️ Archipel Tropical & Plages",
                config: { worldSizeX: 4000, worldSizeZ: 4000, seed: 88412, baseY: 65, seaLevel: 92, minHeight: 10, maxHeight: 180, noiseScale: 0.012, terrainIntensity: 22, roughness: 0.4 }
            },
            alpine: {
                name: "🏔️ Hauts Sommets Glacés",
                config: { worldSizeX: 4000, worldSizeZ: 4000, seed: 99123, baseY: 90, seaLevel: 80, minHeight: 40, maxHeight: 380, noiseScale: 0.006, terrainIntensity: 35, roughness: 0.85 }
            },
            canyon: {
                name: "🏜️ Canyons du Désert Aride",
                config: { worldSizeX: 4000, worldSizeZ: 4000, seed: 33214, baseY: 80, seaLevel: 60, minHeight: 20, maxHeight: 220, noiseScale: 0.015, terrainIntensity: 28, roughness: 0.9 }
            }
        };

        // Table de hash pour le bruit pseudo-aléatoire
        this.perm = new Uint8Array(512);
        this.initPermutationTable(this.config.seed);

        // Grille de données 2D : grid[gx][gz] = { height, biome, isCustomHeight, isCustomBiome }
        this.grid = [];
        this.stats = {
            minHeight: 0,
            maxHeight: 0,
            avgHeight: 0,
            biomeCounts: {}
        };
    }

    /**
     * Initialise la table de permutation pour le bruit de Perlin/Value selon une graine
     */
    initPermutationTable(seed) {
        let p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        
        // Mélange pseudo-aléatoire basé sur seed
        let s = seed % 2147483647;
        if (s <= 0) s += 2147483646;
        for (let i = 255; i > 0; i--) {
            s = (s * 16807) % 2147483647;
            let j = s % (i + 1);
            let temp = p[i];
            p[i] = p[j];
            p[j] = temp;
        }
        for (let i = 0; i < 512; i++) {
            this.perm[i] = p[i & 255];
        }
    }

    /**
     * Fonction de bruit 2D lisse (Value Noise bicubique)
     */
    valueNoise2D(x, z) {
        let xi = Math.floor(x) & 255;
        let zi = Math.floor(z) & 255;
        let xf = x - Math.floor(x);
        let zf = z - Math.floor(z);

        // Courbe d'interpolation lissée (smoothstep)
        let u = xf * xf * (3.0 - 2.0 * xf);
        let v = zf * zf * (3.0 - 2.0 * zf);

        let aa = this.perm[this.perm[xi] + zi] / 255.0;
        let ab = this.perm[this.perm[xi] + zi + 1] / 255.0;
        let ba = this.perm[this.perm[xi + 1] + zi] / 255.0;
        let bb = this.perm[this.perm[xi + 1] + zi + 1] / 255.0;

        let x1 = aa + u * (ba - aa);
        let x2 = ab + u * (bb - ab);
        return x1 + v * (x2 - x1);
    }

    /**
     * Bruit fractal multi-octaves avec gestion des crêtes (ridges)
     */
    fbmTerrain(worldX, worldZ) {
        let scale = this.config.noiseScale;
        let intensity = this.config.terrainIntensity;
        let roughness = this.config.roughness;

        // Bruit de base 1 (ondulations douces)
        let n1 = this.valueNoise2D(worldX * scale, worldZ * scale);
        
        // Bruit de base 2 pour les crêtes rocheuses (ridges)
        let n2 = this.valueNoise2D(worldX * scale * 2.3 + 19.7, worldZ * scale * 2.3 - 41.2);
        let ridges = 1.0 - Math.abs(2.0 * n2 - 1.0);

        // Bruit octave 3 de détail
        let n3 = this.valueNoise2D(worldX * scale * 5.1, worldZ * scale * 5.1);

        let h = this.config.baseY;
        h += (n1 - 0.5) * intensity * 2.5;
        h += ridges * intensity * roughness * 1.8;
        h += (n3 - 0.5) * intensity * 0.4;

        return h;
    }

    /**
     * Détermine le biome approprié selon la hauteur et le niveau de la mer
     */

    initBiomeRules() {
        this.loadCustomBiomes();
        for (let key in this.biomes) {
            const b = this.biomes[key];
            if (!b.rule) {
                b.rule = {
                    active: false,
                    yMin: (b.minHeight !== undefined) ? b.minHeight : 0,
                    yMax: (b.maxHeight !== undefined) ? b.maxHeight : 400,
                    locked: false
                };
            }
        }
    }

    /**
     * Retourne le biome imposé par une règle active à cette hauteur, ou null.
     * Si plusieurs règles se chevauchent, la plus spécifique (intervalle le plus étroit) gagne.
     */
    getRuleBiomeForHeight(h) {
        let best = null, bestSpan = Infinity;
        for (let key in this.biomes) {
            const r = this.biomes[key].rule;
            if (r && r.active && h >= r.yMin && h <= r.yMax) {
                const span = r.yMax - r.yMin;
                if (span < bestSpan) { bestSpan = span; best = key; }
            }
        }
        return best;
    }

    /**
     * Retourne la clé du biome dont la règle "prioritaire" (locked) protège cette hauteur, ou null.
     */
    isBiomePaintBlocked(h) {
        for (let key in this.biomes) {
            const r = this.biomes[key].rule;
            if (r && r.active && r.locked && h >= r.yMin && h <= r.yMax) return key;
        }
        return null;
    }

    assignBiomeProcedural(height, worldX, worldZ) {
        // 1) REGLES DE HAUTEUR PAR BIOME (prioritaires sur la logique procédurale)
        const ruleBiome = this.getRuleBiomeForHeight(height);
        if (ruleBiome) return ruleBiome;

        // 2) Distorsion légère des biomes (biome warp)
        let warp = (this.valueNoise2D(worldX * 0.01, worldZ * 0.01) - 0.5) * 15;
        let effH = height + warp;

        if (effH <= this.config.seaLevel + 3) {
            return 'sand';
        } else if (effH >= 135) {
            return 'snow';
        } else if (effH >= 100) {
            return 'mountain';
        } else {
            // Alternance entre plain et forest
            let biomeNoise = this.valueNoise2D(worldX * 0.005 + 100, worldZ * 0.005 + 100);
            return biomeNoise > 0.55 ? 'forest' : 'plain';
        }
    }

    /**
     * Synchronise les cellules modifiées de la grille courante vers le stockage spatial persistant (customEdits)
     */
    syncGridToCustomEdits() {
        if (!this.grid || !this.customEdits) return;
        for (let gx = 0; gx < this.grid.length; gx++) {
            for (let gz = 0; gz < (this.grid[gx] ? this.grid[gx].length : 0); gz++) {
                const c = this.grid[gx][gz];
                if (c && (c.isCustomHeight || c.isCustomBiome)) {
                    // FIX v2.5 (trous après tampons / presets décimés) : si un
                    // point de peinture COUVRE déjà la cellule, il est la source
                    // de vérité (pinceau/tampon écrivent déjà leurs points).
                    // Réécrire ici avec l'empreinte GROSSIERE de la cellule
                    // déclenchait le balayage de setCustomEdit qui supprimait
                    // les points fins voisins : le preset Royal Continent
                    // passait de 196 512 à 65 536 points au premier snapshot
                    // undo -> gros cubes et trous visibles dans la carte !
                    if (this.getCustomEdit(c.worldX, c.worldZ, 0.01)) continue;
                    this.setCustomEdit(c.worldX, c.worldZ, c.isCustomHeight ? c.height : null, c.isCustomBiome ? c.biome : null);
                }
            }
        }
    }

    /**
     * Index spatial des édits (buckets) pour la recherche par empreinte.
     * FIX "pointillés" : la peinture couvre la surface de la cellule d'origine,
     * pas seulement son point central, même après un changement de qualité.
     */
    _rebuildEditIndex() {
        const B = 64;
        this._editIndex = new Map();
        this._maxEditHalf = 0.5;
        if (this.customEdits) {
            this.customEdits.forEach((val, key) => {
                const c = key.split(',');
                const x = parseInt(c[0], 10), z = parseInt(c[1], 10);
                const half = (val.half !== undefined) ? val.half : 0.5;
                if (half > this._maxEditHalf) this._maxEditHalf = half;
                const bkey = Math.floor(x / B) + ',' + Math.floor(z / B);
                let arr = this._editIndex.get(bkey);
                if (!arr) { arr = []; this._editIndex.set(bkey, arr); }
                arr.push({ x: x, z: z, half: half, edit: val });
            });
        }
        this._editIndexDirty = false;
    }

    getCustomEdit(wx, wz, searchHalf = 0) {
        if (!this.customEdits || this.customEdits.size === 0) return null;
        const exact = this.customEdits.get(`${Math.round(wx)},${Math.round(wz)}`);
        if (exact) return exact;
        // Recherche spatiale : un édit peint sur une cellule plus grossière
        // couvre toute la surface de cette cellule (empreinte "half")
        if (this._editIndexDirty !== false || !this._editIndex) this._rebuildEditIndex();
        const B = 64;
        const r = searchHalf + this._maxEditHalf;
        let best = null, bestD = Infinity;
        const bx0 = Math.floor((wx - r) / B), bx1 = Math.floor((wx + r) / B);
        const bz0 = Math.floor((wz - r) / B), bz1 = Math.floor((wz + r) / B);
        for (let bx = bx0; bx <= bx1; bx++) {
            for (let bz = bz0; bz <= bz1; bz++) {
                const arr = this._editIndex.get(bx + ',' + bz);
                if (!arr) continue;
                for (let i = 0; i < arr.length; i++) {
                    const e = arr[i];
                    const reach = searchHalf + e.half;
                    const dx = Math.abs(wx - e.x), dz = Math.abs(wz - e.z);
                    if (dx <= reach && dz <= reach) {
                        const d = dx * dx + dz * dz;
                        if (d < bestD) { bestD = d; best = e.edit; }
                    }
                }
            }
        }
        return best;
    }


    /**
     * Hauteur INTERPOLÉE entre les points de peinture voisins (IDW).
     * FIX "marches nettes" : l'export et la grille lissent les pentes entre
     * les points de peinture au lieu de prendre le plus proche (falaises).
     */
    getInterpolatedEditHeight(wx, wz, fallbackH) {
        if (this._editIndexDirty !== false || !this._editIndex) this._rebuildEditIndex();
        const B = 64;
        // R doit couvrir PLUSIEURS points de peinture (pas 2*half entre points),
        // sinon l'IDW dégénère en "plus proche voisin" -> plateaux carrés
        const R = Math.max(8, this._maxEditHalf * 4);
        let num = 0, den = 0;
        const bx0 = Math.floor((wx - R) / B), bx1 = Math.floor((wx + R) / B);
        const bz0 = Math.floor((wz - R) / B), bz1 = Math.floor((wz + R) / B);
        for (let bx = bx0; bx <= bx1; bx++) {
            for (let bz = bz0; bz <= bz1; bz++) {
                const arr = this._editIndex.get(bx + ',' + bz);
                if (!arr) continue;
                for (let i = 0; i < arr.length; i++) {
                    const e = arr[i];
                    if (e.edit.height === undefined) continue;
                    const dx = wx - e.x, dz = wz - e.z;
                    const d2 = dx * dx + dz * dz;
                    if (d2 > R * R) continue;
                    // + half² : dé-singularise le noyau au voisinage du point
                    // (sans ça, poids ~50x supérieur aux voisins -> gros plateaux
                    // de la taille de l'empreinte au lieu de pentes continues)
                    const w = 1 / (d2 + e.half * e.half + 0.5);
                    num += e.edit.height * w; den += w;
                }
            }
        }
        return den > 0 ? num / den : fallbackH;
    }

    setCustomEdit(wx, wz, height, biome, half) {
        if (!this.customEdits) this.customEdits = new Map();
        const key = `${Math.round(wx)},${Math.round(wz)}`;
        const existing = this.customEdits.get(key) || {};
        if (height !== null && height !== undefined) existing.height = Math.round(height);
        if (biome !== null && biome !== undefined) existing.biome = biome;
        // Empreinte : demi-taille de la cellule au moment de la peinture.
        // v2.5 : un half EXPLICITE remplace l'ancien (les tampons 1:1 doivent
        // pouvoir affiner un point grossier, sinon le point garde son empreinte
        // géante et son balayage supprimerait les points fins voisins).
        if (half === undefined || half === null) {
            const m = this.currentGridMeta;
            half = m ? Math.max(m.stepX, m.stepZ) / 2 : 0.5;
            existing.half = Math.max(existing.half || 0, half);
        } else {
            existing.half = half;
        }
        this.customEdits.set(key, existing);

        // Un coup de pinceau REMPLACE les anciens points de peinture qu'il
        // recouvre (sinon d'anciens points "fantômes" restaient stockés entre
        // les nouveaux et dominaient l'export : aplanir ne changeait rien !)
        const kx = Math.round(wx), kz = Math.round(wz);
        if (this._editIndexDirty !== false || !this._editIndex) this._rebuildEditIndex();
        const B = 64;
        const r = existing.half;
        const bx0 = Math.floor((kx - r) / B), bx1 = Math.floor((kx + r) / B);
        const bz0 = Math.floor((kz - r) / B), bz1 = Math.floor((kz + r) / B);
        for (let bx = bx0; bx <= bx1; bx++) {
            for (let bz = bz0; bz <= bz1; bz++) {
                const arr = this._editIndex.get(bx + ',' + bz);
                if (!arr) continue;
                for (let i = arr.length - 1; i >= 0; i--) {
                    const e = arr[i];
                    if (e.x === kx && e.z === kz) continue;
                    if (Math.abs(e.x - kx) <= r && Math.abs(e.z - kz) <= r) {
                        this.customEdits.delete(e.x + ',' + e.z);
                        arr.splice(i, 1);
                    }
                }
            }
        }
        // Mise à jour incrémentale de l'index (pas de reconstruction complète)
        const obk = Math.floor(kx / B) + ',' + Math.floor(kz / B);
        let oarr = this._editIndex.get(obk);
        if (!oarr) { oarr = []; this._editIndex.set(obk, oarr); }
        let found = null;
        for (let i = 0; i < oarr.length; i++) { if (oarr[i].x === kx && oarr[i].z === kz) { found = oarr[i]; break; } }
        if (found) { found.half = existing.half; found.edit = existing; }
        else oarr.push({ x: kx, z: kz, half: existing.half, edit: existing });
        if (existing.half > this._maxEditHalf) this._maxEditHalf = existing.half;
        this._editIndexDirty = false;
    }

    removeCustomEdit(wx, wz, half) {
        if (!this.customEdits) return;
        if (half === undefined || half === null) {
            const m = this.currentGridMeta;
            half = m ? Math.max(m.stepX, m.stepZ) / 2 : 0.5;
        }
        // Efface tout point de peinture dont l'empreinte touche la zone gommée
        const toDelete = [];
        this.customEdits.forEach((val, key) => {
            const c = key.split(',');
            const ex = parseInt(c[0], 10), ez = parseInt(c[1], 10);
            const reach = half + ((val.half !== undefined) ? val.half : 0.5);
            if (Math.abs(wx - ex) <= reach && Math.abs(wz - ez) <= reach) toDelete.push(key);
        });
        for (let i = 0; i < toDelete.length; i++) this.customEdits.delete(toDelete[i]);
        this._editIndexDirty = true;
    }

    getSerializedCustomEdits() {
        this.syncGridToCustomEdits();
        const obj = {};
        if (this.customEdits) {
            this.customEdits.forEach((val, key) => {
                // Copie (pas une référence !) sinon les snapshots undo/redo
                // sont corrompus par les modifications ultérieures des cellules
                obj[key] = Object.assign({}, val);
            });
        }
        return obj;
    }

    /**
     * Sauvegarde l'état actuel (config + modifications pinceau) pour Ctrl+Z
     */
    saveStateForUndo() {
        if (!this.undoStack) this.undoStack = [];
        const snapshot = {
            customEdits: this.getSerializedCustomEdits(),
            config: JSON.parse(JSON.stringify(this.config)),
            biomeRules: this.getSerializedBiomeRules()
        };
        this.undoStack.push(snapshot);
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack = []; // Efface la pile Redo sur une nouvelle action
    }

    undo() {
        if (!this.undoStack || this.undoStack.length === 0) return false;
        if (!this.redoStack) this.redoStack = [];

        const currentSnapshot = {
            biomeRules: this.getSerializedBiomeRules(),
            customEdits: this.getSerializedCustomEdits(),
            config: JSON.parse(JSON.stringify(this.config))
        };
        this.redoStack.push(currentSnapshot);

        const prevSnapshot = this.undoStack.pop();
        this.restoreSnapshot(prevSnapshot);
        return true;
    }

    redo() {
        if (!this.redoStack || this.redoStack.length === 0) return false;
        if (!this.undoStack) this.undoStack = [];

        const currentSnapshot = {
            biomeRules: this.getSerializedBiomeRules(),
            customEdits: this.getSerializedCustomEdits(),
            config: JSON.parse(JSON.stringify(this.config))
        };
        this.undoStack.push(currentSnapshot);

        const nextSnapshot = this.redoStack.pop();
        this.restoreSnapshot(nextSnapshot);
        return true;
    }


    getSerializedBiomeRules() {
        const out = {};
        for (let key in this.biomes) {
            if (this.biomes[key].rule) out[key] = JSON.parse(JSON.stringify(this.biomes[key].rule));
        }
        return out;
    }

    restoreSnapshot(snapshot) {
        if (!snapshot) return;
        Object.assign(this.config, snapshot.config);
        if (snapshot.biomeRules) {
            for (let key in snapshot.biomeRules) {
                if (this.biomes[key]) this.biomes[key].rule = JSON.parse(JSON.stringify(snapshot.biomeRules[key]));
            }
            if (window.uiManagerInstance && typeof window.uiManagerInstance.renderSettingsBiomes === 'function') {
                window.uiManagerInstance.renderSettingsBiomes();
            }
        }
        if (!this.customEdits) this.customEdits = new Map();
        this.customEdits.clear();
        if (snapshot.customEdits) {
            for (let key in snapshot.customEdits) {
                this.customEdits.set(key, snapshot.customEdits[key]);
            }
        }
        this._editIndexDirty = true;
        this.generateGrid(false); // MUST be false so old grid doesn't sync back and overwrite restored customEdits!
    }

    /**
     * Met à jour la fenêtre de chargement en fonction de ce qui est à l'écran (+ marge)
     */
    updateViewportFromScreen(minWX, maxWX, minWZ, maxWZ, forceUpdate = false) {
        // DEPRECIE : le mode "Focus Écran Dynamique" a été retiré. La grille est
        // toujours globale ; le détail à fort zoom vient des chunks 16x16 (2D).
        return false;
        // eslint-disable-next-line no-unreachable
        if (this.config.viewportMode !== 'dynamic') return false;
        if (!this.viewport) this.viewport = { minX: -350, maxX: 350, minZ: -350, maxZ: 350, active: true };
        
        // Marge ("un peu plus" que l'écran) pour un scrolling fluide sans rechargement constant
        const marginX = Math.max(50, (maxWX - minWX) * 0.25);
        const marginZ = Math.max(50, (maxWZ - minWZ) * 0.25);
        
        const newMinX = Math.max(-this.config.worldSizeX / 2, Math.floor(minWX - marginX));
        const newMaxX = Math.min(this.config.worldSizeX / 2, Math.ceil(maxWX + marginX));
        const newMinZ = Math.max(-this.config.worldSizeZ / 2, Math.floor(minWZ - marginZ));
        const newMaxZ = Math.min(this.config.worldSizeZ / 2, Math.ceil(maxWZ + marginZ));

        const currentCovered = (minWX >= this.viewport.minX && maxWX <= this.viewport.maxX && minWZ >= this.viewport.minZ && maxWZ <= this.viewport.maxZ);
        if (!forceUpdate && currentCovered && this.grid && this.grid.length > 0) {
            return false;
        }

        this.viewport.minX = newMinX;
        this.viewport.maxX = newMaxX;
        this.viewport.minZ = newMinZ;
        this.viewport.maxZ = newMaxZ;
        this.viewport.active = true;

        this.generateGrid(true);
        return true;
    }

    /**
     * Régénère la grille 2D (soit la zone visible écran + marge à résolution max 1:1, soit la grille globale)
     */

    /* ============================================================
       TACHE 3 (proposition, non implémentée volontairement) :
       Web Worker pour la régénération complète.

       Constat : generateGrid() est bornée (maxDimensionCells = 360, soit
       ~122k cellules, ~60-120 ms) et lit BEAUCOUP d'état partagé :
       this.customEdits (Map pouvant contenir 60-80k édits avec les presets
       importés), this.biomes (règles de hauteur), l'index spatial
       _editIndex, et this.perm (table de bruit).

       Un Worker "naïf" devrait sérialiser customEdits À CHAQUE régénération :
       le postMessage coûterait souvent plus cher que le calcul lui-même,
       et introduirait un état asynchrone (grille en retard d'une frame,
       undo/redo et export à synchroniser). Rapport coût/bénéfice défavorable.

       Chemin recommandé si le besoin apparaît (grilles > 512x512) :
       1. Ne déporter QUE le cas "régénération complète sans édits"
          (bouton Regénérer / changement de seed avec customEdits vide) :
          le Worker ne reçoit que config + seed (quelques octets), calcule
          fbmTerrain + assignBiomeProcedural par cellule, et renvoie deux
          Transferable (Float32Array heights, Uint8Array biomeIds) SANS copie.
       2. Garder le chemin synchrone actuel pour tout le reste (pinceau,
          presets, viewport dynamique), qui doit rester réactif.
       3. Le fbm est pur (perm dérivée du seed) : le Worker peut recalculer
          sa propre table à partir du seed, aucun état à partager.
       ============================================================ */
    generateGrid(preserveCustom = false) {
        this.initPermutationTable(this.config.seed);
        if (!this.customEdits) this.customEdits = new Map();
        if (!this.viewport) this.viewport = { minX: -350, maxX: 350, minZ: -350, maxZ: 350, active: true };

        if (preserveCustom) {
            this.syncGridToCustomEdits();
        }

        let startWorldX, startWorldZ, stepX, stepZ, resX, resZ;

        // MODE UNIQUE : grille globale. Migration silencieuse des anciens
        // presets/snapshots qui portaient encore viewportMode: 'dynamic'.
        if (this.config.viewportMode !== 'global') this.config.viewportMode = 'global';
        // v2.5 : qualité UNIQUE maximale (sélecteur "Grille de Prévisu" retiré)
        if (!this.config.gridResolution || this.config.gridResolution < 256) this.config.gridResolution = 256;
        {
            const res = this.config.gridResolution || 256;
            resX = res;
            resZ = res;
            stepX = this.config.worldSizeX / res;
            stepZ = this.config.worldSizeZ / res;
            startWorldX = -this.config.worldSizeX / 2;
            startWorldZ = -this.config.worldSizeZ / 2;
        }

        // La grille change (seed/config/édits) : les chunks de détail sont périmés
        this.invalidateDetailChunks();

        this.currentGridMeta = { startWorldX, startWorldZ, stepX, stepZ, resX, resZ };

        let newGrid = [];
        let minH = Infinity;
        let maxH = -Infinity;
        let totalH = 0;
        let counts = {};
        for (let k in this.biomes) counts[k] = 0;

        for (let gx = 0; gx < resX; gx++) {
            newGrid[gx] = [];
            let worldX = startWorldX + (gx + 0.5) * stepX;

            for (let gz = 0; gz < resZ; gz++) {
                let worldZ = startWorldZ + (gz + 0.5) * stepZ;

                let height, biome, isCustomHeight = false, isCustomBiome = false;

                const edit = this.getCustomEdit(worldX, worldZ, Math.max(stepX, stepZ) / 2);
                if (edit) {
                    height = edit.height !== undefined ? Math.round(this.getInterpolatedEditHeight(worldX, worldZ, edit.height)) : Math.round(this.fbmTerrain(worldX, worldZ));
                    biome = edit.biome || this.assignBiomeProcedural(height, worldX, worldZ);
                    isCustomHeight = edit.height !== undefined;
                    isCustomBiome = edit.biome !== undefined;
                    // REGLE PRIORITAIRE : une règle verrouillée écrase même la peinture existante
                    const lockedBy = this.isBiomePaintBlocked(height);
                    if (lockedBy && biome !== lockedBy) { biome = lockedBy; isCustomBiome = false; }
                } else {
                    height = Math.round(this.fbmTerrain(worldX, worldZ));
                    height = Math.max(this.config.minHeight, Math.min(this.config.maxHeight, height));
                    biome = this.assignBiomeProcedural(height, worldX, worldZ);
                    if (!this.biomes[biome]) biome = this.config.defaultBiome || 'plain';
                }

                newGrid[gx][gz] = {
                    height: height,
                    biome: biome,
                    worldX: worldX,
                    worldZ: worldZ,
                    isCustomHeight: isCustomHeight,
                    isCustomBiome: isCustomBiome
                };

                if (height < minH) minH = height;
                if (height > maxH) maxH = height;
                totalH += height;
                counts[biome] = (counts[biome] || 0) + 1;
            }
        }

        this.grid = newGrid;
        this.stats = {
            minHeight: minH === Infinity ? 0 : minH,
            maxHeight: maxH === -Infinity ? 0 : maxH,
            avgHeight: Math.round(totalH / Math.max(1, (resX * resZ))),
            biomeCounts: counts
        };
    }


    /* ============================================================
       CHUNKS DE DÉTAIL 16x16 (remplaçant du "Focus Écran Dynamique")
       Quand le monde est grand (>= ~500 blocs), la grille globale est
       grossière (1 cellule = plusieurs blocs). Au zoom, la carte 2D
       demande des chunks de 16x16 BLOCS calculés à la vraie résolution
       1:1 via getDetailChunk(). Seuls les chunks visibles à l'écran
       sont calculés, et un cache LRU évite de recalculer en pan/zoom.
       ============================================================ */
    detailChunkSize() { return 16; }

    /** Détail utile seulement si une cellule de grille couvre > 1.5 bloc */
    needsDetailChunks() {
        const m = this.currentGridMeta;
        return !!(m && Math.max(m.stepX, m.stepZ) > 1.5);
    }

    invalidateDetailChunks() {
        this._detailChunks = new Map();
        this._detailOrder = [];
    }

    /**
     * Retourne le chunk 16x16 couvrant les blocs [cx*16, cx*16+15] x [cz*16, ...]
     * en coordonnées MONDE (origine du monde = -worldSize/2).
     * { heights: Float32Array(256), biomes: Array(256), x0, z0 } ou null si hors monde.
     */
    getDetailChunk(cx, cz) {
        const S = this.detailChunkSize();
        const halfX = this.config.worldSizeX / 2, halfZ = this.config.worldSizeZ / 2;
        const x0 = cx * S, z0 = cz * S;
        if (x0 >= halfX || z0 >= halfZ || x0 + S <= -halfX || z0 + S <= -halfZ) return null;

        if (!this._detailChunks) this.invalidateDetailChunks();
        const key = cx + ',' + cz;
        const cached = this._detailChunks.get(key);
        if (cached) return cached;

        const heights = new Float32Array(S * S);
        const biomes = new Array(S * S);
        const m = this.currentGridMeta;
        for (let lz = 0; lz < S; lz++) {
            for (let lx = 0; lx < S; lx++) {
                const wx = x0 + lx + 0.5, wz = z0 + lz + 0.5;
                let h, bkey;
                const edit = this.getCustomEdit(wx, wz, 0.5);
                if (edit) {
                    const hFb = edit.height !== undefined ? edit.height : Math.round(this.fbmTerrain(wx, wz));
                    h = Math.round(this.getInterpolatedEditHeight(wx, wz, hFb));
                    bkey = edit.biome || this.assignBiomeProcedural(h, wx, wz);
                    const lockedBy = this.isBiomePaintBlocked(h);
                    if (lockedBy) bkey = lockedBy;
                } else if (m && this.grid && this.grid.length) {
                    // Même échantillonnage bilinéaire + micro-bruit que l'export :
                    // le chunk zoomé montre EXACTEMENT ce qui sera exporté.
                    // BIOME : dithering spatial identique à l'export (rayon 3 blocs)
                    // pour des frontières organiques 1:1 au lieu de pavés grossiers
                    const hashB = Math.abs((((wx * 374761393 + wz * 668265263) | 0) ^ (((wx * 374761393 + wz * 668265263) | 0) >> 13)) | 0);
                    const jx = (hashB % 7) - 3;
                    const jz = (((hashB / 31) | 0) % 7) - 3;
                    const gx = Math.max(0, Math.min(m.resX - 1, Math.floor((wx + jx - m.startWorldX) / m.stepX)));
                    const gz = Math.max(0, Math.min(m.resZ - 1, Math.floor((wz + jz - m.startWorldZ) / m.stepZ)));
                    const fx = (wx - m.startWorldX) / m.stepX - 0.5;
                    const fz = (wz - m.startWorldZ) / m.stepZ - 0.5;
                    const x0i = Math.max(0, Math.min(m.resX - 1, Math.floor(fx)));
                    const z0i = Math.max(0, Math.min(m.resZ - 1, Math.floor(fz)));
                    const x1i = Math.min(m.resX - 1, x0i + 1);
                    const z1i = Math.min(m.resZ - 1, z0i + 1);
                    const tx = Math.max(0, Math.min(1, fx - x0i));
                    const tz = Math.max(0, Math.min(1, fz - z0i));
                    const hInterp =
                        this.grid[x0i][z0i].height * (1 - tx) * (1 - tz) + this.grid[x1i][z0i].height * tx * (1 - tz) +
                        this.grid[x0i][z1i].height * (1 - tx) * tz + this.grid[x1i][z1i].height * tx * tz;
                    const hDetail = (this.valueNoise2D(wx * 0.35 + 7.3, wz * 0.35 + 2.1) - 0.5) * 1.6;
                    h = Math.round(hInterp + hDetail);
                    bkey = this.grid[gx][gz].biome || 'plain';
                } else {
                    h = Math.round(this.fbmTerrain(wx, wz));
                    h = Math.max(this.config.minHeight, Math.min(this.config.maxHeight, h));
                    bkey = this.assignBiomeProcedural(h, wx, wz);
                }
                const i = lz * S + lx;
                heights[i] = h;
                biomes[i] = bkey;
            }
        }
        const chunk = { heights, biomes, x0, z0 };
        this._detailChunks.set(key, chunk);
        this._detailOrder.push(key);
        // LRU : le cap doit DÉPASSER le pire rayon de chargement 3D
        // ((2*17+1)^2 = 1225 chunks), sinon les chunks visibles s'évincent
        // mutuellement en boucle et des zones ne se remplissent jamais.
        // v2.5 : élargi pour la fenêtre 2D 1:1 (seuil 1 px/bloc)
        while (this._detailOrder.length > 8192) {
            const oldKey = this._detailOrder.shift();
            this._detailChunks.delete(oldKey);
        }
        return chunk;
    }

    /** Invalidation ciblée après un coup de pinceau (zone monde en blocs) */
    invalidateDetailChunksInRegion(wxMin, wxMax, wzMin, wzMax) {
        if (!this._detailChunks || this._detailChunks.size === 0) return;
        const S = this.detailChunkSize();
        const cx0 = Math.floor(wxMin / S), cx1 = Math.floor(wxMax / S);
        const cz0 = Math.floor(wzMin / S), cz1 = Math.floor(wzMax / S);
        for (let cx = cx0; cx <= cx1; cx++) {
            for (let cz = cz0; cz <= cz1; cz++) {
                const key = cx + ',' + cz;
                if (this._detailChunks.delete(key)) {
                    const idx = this._detailOrder.indexOf(key);
                    if (idx !== -1) this._detailOrder.splice(idx, 1);
                }
            }
        }
    }


    /* ============================================================
       TAMPONS DE TERRAIN : sphère (dôme/cratère) et pavé (plateau).
       - shape : 'sphere' | 'box'
       - sizeX/sizeZ : demi-largeurs en cellules ; heightAmp : hauteur
         (+ = bosse, - = creux) ; biome optionnel appliqué sur l'empreinte.
       ============================================================ */
    applyStamp(centerGx, centerGz, shape, sizeX, sizeZ, heightAmp, biome) {
        if (!this.grid || !this.grid.length) return false;
        const resX = this.grid.length;
        const resZ = this.grid[0] ? this.grid[0].length : 0;
        if (centerGx < 0 || centerGx >= resX || centerGz < 0 || centerGz >= resZ) return false;
        const meta = this.currentGridMeta;
        const stepX0 = meta ? meta.stepX : 1;
        const stepZ0 = meta ? meta.stepZ : 1;

        // v2.5 : TAMPONS 1:1. La forme est écrite en points de peinture à la
        // résolution des BLOCS (1 point / 1-2 blocs), plus par cellules de
        // grille. Avant : l'empreinte était arrondie à la cellule (15.6 blocs
        // sur un monde 4000) -> mesas géantes, tours isolées et falaises à
        // trous quand on changeait la taille de la forme.
        const cell0 = this.grid[centerGx][centerGz];
        const wcx = Math.round(cell0.worldX), wcz = Math.round(cell0.worldZ);
        const rx = Math.max(1, Math.round(sizeX));
        const rz = Math.max(1, Math.round(sizeZ));
        const sp = Math.max(rx, rz) > 40 ? 2 : 1; // espacement des points 1:1
        const half = sp / 2;
        const minWx = meta ? meta.startWorldX : -Infinity;
        const maxWx = meta ? meta.startWorldX + meta.resX * meta.stepX : Infinity;
        const minWz = meta ? meta.startWorldZ : -Infinity;
        const maxWz = meta ? meta.startWorldZ + meta.resZ * meta.stepZ : Infinity;
        const shapeF = (nx, nz) => {
            if (shape === 'sphere') {
                const d2 = nx * nx + nz * nz;
                return d2 > 1 ? -1 : Math.sqrt(1 - d2); // calotte sphérique
            }
            // pavé : plateau plein avec bord adouci sur ~15%
            const edge = Math.max(Math.abs(nx), Math.abs(nz));
            return edge > 1 ? -1 : (edge < 0.85 ? 1 : (1 - edge) / 0.15);
        };

        // Passe 1 : forme + hauteur de base de chaque point AVANT toute écriture
        // (écrire en échantillonnant au fil de l'eau fausserait les points suivants)
        const pts = [];
        for (let dx = -rx; dx <= rx; dx += sp) {
            for (let dz = -rz; dz <= rz; dz += sp) {
                const f = shapeF(dx / rx, dz / rz);
                if (f < 0) continue;
                const wx = wcx + dx, wz = wcz + dz;
                if (wx < minWx || wx > maxWx || wz < minWz || wz > maxWz) continue;
                pts.push({ wx: wx, wz: wz, f: f, h0: this.sampleWorldHeight(wx, wz) });
            }
        }
        if (!pts.length) return false;

        // Passe 2 : balayage des ANCIENS points recouverts par l'empreinte
        // (sinon ils resteraient mélangés aux nouveaux points 1:1 et l'IDW
        // créerait des creux/bosses parasites dans la forme)
        const toDelete = [];
        this.customEdits.forEach((v, k) => {
            const ci = k.indexOf(',');
            const ex = +k.slice(0, ci), ez = +k.slice(ci + 1);
            if (shapeF((ex - wcx) / rx, (ez - wcz) / rz) >= 0) toDelete.push(k);
        });
        for (let i = 0; i < toDelete.length; i++) this.customEdits.delete(toDelete[i]);
        if (toDelete.length) this._editIndexDirty = true;

        // Passe 3 : écriture des points 1:1
        let modified = false;
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            let hNew = null;
            if (heightAmp) {
                hNew = Math.max(this.config.minHeight,
                    Math.min(this.config.maxHeight, p.h0 + heightAmp * p.f));
            }
            let bNew = null;
            if (biome && this.biomes[biome]) {
                const lockedBy = this.isBiomePaintBlocked(hNew !== null ? hNew : p.h0);
                if (!lockedBy || lockedBy === biome) bNew = biome;
            }
            if (hNew === null && bNew === null) continue;
            this.setCustomEdit(p.wx, p.wz, hNew, bNew, half);
            modified = true;
        }
        if (!modified) return false;

        // Passe 4 : refléter la forme sur la grille grossière (aperçu 2D/3D).
        // IMPORTANT : PAS de flag isCustomHeight/isCustomBiome ici — le tampon
        // vit entièrement dans customEdits (points 1:1). Marquer les cellules
        // les ferait re-synchroniser en points GROSSIERS (empreinte 15.6 blocs)
        // par syncGridToCustomEdits, qui balaieraient les points fins -> trous.
        const cgxMin = Math.max(0, centerGx - Math.ceil(rx / stepX0) - 1);
        const cgxMax = Math.min(resX - 1, centerGx + Math.ceil(rx / stepX0) + 1);
        const cgzMin = Math.max(0, centerGz - Math.ceil(rz / stepZ0) - 1);
        const cgzMax = Math.min(resZ - 1, centerGz + Math.ceil(rz / stepZ0) + 1);
        for (let gx = cgxMin; gx <= cgxMax; gx++) {
            for (let gz = cgzMin; gz <= cgzMax; gz++) {
                const cell = this.grid[gx][gz];
                const f = shapeF((cell.worldX - wcx) / rx, (cell.worldZ - wcz) / rz);
                if (f < 0) continue;
                // La cellule est désormais pilotée par les points 1:1 du tampon :
                // ses anciens flags custom (peinture recouverte) sont périmés.
                cell.isCustomHeight = false;
                cell.isCustomBiome = false;
                if (heightAmp) {
                    cell.height = Math.round(this.sampleWorldHeight(cell.worldX, cell.worldZ));
                }
                if (biome && this.biomes[biome]) {
                    const lockedBy = this.isBiomePaintBlocked(cell.height);
                    if (!lockedBy || lockedBy === biome) cell.biome = biome;
                }
            }
        }

        this._statsDirty = true;
        this.lastBrushRegion = { gxMin: cgxMin, gxMax: cgxMax, gzMin: cgzMin, gzMax: cgzMax };
        if (this._detailChunks && this._detailChunks.size) {
            this.invalidateDetailChunksInRegion(wcx - rx - 2, wcx + rx + 2, wcz - rz - 2, wcz + rz + 2);
        }
        return true;
    }

    /**
     * Hauteur 1:1 du monde en (wx, wz) : IDW des points de peinture si la
     * zone est peinte, sinon interpolation bilinéaire de la grille (même
     * logique que getDetailChunk et l'export).
     */
    sampleWorldHeight(wx, wz) {
        const edit = this.getCustomEdit(wx, wz, 0.5);
        if (edit) {
            const hFb = edit.height !== undefined ? edit.height : Math.round(this.fbmTerrain(wx, wz));
            return this.getInterpolatedEditHeight(wx, wz, hFb);
        }
        const m = this.currentGridMeta;
        if (m && this.grid && this.grid.length) {
            const fx = (wx - m.startWorldX) / m.stepX - 0.5;
            const fz = (wz - m.startWorldZ) / m.stepZ - 0.5;
            const x0i = Math.max(0, Math.min(m.resX - 1, Math.floor(fx)));
            const z0i = Math.max(0, Math.min(m.resZ - 1, Math.floor(fz)));
            const x1i = Math.min(m.resX - 1, x0i + 1);
            const z1i = Math.min(m.resZ - 1, z0i + 1);
            const tx = Math.max(0, Math.min(1, fx - x0i));
            const tz = Math.max(0, Math.min(1, fz - z0i));
            return this.grid[x0i][z0i].height * (1 - tx) * (1 - tz) + this.grid[x1i][z0i].height * tx * (1 - tz) +
                   this.grid[x0i][z1i].height * (1 - tx) * tz + this.grid[x1i][z1i].height * tx * tz;
        }
        return this.fbmTerrain(wx, wz);
    }

    /* ============================================================
       BIOMES PERSONNALISÉS (palettes de l'utilisateur)
       Ajout/édition/suppression + persistance localStorage.
       ============================================================ */
    addCustomBiome(key, name, color, blocks) {
        if (!key || this.biomes[key]) return false;
        this.biomes[key] = {
            name: name || key, color: color || '#ffffff',
            blocks: (blocks && blocks.length) ? blocks : ['Grass Block'],
            minHeight: 0, maxHeight: 400, custom: true,
            rule: { active: false, yMin: 0, yMax: 400, locked: false }
        };
        this.saveCustomBiomes();
        return true;
    }

    updateCustomBiome(key, name, color, blocks) {
        const b = this.biomes[key];
        if (!b) return false;
        if (name) b.name = name;
        if (color) b.color = color;
        if (blocks && blocks.length) b.blocks = blocks;
        this.saveCustomBiomes();
        return true;
    }

    removeCustomBiome(key) {
        const b = this.biomes[key];
        if (!b || !b.custom) return false; // seuls les biomes utilisateur sont supprimables
        delete this.biomes[key];
        // Les cellules peintes avec ce biome retombent sur le biome par défaut
        if (this.grid) {
            for (let gx = 0; gx < this.grid.length; gx++) {
                for (let gz = 0; gz < this.grid[gx].length; gz++) {
                    if (this.grid[gx][gz].biome === key) this.grid[gx][gz].biome = this.config.defaultBiome || 'plain';
                }
            }
        }
        if (this.customEdits) {
            this.customEdits.forEach((val) => { if (val.biome === key) delete val.biome; });
            this._editIndexDirty = true;
        }
        this.invalidateDetailChunks();
        this.saveCustomBiomes();
        return true;
    }

    saveCustomBiomes() {
        try {
            const out = {};
            for (let k in this.biomes) if (this.biomes[k].custom) out[k] = this.biomes[k];
            window.safeStorage.setItem('bloxd_custom_biomes', JSON.stringify(out));
        } catch (e) {}
    }

    loadCustomBiomes() {
        try {
            const saved = JSON.parse(window.safeStorage.getItem('bloxd_custom_biomes') || '{}');
            for (let k in saved) {
                if (!this.biomes[k]) { saved[k].custom = true; this.biomes[k] = saved[k]; }
            }
        } catch (e) {}
    }

    /**
     * Applique l'outil d'édition pinceau sur une position grille (centerGx, centerGz)
     */
    applyBrush(centerGx, centerGz, tool, radius, intensity, activeBiome, firstClickH = null) {
        if (!this.grid || !this.grid.length) return false;
        const resX = this.grid.length;
        const resZ = this.grid[0] ? this.grid[0].length : 0;
        let modified = false;

        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                let dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > radius) continue;

                let gx = centerGx + dx;
                let gz = centerGz + dz;
                if (gx < 0 || gx >= resX || gz < 0 || gz >= resZ) continue;

                let cell = this.grid[gx][gz];
                let falloff = 1.0 - (dist / (radius + 1));
                let step = intensity * falloff * 0.5;

                if (tool === 'biome') {
                    // REGLE PRIORITAIRE : si une règle "locked" protège cette hauteur,
                    // le pinceau biome ne peut pas peindre par-dessus
                    const lockedBy = this.isBiomePaintBlocked(cell.height);
                    if (lockedBy && lockedBy !== activeBiome) continue;
                    cell.biome = activeBiome;
                    cell.isCustomBiome = true;
                    modified = true;
                } else if (tool === 'raise') {
                    cell.height = Math.min(this.config.maxHeight, cell.height + step);
                    cell.isCustomHeight = true;
                    modified = true;
                } else if (tool === 'lower') {
                    cell.height = Math.max(this.config.minHeight, cell.height - step);
                    cell.isCustomHeight = true;
                    modified = true;
                } else if (tool === 'flatten' && firstClickH !== null) {
                    cell.height = cell.height + (firstClickH - cell.height) * falloff;
                    cell.isCustomHeight = true;
                    modified = true;
                } else if (tool === 'eraser') {
                    let procH = this.fbmTerrain(cell.worldX, cell.worldZ);
                    procH = Math.round(Math.max(this.config.minHeight, Math.min(this.config.maxHeight, procH)));
                    cell.height = procH;
                    cell.biome = this.assignBiomeProcedural(procH, cell.worldX, cell.worldZ);
                    cell.isCustomHeight = false;
                    cell.isCustomBiome = false;
                    modified = true;
                    this.removeCustomEdit(cell.worldX, cell.worldZ);
                }

                if (tool !== 'eraser' && modified) {
                    this.setCustomEdit(cell.worldX, cell.worldZ, cell.isCustomHeight ? cell.height : null, cell.isCustomBiome ? cell.biome : null);
                }
            }
        }

        // Cas spécial : Lissage (smooth)
        if (tool === 'smooth') {
            let tempH = [];
            for (let gx = Math.max(0, centerGx - radius); gx <= Math.min(resX - 1, centerGx + radius); gx++) {
                tempH[gx] = [];
                for (let gz = Math.max(0, centerGz - radius); gz <= Math.min(resZ - 1, centerGz + radius); gz++) {
                    let sum = 0, cnt = 0;
                    for (let nx = -1; nx <= 1; nx++) {
                        for (let nz = -1; nz <= 1; nz++) {
                            let mx = gx + nx, mz = gz + nz;
                            if (mx >= 0 && mx < resX && mz >= 0 && mz < resZ) {
                                sum += this.grid[mx][mz].height;
                                cnt++;
                            }
                        }
                    }
                    tempH[gx][gz] = sum / cnt;
                }
            }
            for (let gx = Math.max(0, centerGx - radius); gx <= Math.min(resX - 1, centerGx + radius); gx++) {
                for (let gz = Math.max(0, centerGz - radius); gz <= Math.min(resZ - 1, centerGz + radius); gz++) {
                    let dist = Math.sqrt((gx - centerGx) ** 2 + (gz - centerGz) ** 2);
                    if (dist <= radius) {
                        let cell = this.grid[gx][gz];
                        cell.height = Math.round(tempH[gx][gz]);
                        cell.isCustomHeight = true;
                        modified = true;
                        this.setCustomEdit(cell.worldX, cell.worldZ, cell.height, cell.isCustomBiome ? cell.biome : null);
                    }
                }
            }
        }

        if (modified) {
            // PERF DESSIN : updateStats parcourt toute la grille (65k cellules en 256x256)
            // -> différé et throttlé au lieu d'être exécuté à chaque événement souris
            this._statsDirty = true;
            if (!this._lastStatsTime || Date.now() - this._lastStatsTime > 300) {
                this._lastStatsTime = Date.now();
                this._statsDirty = false;
                this.updateStats();
            }
            // TACHE 2 : bounding box de la zone réellement touchée par ce coup de
            // pinceau (en coordonnées grille), consommée par Map3D.updateTerrainRegion
            // pour ne recalculer que les vertices concernés au lieu de tout le mesh.
            this.lastBrushRegion = {
                gxMin: Math.max(0, centerGx - radius),
                gxMax: Math.min(resX - 1, centerGx + radius),
                gzMin: Math.max(0, centerGz - radius),
                gzMax: Math.min(resZ - 1, centerGz + radius)
            };
            // Invalide les chunks de détail couvrant la zone peinte (coords monde)
            const mMeta = this.currentGridMeta;
            if (mMeta && this._detailChunks && this._detailChunks.size) {
                const wx0 = mMeta.startWorldX + this.lastBrushRegion.gxMin * mMeta.stepX;
                const wx1 = mMeta.startWorldX + (this.lastBrushRegion.gxMax + 1) * mMeta.stepX;
                const wz0 = mMeta.startWorldZ + this.lastBrushRegion.gzMin * mMeta.stepZ;
                const wz1 = mMeta.startWorldZ + (this.lastBrushRegion.gzMax + 1) * mMeta.stepZ;
                this.invalidateDetailChunksInRegion(wx0 - 2, wx1 + 2, wz0 - 2, wz1 + 2);
            }
        }
        return modified;
    }

    /**
     * Recalcule les statistiques à la suite d'une modification
     */
    updateStats() {
        let minH = Infinity, maxH = -Infinity, totalH = 0;
        let counts = {};
        for (let k in this.biomes) counts[k] = 0;
        const resX = this.grid && this.grid.length ? this.grid.length : 0;
        const resZ = resX && this.grid[0] ? this.grid[0].length : 0;

        for (let gx = 0; gx < resX; gx++) {
            for (let gz = 0; gz < resZ; gz++) {
                let cell = this.grid[gx][gz];
                if (cell.height < minH) minH = cell.height;
                if (cell.height > maxH) maxH = cell.height;
                totalH += cell.height;
                counts[cell.biome] = (counts[cell.biome] || 0) + 1;
            }
        }
        this.stats.minHeight = Math.round(minH);
        this.stats.maxHeight = Math.round(maxH);
        this.stats.avgHeight = Math.round(totalH / Math.max(1, resX * resZ));
        this.stats.biomeCounts = counts;
    }

    /**
     * Charge un preset de configuration
     */
    loadPreset(presetKey) {
        const p = this.presets[presetKey];
        if (!p) return;
        Object.assign(this.config, p.config);
        if (p.biomes) {
            this.biomes = JSON.parse(JSON.stringify(p.biomes));
        }
        if (!this.customEdits) this.customEdits = new Map();
        this.customEdits.clear();
        if (p.customEdits) {
            if (typeof p.customEdits === 'object') {
                for (let key in p.customEdits) {
                    this.customEdits.set(key, p.customEdits[key]);
                }
            }
        }
        this._editIndexDirty = true;
        // false : ne PAS resynchroniser l'ancienne grille par-dessus les édits du preset !
        this.generateGrid(false);
    }

    /**
     * Génère un script Python sur-mesure pour créer le fichier .bloxdschem autonome
     */
    exportPythonScript() {
        this.syncGridToCustomEdits();
        let editsPyStr = '{\n';
        let count = 0;
        if (this.customEdits) {
            this.customEdits.forEach((val, key) => {
                if (count < 25000) {
                    editsPyStr += `    "${key}": (${Math.round(val.height)}, "${val.biome || 'plain'}"),\n`;
                    count++;
                }
            });
        }
        editsPyStr += '}';

        // Collecte les biomes actifs
        let biomesPyStr = '{\n';
        for (let key in this.biomes) {
            let b = this.biomes[key];
            let blocksStr = b.blocks.map(bl => `"${bl}"`).join(', ');
            biomesPyStr += `    "${key}": [${blocksStr}],\n`;
        }
        biomesPyStr += '}';

        return `#!/usr/bin/env python3
"""
Générateur de terrain Bloxd.io personnalisé (.bloxdschem)
Généré par Bloxd Terrain Editor (Web App)
Date: ${new Date().toISOString().split('T')[0]}

Ce script utilise numpy et la spécification Avro M2B pour générer un fichier .bloxdschem
compatible avec Bloxd.io via la commande en jeu //schematic load.
"""

import os
import sys
import json
import math
import numpy as np
from bloxd_format import BloxdSchemWriter

# ============================================================
# PARAMÈTRES DU MONDE CONFIGURÉS
# ============================================================
SEED = ${this.config.seed}
WORLD_SIZE_X = ${this.config.worldSizeX}
WORLD_SIZE_Z = ${this.config.worldSizeZ}
WORLD_MIN_X = -WORLD_SIZE_X // 2
WORLD_MIN_Z = -WORLD_SIZE_Z // 2

BASE_Y = ${this.config.baseY}
SEA_Y = ${this.config.seaLevel}
MIN_HEIGHT = ${this.config.minHeight}
MAX_HEIGHT = ${this.config.maxHeight}

NOISE_SCALE = ${this.config.noiseScale}
TERRAIN_INTENSITY = ${this.config.terrainIntensity}
ROUGHNESS = ${this.config.roughness}

FILL_WATER = ${this.config.showWater ? 'True' : 'False'}
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
        "Dark Red Brick": 130, "Dark Red Stone": 131, "Smooth Red Sandstone": 475, "Red Sand": 650, "Magma": 471, "Cherry Log": 1222,
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

biomes = ${biomesPyStr}
CUSTOM_EDITS = ${editsPyStr}

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

                for lx in range(CHUNK):
                    for lz in range(CHUNK):
                        kstr = f"{int(Xi[lx,lz])},{int(Zi[lx,lz])}"
                        if kstr in CUSTOM_EDITS:
                            topY[lx, lz] = int(CUSTOM_EDITS[kstr][0])
                            bname = CUSTOM_EDITS[kstr][1]
                            if bname in biome_index:
                                main_biome[lx, lz] = biome_index[bname]

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
                        rle = rle_encode_vectorized(np.zeros(CHUNK * CHUNK * CHUNK, dtype=np.int32))
                        writer.add_chunk(tx, cy - chunk_y_lo, tz, rle)
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
`;
    }

    getBlockId(name) {
        if (!this.nameToIdMap) {
            this.nameToIdMap = {
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
        "Dark Red Brick": 130, "Dark Red Stone": 131, "Smooth Red Sandstone": 475, "Red Sand": 650, "Magma": 471, "Cherry Log": 1222,
                "Packed Snow": 8, "Overgrown Jungle Grass Block": 4, "White Chalk": 97
            };
        }
        if (this.nameToIdMap[name] !== undefined) return this.nameToIdMap[name];
        return 4; // Grass Block fallback
    }

    exportSchematicBinary() {
        const uvarint = (n) => { let out = []; n = Math.floor(n); while (true) { let b = n & 0x7F; n = Math.floor(n / 128); if (n > 0) out.push(b | 0x80); else { out.push(b); break; } } return new Uint8Array(out); };
        const avroInt = (n) => { n = Math.floor(n); let zz = (n << 1) ^ (n >> 31); if (n >= 0) zz = n * 2; else zz = (-n * 2) - 1; return uvarint(zz); };
        const avroString = (s) => { const enc = new TextEncoder().encode(s); const lenBuf = avroInt(enc.length); let res = new Uint8Array(lenBuf.length + enc.length); res.set(lenBuf, 0); res.set(enc, lenBuf.length); return res; };
        const avroBytes = (b) => { const lenBuf = avroInt(b.length); let res = new Uint8Array(lenBuf.length + b.length); res.set(lenBuf, 0); res.set(b, lenBuf.length); return res; };
        const rleEncodeBlocks = (arr) => {
            const n = arr.length; if (n === 0) return new Uint8Array(0);
            let out = []; let currId = arr[0]; let currAmt = 1;
            for (let i = 1; i <= n; i++) {
                let bid = (i < n) ? arr[i] : null;
                if (bid === currId) currAmt++;
                else {
                    let ab = uvarint(currAmt); for (let k = 0; k < ab.length; k++) out.push(ab[k]);
                    let ib = uvarint(currId); for (let k = 0; k < ib.length; k++) out.push(ib[k]);
                    currAmt = 1; currId = bid;
                }
            }
            return new Uint8Array(out);
        };

        class BloxdSchemWriterJS {
            constructor(name, sizeX, sizeY, sizeZ, posX = 0, posY = 0, posZ = 0) {
                this.buffers = []; this.chunkCount = 0; this.blockBuffer = []; this.flushEvery = 512;
                this.buffers.push(new Uint8Array([0, 0, 0, 0])); this.buffers.push(avroString(name));
                this.buffers.push(avroInt(posX)); this.buffers.push(avroInt(posY)); this.buffers.push(avroInt(posZ));
                this.buffers.push(avroInt(sizeX)); this.buffers.push(avroInt(sizeY)); this.buffers.push(avroInt(sizeZ));
            }
            addChunk(cx, cy, cz, rleBytes) {
                this.blockBuffer.push(avroInt(cx)); this.blockBuffer.push(avroInt(cy)); this.blockBuffer.push(avroInt(cz));
                this.blockBuffer.push(avroBytes(rleBytes)); this.chunkCount++;
                if (this.chunkCount >= this.flushEvery) this.flushBlock();
            }
            flushBlock() {
                if (this.chunkCount === 0) return;
                this.buffers.push(avroInt(this.chunkCount));
                for (let b of this.blockBuffer) this.buffers.push(b);
                this.blockBuffer = []; this.chunkCount = 0;
            }
            finish() {
                this.flushBlock(); this.buffers.push(avroInt(0));
                let totalLen = 0; for (let b of this.buffers) totalLen += b.length;
                let res = new Uint8Array(totalLen); let offset = 0;
                for (let b of this.buffers) { res.set(b, offset); offset += b.length; }
                return res;
            }
        }

        const CHUNK = 32;
        const exportSizeX = Math.min(this.config.worldSizeX || 640, 2048);
        const exportSizeZ = Math.min(this.config.worldSizeZ || 640, 2048);
        const tilesX = Math.max(1, Math.floor(exportSizeX / CHUNK));
        const tilesZ = Math.max(1, Math.floor(exportSizeZ / CHUNK));
        // IMPORTANT : Bloxd.io ignore/coupe silencieusement tout ce qui est en coordonnées
        // négatives lors du //schematic load. Centrer le terrain sur l'origine (0,0) faisait
        // qu'environ la moitié de la zone (tout le côté négatif) disparaissait au chargement
        // (c'est la cause exacte du "seulement 48x48" puis "64x64" au lieu de la zone complète).
        // On place donc tout le terrain en coordonnées positives, à partir de (0, 0).
        const minX = 0;
        const minZ = 0;
        const airRle = rleEncodeBlocks(new Int32Array(32768));

        const gridRes = this.config.gridResolution || 96;
        const cellW = (this.config.worldSizeX || 4000) / gridRes;
        const cellZ = (this.config.worldSizeZ || 4000) / gridRes;
        const halfWorldX = (this.config.worldSizeX || 4000) / 2;
        const halfWorldZ = (this.config.worldSizeZ || 4000) / 2;

        const stoneBlockId = this.getBlockId("Stone");
        const dirtBlockId = this.getBlockId("Dirt");
        const waterBlockId = this.getBlockId("Water");

        // Hachage 3D rapide pour le texturing des pentes et profondeurs
        const get3DHash = (x, y, z) => {
            let h = (x * 374761393 + y * 1274126177 + z * 668265263) ^ ((x * 374761393 + y * 1274126177 + z * 668265263) >> 13);
            return Math.abs((h * 2147483647) ^ (h >> 16));
        };

        const getSubsurfaceId = (biomeKey, wx, wy, wz) => {
            if (biomeKey === "plain" || biomeKey === "forest") return dirtBlockId; // "Mais on garde la terre sous les herbes"
            const h = get3DHash(wx, wy, wz);
            if (biomeKey === "sand") {
                const pal = ["Sand", "Smooth Sandstone"];
                return this.getBlockId(pal[h % pal.length]);
            }
            if (biomeKey === "snow") {
                const pal = ["Stone", "Smooth Stone", "Diorite", "Andesite"];
                return this.getBlockId(pal[h % pal.length]);
            }
            if (biomeKey === "mountain") {
                const pal = ["Smooth Stone", "Stone", "Stone Bricks", "Cracked Stone Bricks"];
                return this.getBlockId(pal[h % pal.length]);
            }
            if (biomeKey === "desert") {
                const pal = ["Baked Clay", "Orange Baked Clay", "Smooth Red Sandstone", "Red Sand"];
                return this.getBlockId(pal[h % pal.length]);
            }
            if (biomeKey === "volcano") {
                const pal = ["Dark Red Stone", "Dark Red Brick", "Magma"];
                return this.getBlockId(pal[h % pal.length]);
            }
            return dirtBlockId;
        };

        // Passe 1 : Prcalcul des hauteurs et biomes pour trouver les bornes exactes (élagage vertical)
        let minTopY = 999999, maxTopY = -999999;
        const colHeights = new Int32Array(tilesX * CHUNK * tilesZ * CHUNK);
        const colBiomes = [];
        for (let tx = 0; tx < tilesX; tx++) {
            const worldX0 = minX + tx * CHUNK;
            for (let tz = 0; tz < tilesZ; tz++) {
                const worldZ0 = minZ + tz * CHUNK;
                for (let lx = 0; lx < CHUNK; lx++) {
                    for (let lz = 0; lz < CHUNK; lz++) {
                        let wx = worldX0 + lx, wz = worldZ0 + lz;
                        // FIX DÉCALAGE Y ENTRE PARTIES : l'export écrit ses blocs en
                        // coordonnées POSITIVES (0..taille, car Bloxd coupe le négatif),
                        // mais la grille/peinture vivent en coordonnées CENTRÉES
                        // (-moitié..+moitié). Sans cette conversion, la moitié du monde
                        // ne trouvait aucun édit et retombait sur le terrain procédural
                        // à une hauteur différente (murs de roche au milieu des parties).
                        const wxS = wx - halfWorldX, wzS = wz - halfWorldZ;
                        let h = 0, bkey = "plain";
                        const customEdit = this.getCustomEdit(wxS, wzS, 0.5);
                        if (customEdit) {
                            const hFb = customEdit.height !== undefined ? customEdit.height : Math.round(this.fbmTerrain(wxS, wzS));
                            // MODE PIXELISE (case cochée) : point le plus proche = gros blocs
                            // MODE LISSE (défaut) : interpolation IDW entre points de peinture
                            // + micro-bruit (comme le chemin grille) : casse les dernières
                            // terrasses alignées sur le quadrillage des points de peinture
                            if (this.config.pixelatedExport) {
                                h = Math.round(hFb);
                            } else {
                                const hIdw = this.getInterpolatedEditHeight(wxS, wzS, hFb);
                                const hDet = (this.valueNoise2D(wxS * 0.35 + 7.3, wzS * 0.35 + 2.1) - 0.5) * 1.6;
                                h = Math.round(hIdw + hDet);
                            }
                            bkey = customEdit.biome || "plain";
                            // REGLE PRIORITAIRE : la règle verrouillée gagne sur la peinture
                            const lockedBy = this.isBiomePaintBlocked(h);
                            if (lockedBy) bkey = lockedBy;
                        } else if (this.config.viewportMode === 'global' && this.grid && this.currentGridMeta) {
                            const meta = this.currentGridMeta;
                            let gx = Math.floor((wxS - meta.startWorldX) / meta.stepX);
                            let gz = Math.floor((wzS - meta.startWorldZ) / meta.stepZ);
                            if (gx >= 0 && gx < meta.resX && gz >= 0 && gz < meta.resZ && this.grid[gx] && this.grid[gx][gz]) {
                                if (this.config.pixelatedExport) {
                                    // MODE PIXELISE (feature) : plus proche voisin -> gros blocs texturés
                                    h = Math.round(this.grid[gx][gz].height);
                                } else {
                                    // MODE LISSE (défaut) : interpolation bilinéaire entre les
                                    // 4 cellules voisines -> pentes continues, plus de "marches" géantes
                                    const fx = (wxS - meta.startWorldX) / meta.stepX - 0.5;
                                    const fz = (wzS - meta.startWorldZ) / meta.stepZ - 0.5;
                                    const x0 = Math.max(0, Math.min(meta.resX - 1, Math.floor(fx)));
                                    const z0 = Math.max(0, Math.min(meta.resZ - 1, Math.floor(fz)));
                                    const x1 = Math.min(meta.resX - 1, x0 + 1);
                                    const z1 = Math.min(meta.resZ - 1, z0 + 1);
                                    const tx2 = Math.max(0, Math.min(1, fx - x0));
                                    const tz2 = Math.max(0, Math.min(1, fz - z0));
                                    const h00 = this.grid[x0][z0].height, h10 = this.grid[x1][z0].height;
                                    const h01 = this.grid[x0][z1].height, h11 = this.grid[x1][z1].height;
                                    const hInterp =
                                        h00 * (1 - tx2) * (1 - tz2) + h10 * tx2 * (1 - tz2) +
                                        h01 * (1 - tx2) * tz2 + h11 * tx2 * tz2;
                                    // Micro-bruit organique (±0.8 bloc) : casse l'alignement
                                    // des bords de terrasses sur la grille (effet "rectangles 4x5")
                                    const hDetail = (this.valueNoise2D(wxS * 0.35 + 7.3, wzS * 0.35 + 2.1) - 0.5) * 1.6;
                                    h = Math.round(hInterp + hDetail);
                                }
                                bkey = this.grid[gx][gz].biome || "plain";
                            } else {
                                h = Math.round(this.fbmTerrain(wxS, wzS));
                                h = Math.max(this.config.minHeight, Math.min(this.config.maxHeight, h));
                                bkey = this.assignBiomeProcedural(h, wxS, wzS);
                            }
                        } else {
                            h = Math.round(this.fbmTerrain(wxS, wzS));
                            h = Math.max(this.config.minHeight, Math.min(this.config.maxHeight, h));
                            bkey = this.assignBiomeProcedural(h, wxS, wzS);
                        }
                        const idx = (tx * CHUNK + lx) * (tilesZ * CHUNK) + (tz * CHUNK + lz);
                        colHeights[idx] = h;
                        colBiomes[idx] = bkey;
                        if (h < minTopY) minTopY = h;
                        if (h > maxTopY) maxTopY = h;
                    }
                }
            }
        }

        // Bornes verticales réelles = hauteur de terrain effectivement calculée (Passe 1),
        // PAS les bornes théoriques minHeight/maxHeight de la config (qui gonflaient
        // artificiellement le nombre de chunks Y à exporter, la plupart vides).
        const yLo = Math.min(minTopY, this.config.baseY, this.config.seaLevel);
        const yHi = Math.max(maxTopY, this.config.seaLevel);

        // FIX ERREUR 400 : comme posX/posZ, le champ posY du header DOIT rester à 0,
        // sinon le serveur Bloxd rejette le fichier (HTTP 400). On écrit donc toujours
        // les chunks depuis Y=0 (pas d'élagage du bas — de toute façon le sous-sol
        // est rempli de pierre jusqu'à Y=0, ces chunks ne sont pas vides).
        const chunkYLo = 0;
        const chunkYHi = Math.floor(yHi / CHUNK) + 1;
        const nYChunks = chunkYHi - chunkYLo + 1;

        // ============================================================
        // GRADIENT DE BIOMES aux frontières (dithering spatial) :
        // pour chaque colonne, on échantillonne le biome d'une colonne
        // voisine choisie pseudo-aléatoirement dans un rayon BLEND_R.
        // Au coeur d'un biome cela ne change rien ; près d'une frontière
        // les blocs des deux biomes s'entremêlent progressivement,
        // créant une transition de textures naturelle (~6 blocs de large).
        // ============================================================
        const colsX = tilesX * CHUNK, colsZ = tilesZ * CHUNK;
        const BLEND_R = 3;
        const sampleBiomeBlended = (cx, cz, h) => {
            const dx = (h % (2 * BLEND_R + 1)) - BLEND_R;
            const dz = (((h / 31) | 0) % (2 * BLEND_R + 1)) - BLEND_R;
            const nx = Math.max(0, Math.min(colsX - 1, cx + dx));
            const nz = Math.max(0, Math.min(colsZ - 1, cz + dz));
            return colBiomes[nx * colsZ + nz];
        };

        const generateRegion = (startTx, endTx, startTz, endTz, partName) => {
            const regTilesX = endTx - startTx;
            const regTilesZ = endTz - startTz;
            const regMinX = minX + startTx * CHUNK;
            const regMinZ = minZ + startTz * CHUNK;
            // FIX BUG "HTTP 400 sur les parties 2+" : Bloxd.io n'utilise PAS le champ position
            // (x, z) du header pour placer automatiquement chaque partie ailleurs dans le monde.
            // Comme le fait l'outil officiel M2B (Quentin-X/M2B) pour ses schematics découpés,
            // seule la position Y garde un sens ; X et Z doivent rester à 0 dans CHAQUE fichier
            // (c'est au joueur de se déplacer manuellement de regMinX/regMinZ blocs entre deux
            // //schematic load). Écrire regMinX/regMinZ dans le header faisait que seule la
            // partie 1 (où regMinX = regMinZ = 0) était acceptée par le serveur ; toutes les
            // autres étaient rejetées avec une erreur 400.
            const writer = new BloxdSchemWriterJS(partName, regTilesX * CHUNK, nYChunks * CHUNK, regTilesZ * CHUNK, 0, chunkYLo * CHUNK, 0);
            let chunksWritten = 0;

            for (let tx = startTx; tx < endTx; tx++) {
                const worldX0 = minX + tx * CHUNK;
                for (let tz = startTz; tz < endTz; tz++) {
                    const worldZ0 = minZ + tz * CHUNK;
                    for (let cy = chunkYLo; cy <= chunkYHi; cy++) {
                        let yBase = cy * CHUNK;
                        let blocks = new Int32Array(32768);
                        let hasBlocks = false;

                        for (let lx = 0; lx < CHUNK; lx++) {
                            for (let lz = 0; lz < CHUNK; lz++) {
                                let wx = worldX0 + lx, wz = worldZ0 + lz;
                                const colIdx = (tx * CHUNK + lx) * (tilesZ * CHUNK) + (tz * CHUNK + lz);
                                let topY = colHeights[colIdx];
                                let bkey = colBiomes[colIdx];
                                // GRADIENT DE BIOMES : dithering de textures a la frontiere.
                                // FIX GLITCH EAU : jamais sous le niveau de la mer, sinon des
                                // blocs de plaine/foret se melangent au fond marin pres des cotes
                                if (topY > this.config.seaLevel) {
                                    const hMix = get3DHash(wx, topY, wz);
                                    const bkeyMix = sampleBiomeBlended(tx * CHUNK + lx, tz * CHUNK + lz, hMix);
                                    if (bkeyMix && bkeyMix !== bkey && this.biomes[bkeyMix]) bkey = bkeyMix;
                                }
                                const biomeObj = this.biomes[bkey] || this.biomes["plain"];
                                const blockList = (biomeObj && biomeObj.blocks && biomeObj.blocks.length > 0) ? biomeObj.blocks : ["Grass Block"];

                                for (let ly = 0; ly < CHUNK; ly++) {
                                    let wy = yBase + ly;
                                    let idx = lx * 1024 + ly * 32 + lz;

                                    let terrBid = 0;
                                    if (wy === topY) {
                                        const h3 = get3DHash(wx, wy, wz);
                                        terrBid = this.getBlockId(blockList[h3 % blockList.length]);
                                    } else if (wy < topY && wy >= this.config.baseY) {
                                        if (topY - wy <= 5) {
                                            terrBid = getSubsurfaceId(bkey, wx, wy, wz);
                                        } else {
                                            terrBid = stoneBlockId;
                                        }
                                    } else if (wy < topY && wy < this.config.baseY) {
                                        terrBid = stoneBlockId;
                                    } else if (this.config.showWater && wy > topY && wy <= this.config.seaLevel) {
                                        terrBid = waterBlockId;
                                    }

                                    if (terrBid > 0) {
                                        blocks[idx] = terrBid;
                                        hasBlocks = true;
                                    }
                                }
                            }
                        }

                        if (!hasBlocks) {
                            writer.addChunk(tx - startTx, cy - chunkYLo, tz - startTz, airRle);
                            chunksWritten++;
                        } else {
                            writer.addChunk(tx - startTx, cy - chunkYLo, tz - startTz, rleEncodeBlocks(blocks));
                            chunksWritten++;
                        }
                    }
                }
            }
            return { bytes: writer.finish(), chunks: chunksWritten, offsetX: regMinX, offsetZ: regMinZ };
        };

        const mainRes = generateRegion(0, tilesX, 0, tilesZ, "Monde Bloxd");

        // EXPORT MONO-FICHIER FORCÉ : ignore la limite ~200 chunks de Bloxd.
        // Utile pour les outils externes (autres sites/convertisseurs) qui
        // lisent le .bloxdschem entier ; Bloxd lui-même refusera probablement
        // un fichier aussi gros via //schematic load.
        if (this.config.forceSingleSchem) {
            const outBytes = mainRes.bytes;
            outBytes.splitFiles = [{ name: "monde_personnalise.bloxdschem", bytes: mainRes.bytes }];
            return outBytes;
        }

        if (mainRes.chunks <= 180) {
            const outBytes = mainRes.bytes;
            outBytes.splitFiles = [{ name: "monde_personnalise.bloxdschem", bytes: mainRes.bytes }];
            return outBytes;
        } else {
            const maxTilesPerAxis = Math.max(1, Math.floor(Math.sqrt(160 / nYChunks)));
            const files = [];
            let partNum = 1;
            for (let stx = 0; stx < tilesX; stx += maxTilesPerAxis) {
                const etx = Math.min(tilesX, stx + maxTilesPerAxis);
                for (let stz = 0; stz < tilesZ; stz += maxTilesPerAxis) {
                    const etz = Math.min(tilesZ, stz + maxTilesPerAxis);
                    const res = generateRegion(stx, etx, stz, etz, `Partie ${partNum}`);
                    if (res.chunks > 0) {
                        // Le décalage réel (offsetX/offsetZ) est gardé dans le nom du fichier ET
                        // dans l'objet retourné, pour que le guide généré côté UI (ui.js) puisse
                        // dire exactement de combien de blocs se déplacer avant chaque
                        // //schematic load (voir note dans generateRegion plus haut).
                        files.push({
                            name: `monde_partie_${partNum}_x${res.offsetX}_z${res.offsetZ}.bloxdschem`,
                            bytes: res.bytes,
                            offsetX: res.offsetX,
                            offsetZ: res.offsetZ
                        });
                        partNum++;
                    }
                }
            }
            const firstValidBytes = files.length > 0 ? files[0].bytes : mainRes.bytes;
            firstValidBytes.splitFiles = files;
            return firstValidBytes;
        }
    }

}
window.TerrainGenerator = TerrainGenerator;