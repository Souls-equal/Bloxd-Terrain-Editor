/**
 * GIGA PROMPT - Bloxd Terrain Editor
 * Fichier principal : main.js
 * Rôle : Point d'entrée de l'application, initialisation des modules et coordination
 */

function initApp() {
    try {
        console.log("🚀 Lancement de Bloxd Terrain Editor...");

        if (typeof window.TerrainGenerator === 'undefined') {
            console.error("Les modules JS n'ont pas été chargés !");
            return;
        }

        // 1. Initialisation du Générateur
        const generator = new window.TerrainGenerator();
        generator.generateGrid();

        // 2. Initialisation de la vue 3D (Three.js)
        const map3d = new window.Map3D('map3d-container', generator);

        // 3. Initialisation de la vue 2D (Canvas) avec callback de modification
        const map2d = new window.Map2D('map2d-canvas', generator, (region) => {
            // Callback appelé à chaque coup de pinceau sur la carte 2D.
            // TACHE 2 : si la zone modifiée est connue, mise à jour 3D PARTIELLE
            // (seuls les vertices touchés sont réécrits) ; sinon rebuild complet.
            if (region && typeof map3d.updateTerrainRegion === 'function') {
                map3d.updateTerrainRegion(region.gxMin, region.gxMax, region.gzMin, region.gzMax);
            } else {
                map3d.updateTerrain();
            }
        });

        // 4. Initialisation du gestionnaire UI et des contrôles
        const ui = new window.UIManager(generator, map2d, map3d);

        window.generatorInstance = generator;
        window.map2dInstance = map2d;
        window.map3dInstance = map3d;
        window.uiManagerInstance = ui;

        // Synchronisation initiale et premier affichage
        ui.syncUIWithConfig();
        map2d.render();
        map3d.updateTerrain();
        ui.updateStatsBar();

        if (window.applyLanguage && window.I18N) {
            window.applyLanguage(window.I18N.lang || 'fr');
        }

        // Masquer l'écran de chargement s'il est présent
        const loader = document.getElementById('app-loading');
        if (loader) {
            setTimeout(() => {
                loader.style.opacity = '0';
                setTimeout(() => loader.style.display = 'none', 400);
            }, 300);
        }

        console.log("✅ Bloxd Terrain Editor initialisé avec succès !");
    } catch (err) {
        console.error("Erreur lors de l'initialisation de l'application:", err);
        const loader = document.getElementById('app-loading');
        if (loader) {
            loader.innerHTML = `<div style="color: #ef4444; font-size: 2rem; margin-bottom: 16px;"><i class="fas fa-exclamation-triangle"></i></div>
            <h2 style="color: #fff; font-size: 1.2rem;">Erreur de chargement</h2>
            <p style="color: #f87171; margin-top: 8px; max-width: 500px; text-align: center;">${err.message}</p>`;
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    // Si le document est déjà chargé
    setTimeout(initApp, 50);
}
