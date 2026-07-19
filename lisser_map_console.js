/* ============================================================
   COMMANDE CONSOLE — LISSER TOUTE LA MAP D'UN COUP
   Bloxd Terrain Editor

   Utilisation :
   1. Charge ta carte (preset, peinture...) dans l'application
   2. F12 -> onglet Console
   3. Colle tout ce fichier, Entrée
   4. Ctrl+Z pour annuler si besoin !

   Réglages :
   - PASSES : 1 = léger, 2 = normal, 3+ = très lisse
   - PRESERVE_SEA : true = le trait de côte (terre/mer) ne bouge pas
   ============================================================ */
(function () {
    const gen = window.generatorInstance;
    if (!gen || !gen.grid || !gen.grid.length) { console.error('❌ Carte non chargée !'); return; }

    const PASSES = 2;
    const PRESERVE_SEA = true;

    gen.saveStateForUndo && gen.saveStateForUndo();
    const resX = gen.grid.length, resZ = gen.grid[0].length;

    for (let pass = 0; pass < PASSES; pass++) {
        // Moyenne 3x3 calculée sur une copie (pour ne pas biaiser la passe en cours)
        const heights = [];
        for (let x = 0; x < resX; x++) {
            heights[x] = [];
            for (let z = 0; z < resZ; z++) {
                let sum = 0, n = 0;
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const nx = x + dx, nz = z + dz;
                        if (nx < 0 || nx >= resX || nz < 0 || nz >= resZ) continue;
                        sum += gen.grid[nx][nz].height; n++;
                    }
                }
                heights[x][z] = sum / n;
            }
        }
        for (let x = 0; x < resX; x++) {
            for (let z = 0; z < resZ; z++) {
                const c = gen.grid[x][z];
                const wasSea = c.height <= gen.config.seaLevel;
                const isSea = heights[x][z] <= gen.config.seaLevel;
                if (PRESERVE_SEA && wasSea !== isSea) continue; // fige le trait de côte
                c.height = Math.round(heights[x][z]);
                c.isCustomHeight = true;
            }
        }
    }

    // Persiste le résultat (survit aux changements de qualité et à l'export)
    for (let x = 0; x < resX; x++) {
        for (let z = 0; z < resZ; z++) {
            const c = gen.grid[x][z];
            if (c.isCustomHeight || c.isCustomBiome) {
                gen.setCustomEdit(c.worldX, c.worldZ, c.isCustomHeight ? c.height : null, c.isCustomBiome ? c.biome : null);
            }
        }
    }

    gen.updateStats && gen.updateStats();
    window.map2dInstance && window.map2dInstance.render();
    window.map3dInstance && window.map3dInstance.updateTerrain();
    window.uiManagerInstance && window.uiManagerInstance.updateStatsBar();
    console.log('%c✓ Carte lissée (' + PASSES + ' passes). Ctrl+Z pour annuler.', 'color:#10b981;font-weight:bold');
})();
