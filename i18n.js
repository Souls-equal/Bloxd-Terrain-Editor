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
 * Module : i18n.js
 * Rôle : Système de traduction en direct (Français <-> Anglais)
 */

window.I18N = {
    lang: window.safeStorage.getItem('bloxd_lang') || 'fr',
    dict: {
        fr: {
            appTitle: "Bloxd Terrain Editor",
            langToggleTitle: "Switch to English / Changer en Anglais",
            langToggleFlag: "🇬🇧",
            langToggleText: "EN",
            loadingTitle: "Génération de l'univers Bloxd...",
            loadingSub: "Initialisation des moteurs 2D & 3D Voxel",
            errLoadingTitle: "Erreur de chargement",
            
            tabSettings: "<i class=\"fas fa-sliders-h\"></i> Paramètres",
            tabEditor: "<i class=\"fas fa-paint-brush\"></i> Éditeur",
            
            secDimensions: "Dimensions du Monde",
            labelWidthX: "Largeur X",
            labelLengthZ: "Longueur Z",
            labelSeed: "Graine (Seed)",
            titleRandomSeed: "Graine aléatoire",
            
            
            labelBaseY: "Base Y",
            labelSeaLevel: "Niveau Eau",
            
            secRelief: "Relief Procédural",
            labelMinH: "Hauteur Min",
            labelMaxH: "Hauteur Max",
            labelNoiseScale: "Échelle Bruit",
            labelIntensity: "Intensité",
            labelRoughness: "Rugosité Crêtes",
            
            secPresets: "Presets & Actions",
            presetDefault: "-- Choisir un Preset --",
            btnUndo: "Annuler",
            btnRedo: "Rétablir",
            toastUndo: "↩️ Action annulée (Ctrl+Z)",
            toastRedo: "↪️ Action rétablie (Ctrl+Y)",
            btnReset: "<i class=\"fas fa-trash-alt\"></i> Reset",
            btnSavePreset: "<i class=\"fas fa-save\"></i> Sauver Preset",
            
            secBiomes: "Biomes (cliquer pour défaut)",
            
            secPalette: "Palette Biomes (Peinture)",
            secTools: "Outils Peinture & Sculpture",
            toolBiome: "<i class=\"fas fa-paint-brush\"></i><span>Brush Biome</span>",
            toolBiomeTitle: "Peindre le biome",
            toolRaise: "<i class=\"fas fa-chevron-up\"></i><span>Élever (+)</span>",
            toolRaiseTitle: "Élever",
            toolLower: "<i class=\"fas fa-chevron-down\"></i><span>Creuser (-)</span>",
            toolLowerTitle: "Creuser",
            toolSmooth: "<i class=\"fas fa-water\"></i><span>Lisser</span>",
            toolSmoothTitle: "Lisser",
            toolFlatten: "<i class=\"fas fa-layer-group\"></i><span>Aplatir</span>",
            toolFlattenTitle: "Aplatir",
            toolEraser: "<i class=\"fas fa-eraser\"></i><span>Gomme</span>",
            toolEraserTitle: "Gomme",
            
            secBrushParams: "Paramètres du Brush",
            labelBrushSize: "Taille Pinceau",
            brushSizeVal: " cases",
            labelBrushIntensity: "Intensité",
            
            btnDownloadZip: "<i class=\"fas fa-file-export\"></i> 👉 Télécharger le projet (ZIP)",
            
            statMin: "Min: ",
            statAvg: "Moy: ",
            statMax: "Max: ",
            
            title2D: "Carte 2D Éditable",
            btn2dReset: "<i class=\"fas fa-compress-arrows-alt\"></i> Recadrer",
            btn2dRelief: "<i class=\"fas fa-mountain\"></i> Relief",
            btn2dGrid: "<i class=\"fas fa-th\"></i> Grille",
            infoHover: "Survolez la carte pour voir les coordonnées",
            outOfBounds: "Hors carte",
            
            title3D: "Visualisation 3D",
            btn3dReset: "<i class=\"fas fa-video\"></i> Caméra",
            btn3dMeshVoxel: "🧱 Voxel",
            btn3dMeshSmooth: "🟢 Lisse",
            btn3dWater: "<i class=\"fas fa-water\"></i> Eau",
            
            modalTitle: "Exportation du Projet Bloxd",
            modalDesc: "Téléchargez directement votre <strong>schématique (.bloxdschem)</strong> généré en temps réel sans avoir besoin de Python ni de ligne de commande ! Si le monde est trop grand, il sera automatiquement découpé en plusieurs fichiers regroupés dans un dossier ZIP.",
            modalFilenameLabel: "Nom du fichier <span style=\"color: var(--text-muted); font-weight: 400;\">(si un seul schéma)</span>",
            modalFoldernameLabel: "Nom du dossier <span style=\"color: var(--text-muted); font-weight: 400;\">(si plusieurs schémas)</span>",
            modalFolderDesc: "Chaque schéma du dossier sera nommé <code>numéro_[posX,posY,posZ]</code> (ex : <code>1_[0,0,0]</code>).",
            modalAnchorLabel: "Position de l'angle de collage <span style=\"color: var(--text-muted); font-weight: 400;\">(coin où vous poserez le 1er schéma en jeu)</span>",
            modalDownloadBtn: "<i class=\"fas fa-download\"></i> Télécharger le fichier .bloxdschem",
            modalGenerating: "<i class=\"fas fa-cog fa-spin\"></i> Génération directe du schématique...",
            
            biomePlain: "Plaines (Plain)",
            biomeForest: "Forêt (Forest)",
            biomeSand: "Sable / Plage (Sand)",
            biomeMountain: "Montagne (Mountain)",
            biomeSnow: "Neige (Snow)",
            biomeDesert: "Mesa (Mesa)",
            biomeVolcano: "Volcan (Volcano)",
            ruleActive: "Actif (règle de hauteur)",
            ruleYMinTip: "Couche basse : altitude minimale où ce biome apparaît toujours",
            ruleYMaxTip: "Couche haute : altitude maximale où ce biome apparaît toujours",
            ruleLocked: "Prioritaire (bloque la peinture)",
            maxHWarning: "⚠️ Au-delà de 400, l'export sera plus lourd et plus lent en jeu (déconseillé).",
            modalSingleFile: "📄 Forcer un seul fichier .bloxdschem",
            modalSingleFileDesc: "Exporte tout le monde en un unique schématique, sans découpage. Idéal pour les outils externes (autres sites web). ⚠️ Bloxd.io refusera ce fichier s'il dépasse ~200 chunks : garde la case décochée pour importer en jeu.",
            toolSphere: "<i class=\"fas fa-globe\"></i><span>Sphère</span>",
            toolSphereTitle: "Poser une sphère (dôme) de terrain — taille réglable ci-dessous",
            toolBox: "<i class=\"fas fa-cube\"></i><span>Pavé</span>",
            toolBoxTitle: "Poser un pavé (plateau) de terrain — taille réglable ci-dessous",
            secStampParams: "Taille de la Forme",
            labelStampW: "Largeur (X, en blocs)",
            labelStampD: "Profondeur (Z, en blocs)",
            labelStampH: "Hauteur (+bosse / -creux)",
            labelStampBiome: "Appliquer aussi le biome sélectionné",
            btnAddPalette: "➕ Ajouter ma palette de couleurs",
            secPaletteForm: "Ma Palette Personnalisée",
            labelPaletteName: "Nom de la palette",
            labelPaletteColor: "Couleur (aperçu carte)",
            labelPaletteBlocks: "Blocs Bloxd (séparés par des virgules)",
            paletteBlocksHint: "Noms exacts des blocs (ex : Grass Block, Red Sand, Magma). Un bloc inconnu devient Grass Block à l'export.",
            btnSavePalette: "💾 Enregistrer",
            btnCancelPalette: "Annuler",
            errPaletteName: "Donne un nom à ta palette !",
            errPaletteExists: "Une palette porte déjà ce nom.",
            delPaletteTip: "Supprimer cette palette",
            confirmDelPalette: "Supprimer cette palette ? Les zones peintes reviendront au biome par défaut.",
            modalPixelated: "🧊 Style pixelisé (gros blocs texturés)",
            modalPixelatedDesc: "Conserve l'effet \"marches géantes\" : le terrain est exporté en gros plateaux cubiques stylés. Décoché = pentes lissées (interpolation).",
            
            presetClassic: "🟢 Plaines Bloxd Classique",
            presetArchipelago: "🏝️ Archipel Tropical & Plages",
            presetAlpine: "🏔️ Hauts Sommets Glacés",
            
            promptPresetName: "Nom du Preset personnalisé :",
            defaultPresetVal: "Mon Univers Bloxd",
            presetSaved: "Preset sauvegardé avec succès : ",
            errSchemGen: "Erreur lors de la création du fichier .bloxdschem.",
            
            guideSplitHeader: "============================================================\n📦 MONDE DÉCOUPÉ EN PARTIES (<200 CHUNKS/FICHIER)\n============================================================\n\nCe monde étant volumineux, il a été découpé en plusieurs fichiers pour respecter\nla limite technique de Bloxd.io (~200 chunks maximum par commande //schematic load).\n\n⚠️ IMPORTANT : Bloxd.io ne repositionne PAS automatiquement chaque partie à sa\nplace dans le monde (comme le fait aussi l'outil officiel M2B pour ses schematics\ndécoupés) : c'est à VOUS de vous déplacer entre deux chargements, sinon toutes\nles parties se superposent au même endroit.\n\nINSTRUCTIONS D'IMPORTATION :\n1. Placez tous les fichiers .bloxdschem du dossier dans le répertoire schématiques de Bloxd.\n2. En jeu, rendez-vous à la position de l'angle de collage indiquée dans le nom du 1er fichier.\n3. Pour chaque fichier ci-dessous, déplacez-vous à la position [posX,posY,posZ] indiquée dans\n   son nom, PUIS chargez-le :\n\n",
            readmeHeader: "# 📦 Projet Terrain Bloxd.io Personnalisé\nGénéré depuis l'application **Bloxd Terrain Editor**\n\n## 🚀 Contenu de l'archive\n- `generate_terrain.py` : Script de génération configuré avec vos paramètres exacts et biomes.\n- `bloxd_format.py` : Moteur d'écriture binaire Avro (.bloxdschem).\n- `nameToId.json` : Table de mapping des ID de blocs Bloxd.io.\n\n## 🛠️ Comment générer votre carte sur votre ordinateur\n1. Assurez-vous d'avoir Python 3 installé avec `numpy` :\n   ```bash\n   pip install numpy\n   ```\n2. Exécutez le générateur :\n   ```bash\n   python generate_terrain.py\n   ```\n3. Un fichier **`custom_terrain.bloxdschem`** sera généré en quelques secondes.\n\n## 🎮 Comment importer dans Bloxd.io\n1. Lancez Bloxd.io dans votre navigateur (mode Créatif ou serveur Worlds avec permissions).\n2. Placez le fichier `custom_terrain.bloxdschem` dans vos schématiques.\n3. Chargez le schématique en jeu via la commande :\n   `//schematic load custom_terrain`\n\nProfitez de votre nouveau monde Bloxd ! 🌟\n",
            directGuideContent: "============================================================\n📦 GUIDE D'IMPORTATION DIRECTE DANS BLOXD.IO\n============================================================\n\nFélicitations ! Votre monde a été généré en direct par Bloxd Terrain Editor sans avoir besoin de code Python.\nLe fichier schématique prêt à l'emploi est situé dans le dossier \"schematics\" :\n👉 monde_personnalise.bloxdschem\n\nMODE D'EMPLOI EN 3 ÉTAPES SIMPLES :\n1. Lancez Bloxd.io dans votre navigateur internet.\n2. Placez le fichier \"monde_personnalise.bloxdschem\" dans votre dossier de schématiques Bloxd (ou utilisez un proxy/mod compatible).\n3. Ouvrez le tchat en jeu et tapez la commande :\n   //schematic load monde_personnalise\n\nEt voilà ! Votre terrain apparaîtra instantanément dans le jeu.\n============================================================\nNote pour les développeurs : Si vous préférez exécuter les scripts manuellement, \nils sont conservés dans le dossier \"options_avancees_python/\".\n"
        },
        en: {
            appTitle: "Bloxd Terrain Editor",
            langToggleTitle: "Passer en Français / Switch to French",
            langToggleFlag: "🇫🇷",
            langToggleText: "FR",
            loadingTitle: "Generating Bloxd world...",
            loadingSub: "Initializing 2D & 3D Voxel engines",
            errLoadingTitle: "Loading Error",
            
            tabSettings: "<i class=\"fas fa-sliders-h\"></i> Settings",
            tabEditor: "<i class=\"fas fa-paint-brush\"></i> Editor",
            
            secDimensions: "World Dimensions",
            labelWidthX: "Width X",
            labelLengthZ: "Length Z",
            labelSeed: "Seed",
            titleRandomSeed: "Random seed",
            
            
            labelBaseY: "Base Y",
            labelSeaLevel: "Sea Level",
            
            secRelief: "Procedural Relief",
            labelMinH: "Min Height",
            labelMaxH: "Max Height",
            labelNoiseScale: "Noise Scale",
            labelIntensity: "Intensity",
            labelRoughness: "Ridge Roughness",
            
            secPresets: "Presets & Actions",
            presetDefault: "-- Choose a Preset --",
            btnUndo: "Undo",
            btnRedo: "Redo",
            toastUndo: "↩️ Action undone (Ctrl+Z)",
            toastRedo: "↪️ Action redone (Ctrl+Y)",
            btnReset: "<i class=\"fas fa-trash-alt\"></i> Reset",
            btnSavePreset: "<i class=\"fas fa-save\"></i> Save Preset",
            
            secBiomes: "Biomes (click for default)",
            
            secPalette: "Biome Palette (Painting)",
            secTools: "Painting & Sculpting Tools",
            toolBiome: "<i class=\"fas fa-paint-brush\"></i><span>Biome Brush</span>",
            toolBiomeTitle: "Paint biome",
            toolRaise: "<i class=\"fas fa-chevron-up\"></i><span>Raise (+)</span>",
            toolRaiseTitle: "Raise height",
            toolLower: "<i class=\"fas fa-chevron-down\"></i><span>Lower (-)</span>",
            toolLowerTitle: "Lower height",
            toolSmooth: "<i class=\"fas fa-water\"></i><span>Smooth</span>",
            toolSmoothTitle: "Smooth terrain",
            toolFlatten: "<i class=\"fas fa-layer-group\"></i><span>Flatten</span>",
            toolFlattenTitle: "Flatten terrain",
            toolEraser: "<i class=\"fas fa-eraser\"></i><span>Eraser</span>",
            toolEraserTitle: "Eraser tool",
            
            secBrushParams: "Brush Settings",
            labelBrushSize: "Brush Size",
            brushSizeVal: " blocks",
            labelBrushIntensity: "Intensity",
            
            btnDownloadZip: "<i class=\"fas fa-file-export\"></i> 👉 Download Project (ZIP)",
            
            statMin: "Min: ",
            statAvg: "Avg: ",
            statMax: "Max: ",
            
            title2D: "Editable 2D Map",
            btn2dReset: "<i class=\"fas fa-compress-arrows-alt\"></i> Center View",
            btn2dRelief: "<i class=\"fas fa-mountain\"></i> Relief",
            btn2dGrid: "<i class=\"fas fa-th\"></i> Grid",
            infoHover: "Hover over map to view coordinates",
            outOfBounds: "Out of bounds",
            
            title3D: "3D Visualization",
            btn3dReset: "<i class=\"fas fa-video\"></i> Camera",
            btn3dMeshVoxel: "🧱 Voxel",
            btn3dMeshSmooth: "🟢 Smooth",
            btn3dWater: "<i class=\"fas fa-water\"></i> Water",
            
            modalTitle: "Export Bloxd Project",
            modalDesc: "Download your generated <strong>schematic (.bloxdschem)</strong> directly in real time without needing Python or command line tools! If the world exceeds size limits, it will automatically be split into multiple schematic files packaged inside a ZIP archive.",
            modalFilenameLabel: "File name <span style=\"color: var(--text-muted); font-weight: 400;\">(if single schematic)</span>",
            modalFoldernameLabel: "Folder name <span style=\"color: var(--text-muted); font-weight: 400;\">(if multiple schematics)</span>",
            modalFolderDesc: "Each schematic in the archive will be named <code>number_[posX,posY,posZ]</code> (e.g. <code>1_[0,0,0]</code>).",
            modalAnchorLabel: "Paste Anchor Position <span style=\"color: var(--text-muted); font-weight: 400;\">(corner where you paste the 1st schematic in game)</span>",
            modalDownloadBtn: "<i class=\"fas fa-download\"></i> Download .bloxdschem file",
            modalGenerating: "<i class=\"fas fa-cog fa-spin\"></i> Generating schematic directly...",
            
            biomePlain: "Plains",
            biomeForest: "Forest",
            biomeSand: "Sand / Beach",
            biomeMountain: "Mountain",
            biomeSnow: "Snow",
            biomeDesert: "Mesa",
            biomeVolcano: "Volcano",
            ruleActive: "Active (height rule)",
            ruleYMinTip: "Lower layer: minimum altitude where this biome always appears",
            ruleYMaxTip: "Upper layer: maximum altitude where this biome always appears",
            ruleLocked: "Priority (blocks painting)",
            maxHWarning: "⚠️ Above 400, the export gets heavier and slower in game (not recommended).",
            modalSingleFile: "📄 Force a single .bloxdschem file",
            modalSingleFileDesc: "Exports the whole world as one schematic, without splitting. Ideal for external tools (other websites). ⚠️ Bloxd.io will reject the file if it exceeds ~200 chunks: keep unchecked for in-game import.",
            toolSphere: "<i class=\"fas fa-globe\"></i><span>Sphere</span>",
            toolSphereTitle: "Place a terrain sphere (dome) — size adjustable below",
            toolBox: "<i class=\"fas fa-cube\"></i><span>Box</span>",
            toolBoxTitle: "Place a terrain box (plateau) — size adjustable below",
            secStampParams: "Shape Size",
            labelStampW: "Width (X, in blocks)",
            labelStampD: "Depth (Z, in blocks)",
            labelStampH: "Height (+bump / -hole)",
            labelStampBiome: "Also apply the selected biome",
            btnAddPalette: "➕ Add my color palette",
            secPaletteForm: "My Custom Palette",
            labelPaletteName: "Palette name",
            labelPaletteColor: "Color (map preview)",
            labelPaletteBlocks: "Bloxd blocks (comma separated)",
            paletteBlocksHint: "Exact block names (e.g. Grass Block, Red Sand, Magma). Unknown blocks fall back to Grass Block on export.",
            btnSavePalette: "💾 Save",
            btnCancelPalette: "Cancel",
            errPaletteName: "Give your palette a name!",
            errPaletteExists: "A palette with this name already exists.",
            delPaletteTip: "Delete this palette",
            confirmDelPalette: "Delete this palette? Painted areas will revert to the default biome.",
            modalPixelated: "🧊 Pixelated style (big textured blocks)",
            modalPixelatedDesc: "Keeps the \"giant steps\" effect: terrain is exported as big stylish cubic plateaus. Unchecked = smooth slopes (interpolation).",
            
            presetClassic: "🟢 Classic Bloxd Plains",
            presetArchipelago: "🏝️ Tropical Archipelago & Beaches",
            presetAlpine: "🏔️ Icy Alpine Peaks",
            
            promptPresetName: "Custom Preset Name:",
            defaultPresetVal: "My Bloxd World",
            presetSaved: "Preset saved successfully: ",
            errSchemGen: "Error generating .bloxdschem file.",
            
            guideSplitHeader: "============================================================\n📦 SPLIT WORLD SCHEMATICS (<200 CHUNKS/FILE)\n============================================================\n\nBecause this world is large, it was split into multiple files to comply with\nBloxd.io technical limits (~200 chunks maximum per //schematic load command).\n\n⚠️ IMPORTANT: Bloxd.io does NOT automatically reposition each schematic file\nto its coordinates in the world: YOU must move your character between loads,\notherwise all parts will overlap at the same location.\n\nIMPORT INSTRUCTIONS:\n1. Place all .bloxdschem files from the folder into Bloxd schematic directory.\n2. In game, go to the paste anchor position indicated in the name of file #1.\n3. For each file below, move your character to the [posX,posY,posZ] indicated in\n   its name, THEN load it:\n\n🚨 GOLDEN RULE — CONSTANT Y ALTITUDE:\nBloxd pastes each schematic RELATIVE TO YOUR POSITION, INCLUDING YOUR HEIGHT!\nLoad ALL parts from EXACTLY the same Y altitude.\nIf you walk on already-generated terrain (dunes, hills...), your Y changes and\nthe next part will be VERTICALLY SHIFTED (stone cliffs, raised sand level).\n👉 Tip: use fly mode, position yourself at the exact Y shown on screen,\n   and check that Y before EVERY //schematic load.\n\n",
            readmeHeader: "# 📦 Custom Bloxd.io Terrain Project\nGenerated from **Bloxd Terrain Editor**\n\n## 🚀 Archive Contents\n- `generate_terrain.py`: Generation script configured with your exact parameters and biomes.\n- `bloxd_format.py`: Avro (.bloxdschem) binary schematic writer.\n- `nameToId.json`: Block mapping table for Bloxd.io block IDs.\n\n## 🛠️ How to generate the map locally on your computer\n1. Make sure Python 3 is installed along with `numpy`:\n   ```bash\n   pip install numpy\n   ```\n2. Run the generator script:\n   ```bash\n   python generate_terrain.py\n   ```\n3. A **`custom_terrain.bloxdschem`** file will be generated in seconds.\n\n## 🎮 How to import into Bloxd.io\n1. Launch Bloxd.io in your web browser (Creative mode or Worlds with build permissions).\n2. Place `custom_terrain.bloxdschem` into your schematic folder.\n3. Load the schematic in game using the chat command:\n   `//schematic load custom_terrain`\n\nEnjoy your new Bloxd world! 🌟\n",
            directGuideContent: "============================================================\n📦 DIRECT BLOXD.IO IMPORT GUIDE\n============================================================\n\nCongratulations! Your world was generated live by Bloxd Terrain Editor without needing Python code.\nThe ready-to-use schematic file is located inside the \"schematics\" folder:\n👉 monde_personnalise.bloxdschem\n\nSIMPLE 3-STEP USER GUIDE:\n1. Launch Bloxd.io in your web browser.\n2. Place the file \"monde_personnalise.bloxdschem\" into your Bloxd schematics folder (or use a compatible proxy/mod).\n3. Open chat in game and type the command:\n   //schematic load monde_personnalise\n\nThat's it! Your terrain will appear immediately in game.\n============================================================\nNote for developers: If you prefer running Python scripts manually,\nthey are preserved inside the \"options_avancees_python/\" folder.\n"
        }
    }
};

window.t = function(key) {
    const lang = window.I18N.lang || 'fr';
    const d = window.I18N.dict[lang] || window.I18N.dict['fr'];
    return d[key] !== undefined ? d[key] : key;
};

window.getBiomeName = function(bKey, defaultObj) {
    const mapKey = 'biome' + bKey.charAt(0).toUpperCase() + bKey.slice(1);
    const translated = window.t(mapKey);
    if (translated && translated !== mapKey) return translated;
    return defaultObj ? defaultObj.name : bKey;
};

window.getPresetName = function(pKey, defaultObj) {
    const mapKey = 'preset' + pKey.charAt(0).toUpperCase() + pKey.slice(1);
    const translated = window.t(mapKey);
    if (translated && translated !== mapKey) return translated;
    return defaultObj ? defaultObj.name : pKey;
};

window.applyLanguage = function(lang) {
    if (lang) {
        window.I18N.lang = lang;
        window.safeStorage.setItem('bloxd_lang', lang);
    }
    const currentLang = window.I18N.lang;

    // Update toggle button text & flag
    const flagEl = document.getElementById('lang-flag');
    const textEl = document.getElementById('lang-label');
    const btnEl = document.getElementById('btn-lang-toggle');
    if (flagEl) flagEl.textContent = window.t('langToggleFlag');
    if (textEl) textEl.textContent = window.t('langToggleText');
    if (btnEl) btnEl.title = window.t('langToggleTitle');

    // Scan all data-i18n elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.innerHTML = window.t(key);
    });

    // Scan all data-i18n-title elements
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.title = window.t(key);
    });

    // Scan all data-i18n-placeholder elements
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = window.t(key);
    });

    // Update dynamic UI components if UI manager exists
    if (window.uiManagerInstance) {
        window.uiManagerInstance.initPresetsAndActions();
        if (typeof window.uiManagerInstance.renderSettingsBiomes === 'function') window.uiManagerInstance.renderSettingsBiomes();
        if (typeof window.uiManagerInstance.renderEditorBiomes === 'function') window.uiManagerInstance.renderEditorBiomes();
        if (typeof window.uiManagerInstance.update3dMeshBtn === 'function') window.uiManagerInstance.update3dMeshBtn();
        window.uiManagerInstance.updateStatsBar();
    }
    if (window.map2dInstance) {
        window.map2dInstance.updateMouseOverlay();
    }
};

window.toggleLanguage = function() {
    const nextLang = window.I18N.lang === 'fr' ? 'en' : 'fr';
    window.applyLanguage(nextLang);
};