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
 * Module : ui.js
 * Rôle : Gestion des événements UI, onglets, séparateurs redimensionnables (splitters), contrôles du formulaire, et export ZIP/Python
 */

class UIManager {
    constructor(generator, map2d, map3d) {
        this.generator = generator;
        this.map2d = map2d;
        this.map3d = map3d;

        this.initTabs();
        this.initSplitters();
        this.initFormControls();
        this.initEditorControls();
        this.initPaletteForm();
        this.initBiomesGrid();
        this.initPresetsAndActions();
        this.initExportModal();
    }

    /**
     * Gestion de la navigation par onglets (Paramètres / Éditeur)
     */
    initTabs() {
        const btnSettings = document.getElementById('tab-btn-settings');
        const btnEditor = document.getElementById('tab-btn-editor');
        const panelSettings = document.getElementById('panel-settings');
        const panelEditor = document.getElementById('panel-editor');

        const switchTab = (tabName) => {
            if (btnSettings) btnSettings.classList.toggle('active', tabName === 'settings');
            if (btnEditor) btnEditor.classList.toggle('active', tabName === 'editor');
            if (panelSettings) panelSettings.classList.toggle('active', tabName === 'settings');
            if (panelEditor) panelEditor.classList.toggle('active', tabName === 'editor');
            this.map2d.activeTab = tabName;
            if (tabName === 'editor' && typeof this.renderEditorBiomes === 'function') {
                this.renderEditorBiomes();
            }
        };

        if (btnSettings) btnSettings.addEventListener('click', () => switchTab('settings'));
        if (btnEditor) btnEditor.addEventListener('click', () => switchTab('editor'));
    }

    /**
     * Séparateurs DRAGGABLE entre les zones (Panel gauche vs Cartes droite, et Map 2D vs Map 3D)
     */
    initSplitters() {
        const mapsArea = document.getElementById('app-maps');
        // 1. Séparateur vertical (Horizontal drag X) entre Panel (gauche) et Maps (droite)
        const vSplitter = document.getElementById('splitter-vertical');
        const panel = document.getElementById('app-panel');

        if (vSplitter && panel && mapsArea) {
            let isResizingX = false;
            vSplitter.addEventListener('mousedown', (e) => {
                isResizingX = true;
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
            });

            window.addEventListener('mousemove', (e) => {
                if (!isResizingX) return;
                const totalWidth = window.innerWidth;
                let newPanelWidth = (e.clientX / totalWidth) * 100;
                newPanelWidth = Math.max(20, Math.min(65, newPanelWidth)); // Clamp entre 20% et 65%

                panel.style.width = `${newPanelWidth}%`;
                mapsArea.style.width = `${100 - newPanelWidth}%`;

                this.map2d.resize();
                this.map3d.resize();
            });

            window.addEventListener('mouseup', () => {
                if (isResizingX) {
                    isResizingX = false;
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                    this.map2d.resize();
                    this.map3d.resize();
                }
            });
        }

        // 2. Séparateur horizontal (Vertical drag Y) entre Map 2D (haut) et Map 3D (bas)
        // TOGGLE VUE 2D/3D : une seule visualisation à la fois dans la zone droite.
        // (Le splitter horizontal a été retiré avec le mode "Focus Écran Dynamique".)
        const map2dSec = document.getElementById('map2d-section');
        const map3dSec = document.getElementById('map3d-section');
        const switchView = (view) => {
            if (!map2dSec || !map3dSec) return;
            const to3d = view === '3d';
            map2dSec.classList.toggle('view-hidden', to3d);
            map3dSec.classList.toggle('view-hidden', !to3d);
            // Resize après le reflow : le canvas caché avait une taille nulle.
            // + rattrapage : si des modifications ont eu lieu pendant que la vue
            // était masquée (_terrainDirty), reconstruire maintenant.
            requestAnimationFrame(() => {
                if (to3d) {
                    this.map3d.resize();
                    if (this.map3d._terrainDirty) this.map3d.updateTerrain();
                } else {
                    this.map2d.resize();
                    this.map2d.render();
                }
            });
        };
        ['btn-view-3d', 'btn-view-3d-b'].forEach(id => {
            const b = document.getElementById(id);
            if (b) b.addEventListener('click', () => switchView('3d'));
        });
        ['btn-view-2d', 'btn-view-2d-b'].forEach(id => {
            const b = document.getElementById(id);
            if (b) b.addEventListener('click', () => switchView('2d'));
        });

        const hSplitter = null; // splitter horizontal supprimé
        if (hSplitter && map2dSec && map3dSec) {
            let isResizingY = false;
            hSplitter.addEventListener('mousedown', (e) => {
                isResizingY = true;
                document.body.style.cursor = 'row-resize';
                document.body.style.userSelect = 'none';
            });

            window.addEventListener('mousemove', (e) => {
                if (!isResizingY || !mapsArea) return;
                const rect = mapsArea.getBoundingClientRect();
                let relY = e.clientY - rect.top;
                let new2DHeight = (relY / rect.height) * 100;
                new2DHeight = Math.max(20, Math.min(80, new2DHeight)); // Clamp entre 20% et 80%

                map2dSec.style.height = `${new2DHeight}%`;
                map3dSec.style.height = `${100 - new2DHeight}%`;

                this.map2d.resize();
                this.map3d.resize();
            });

            window.addEventListener('mouseup', () => {
                if (isResizingY) {
                    isResizingY = false;
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                    this.map2d.resize();
                    this.map3d.resize();
                }
            });
        }
    }

    /**
     * Synchronise les contrôles du formulaire avec generator.config
     */
    initFormControls() {
        const cfg = this.generator.config;

        // Monde
        const inpWidth = document.getElementById('cfg-world-x');
        const inpLength = document.getElementById('cfg-world-z');
        const inpSeed = document.getElementById('cfg-seed');
        const btnRandomSeed = document.getElementById('btn-random-seed');
        const inpBaseY = document.getElementById('cfg-base-y');
        const inpSeaLevel = document.getElementById('cfg-sea-level');

        if (inpWidth) inpWidth.addEventListener('change', (e) => { cfg.worldSizeX = parseInt(e.target.value) || 4000; this.triggerRegeneration(); });
        if (inpLength) inpLength.addEventListener('change', (e) => { cfg.worldSizeZ = parseInt(e.target.value) || 4000; this.triggerRegeneration(); });
        if (inpSeed) inpSeed.addEventListener('change', (e) => { cfg.seed = parseInt(e.target.value) || 1; this.triggerRegeneration(); });
        if (btnRandomSeed) btnRandomSeed.addEventListener('click', () => {
            cfg.seed = Math.floor(Math.random() * 900000) + 10000;
            if (inpSeed) inpSeed.value = cfg.seed;
            this.triggerRegeneration();
        });
        if (inpBaseY) inpBaseY.addEventListener('change', (e) => { cfg.baseY = parseInt(e.target.value) || 70; this.triggerRegeneration(); });
        if (inpSeaLevel) inpSeaLevel.addEventListener('change', (e) => { cfg.seaLevel = parseInt(e.target.value) || 88; this.triggerRegeneration(); });

        // Terrain sliders
        const bindSlider = (id, valId, configKey, isFloat = false) => {
            const slider = document.getElementById(id);
            const valSpan = document.getElementById(valId);
            if (!slider) return;
            slider.addEventListener('input', (e) => {
                const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
                cfg[configKey] = val;
                if (valSpan) valSpan.textContent = val;
            });
            slider.addEventListener('change', () => this.triggerRegeneration());
        };

        bindSlider('cfg-min-h', 'val-min-h', 'minHeight');
        bindSlider('cfg-max-h', 'val-max-h', 'maxHeight');
        // Avertissement au-delà de 400 (limite conseillée) : export plus lourd
        const maxHSlider = document.getElementById('cfg-max-h');
        const maxHWarn = document.getElementById('max-h-warning');
        if (maxHSlider && maxHWarn) {
            const updWarn = () => { maxHWarn.style.display = parseInt(maxHSlider.value) > 400 ? 'block' : 'none'; };
            maxHSlider.addEventListener('input', updWarn);
            updWarn();
        }
        bindSlider('cfg-noise-scale', 'val-noise-scale', 'noiseScale', true);
        bindSlider('cfg-intensity', 'val-intensity', 'terrainIntensity');
        bindSlider('cfg-roughness', 'val-roughness', 'roughness', true);

        // Boutons overlay 2D
        const btn2dRecadrer = document.getElementById('btn-2d-reset');
        const btn2dRelief = document.getElementById('btn-2d-relief');
        const btn2dGrid = document.getElementById('btn-2d-grid');

        if (btn2dRecadrer) btn2dRecadrer.addEventListener('click', () => this.map2d.resetView());
        if (btn2dRelief) btn2dRelief.addEventListener('click', () => {
            cfg.hillshading = !cfg.hillshading;
            btn2dRelief.classList.toggle('active', cfg.hillshading);
            this.map2d.render();
        });
        if (btn2dGrid) btn2dGrid.addEventListener('click', () => {
            cfg.showGrid = !cfg.showGrid;
            btn2dGrid.classList.toggle('active', cfg.showGrid);
            this.map2d.render();
        });

        // Boutons overlay 3D
        const btn3dReset = document.getElementById('btn-3d-reset');
        const btn3dMesh = document.getElementById('btn-3d-mesh');
        const btn3dWater = document.getElementById('btn-3d-water');

        if (btn3dReset) btn3dReset.addEventListener('click', () => this.map3d.resetCamera());
        if (btn3dMesh) btn3dMesh.addEventListener('click', () => {
            cfg.meshType = cfg.meshType === 'voxel' ? 'smooth' : 'voxel';
            this.update3dMeshBtn();
            this.map3d.updateTerrain();
        });
        if (btn3dWater) btn3dWater.addEventListener('click', () => {
            cfg.showWater = !cfg.showWater;
            btn3dWater.classList.toggle('active', cfg.showWater);
            this.map2d.render();
            this.map3d.updateTerrain();
        });
    }

    /**
     * Éléments de contrôle de l'Éditeur (Pinceaux et Sliders)
     */
    initEditorControls() {
        const tools = ['biome', 'raise', 'lower', 'smooth', 'flatten', 'eraser', 'sphere', 'box'];
        tools.forEach((t) => {
            const btn = document.getElementById(`tool-${t}`);
            if (!btn) return;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.map2d.activeTool = t;
                // Panneau tailles visible uniquement pour les formes
                const stampPanel = document.getElementById('stamp-params');
                if (stampPanel) stampPanel.style.display = (t === 'sphere' || t === 'box') ? 'block' : 'none';
            });
        });

        // Curseurs de taille des formes (sphère / pavé)
        this.stampParams = { w: 16, d: 16, h: 20, paintBiome: true }; // w/d en BLOCS réels
        const bindStamp = (id, valId, key) => {
            const el = document.getElementById(id), val = document.getElementById(valId);
            if (!el) return;
            el.addEventListener('input', (e) => {
                this.stampParams[key] = parseInt(e.target.value);
                if (val) val.textContent = e.target.value;
            });
        };
        bindStamp('stamp-w', 'val-stamp-w', 'w');
        bindStamp('stamp-d', 'val-stamp-d', 'd');
        bindStamp('stamp-h', 'val-stamp-h', 'h');
        const chkStampBiome = document.getElementById('stamp-paint-biome');
        if (chkStampBiome) chkStampBiome.addEventListener('change', () => { this.stampParams.paintBiome = chkStampBiome.checked; });

        const sliderRadius = document.getElementById('brush-size');
        const valRadius = document.getElementById('val-brush-size');
        if (sliderRadius) sliderRadius.addEventListener('input', (e) => {
            this.map2d.brushRadius = parseInt(e.target.value);
            if (valRadius) valRadius.textContent = `${e.target.value}${window.t ? window.t('brushSizeVal') : ' cases'}`;
        });

        const sliderIntensity = document.getElementById('brush-intensity');
        const valIntensity = document.getElementById('val-brush-intensity');
        if (sliderIntensity) sliderIntensity.addEventListener('input', (e) => {
            this.map2d.brushIntensity = parseInt(e.target.value);
            if (valIntensity) valIntensity.textContent = e.target.value;
        });
    }

    /**
     * Initialise et rend la grille des biomes
     */
    initBiomesGrid() {
        this.renderSettingsBiomes();
        this.renderEditorBiomes();
    }

    renderSettingsBiomes() {
        const container = document.getElementById('biomes-grid');
        if (!container) return;
        container.innerHTML = '';
        if (this.generator.initBiomeRules) this.generator.initBiomeRules();

        for (let key in this.generator.biomes) {
            const b = this.generator.biomes[key];
            const bName = window.getBiomeName ? window.getBiomeName(key, b) : b.name;
            const rule = b.rule || { active: false, yMin: 0, yMax: 400, locked: false };
            const card = document.createElement('div');
            card.className = `biome-card ${this.generator.config.defaultBiome === key ? 'active' : ''}`;
            card.innerHTML = `
                <div class="biome-card-header">
                    <span class="biome-color-dot" style="background-color: ${b.color}"></span>
                    <span class="biome-name">${bName}</span>
                </div>
                <div class="biome-blocks">
                    ${b.blocks.map(bl => `<span class="block-tag">${bl}</span>`).join('')}
                </div>
                <div class="biome-rule" data-biome="${key}" style="margin-top: 8px; border-top: 1px dashed var(--border-color); padding-top: 6px;">
                    <label style="display: flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--text-muted); cursor: pointer;">
                        <input type="checkbox" class="rule-active" ${rule.active ? 'checked' : ''}>
                        <span>${window.t ? window.t('ruleActive') : 'Actif (règle de hauteur)'}</span>
                    </label>
                    <div class="rule-details" style="display: ${rule.active ? 'block' : 'none'}; margin-top: 6px;">
                        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 5px;">
                            <label style="font-size: 0.75rem; color: var(--text-muted); width: 24px;">Y-</label>
                            <input type="number" class="input-text rule-ymin" value="${rule.yMin}" min="0" max="1000" style="width: 64px; padding: 3px 6px; font-size: 0.8rem;" title="${window.t ? window.t('ruleYMinTip') : 'Couche basse : altitude minimale du biome'}">
                            <label style="font-size: 0.75rem; color: var(--text-muted); width: 24px; margin-left: 8px;">Y+</label>
                            <input type="number" class="input-text rule-ymax" value="${rule.yMax}" min="0" max="1000" style="width: 64px; padding: 3px 6px; font-size: 0.8rem;" title="${window.t ? window.t('ruleYMaxTip') : 'Couche haute : altitude maximale du biome'}">
                        </div>
                        <label style="display: flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--text-muted); cursor: pointer;">
                            <input type="checkbox" class="rule-locked" ${rule.locked ? 'checked' : ''}>
                            <span>🔒 ${window.t ? window.t('ruleLocked') : 'Prioritaire (bloque la peinture)'}</span>
                        </label>
                    </div>
                </div>
            `;

            // Clic sur la carte = choisir le biome par défaut (mais pas sur les contrôles de règle)
            card.addEventListener('click', (e) => {
                if (e.target.closest('.biome-rule')) return;
                document.querySelectorAll('#biomes-grid .biome-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                this.generator.config.defaultBiome = key;
                this.triggerRegeneration();
            });

            // ---- Contrôles de la règle ----
            const chkActive = card.querySelector('.rule-active');
            const chkLocked = card.querySelector('.rule-locked');
            const inpMin = card.querySelector('.rule-ymin');
            const inpMax = card.querySelector('.rule-ymax');
            const details = card.querySelector('.rule-details');

            chkActive.addEventListener('change', () => {
                if (this.generator.saveStateForUndo) this.generator.saveStateForUndo();
                b.rule.active = chkActive.checked;
                details.style.display = chkActive.checked ? 'block' : 'none';
                this.triggerRegeneration();
            });
            chkLocked.addEventListener('change', () => {
                b.rule.locked = chkLocked.checked;
            });
            const applyRange = () => {
                let yMin = parseInt(inpMin.value, 10);
                let yMax = parseInt(inpMax.value, 10);
                if (isNaN(yMin)) yMin = 0;
                if (isNaN(yMax)) yMax = 400;
                if (yMin > yMax) { [yMin, yMax] = [yMax, yMin]; inpMin.value = yMin; inpMax.value = yMax; }
                if (this.generator.saveStateForUndo) this.generator.saveStateForUndo();
                b.rule.yMin = yMin;
                b.rule.yMax = yMax;
                this.triggerRegeneration();
            };
            inpMin.addEventListener('change', applyRange);
            inpMax.addEventListener('change', applyRange);

            container.appendChild(card);
        }
    }

    renderEditorBiomes() {
        const container = document.getElementById('editor-biomes-grid');
        if (!container) return;
        container.innerHTML = '';

        for (let key in this.generator.biomes) {
            const b = this.generator.biomes[key];
            const bName = window.getBiomeName ? window.getBiomeName(key, b) : b.name;
            const btn = document.createElement('button');
            btn.className = `editor-biome-btn ${this.map2d.activeBiome === key ? 'active' : ''}`;
            btn.style.borderColor = b.color;
            btn.innerHTML = `
                <span class="color-preview" style="background-color: ${b.color}"></span>
                <span class="name">${bName}</span>
            `;
            btn.addEventListener('click', () => {
                document.querySelectorAll('#editor-biomes-grid .editor-biome-btn').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                this.map2d.activeBiome = key;
            });
            // Palette personnalisée : croix de suppression
            if (b.custom) {
                const del = document.createElement('span');
                del.textContent = '✕';
                del.title = window.t ? window.t('delPaletteTip') : 'Supprimer cette palette';
                del.style.cssText = 'position:absolute;top:2px;right:5px;color:#ef4444;font-size:0.7rem;cursor:pointer;font-weight:700;';
                del.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!confirm(window.t ? window.t('confirmDelPalette') : 'Supprimer cette palette ? Les zones peintes reviendront au biome par défaut.')) return;
                    if (this.generator.saveStateForUndo) this.generator.saveStateForUndo();
                    this.generator.removeCustomBiome(key);
                    if (this.map2d.activeBiome === key) this.map2d.activeBiome = this.generator.config.defaultBiome || 'plain';
                    this.renderEditorBiomes();
                    this.renderSettingsBiomes();
                    this.triggerRegeneration();
                });
                btn.style.position = 'relative';
                btn.appendChild(del);
            }
            container.appendChild(btn);
        }
    }

    /**
     * PALETTES PERSONNALISÉES : formulaire d'ajout (nom, couleur, blocs)
     */
    initPaletteForm() {
        const btnAdd = document.getElementById('btn-add-palette');
        const form = document.getElementById('palette-form');
        const inpName = document.getElementById('palette-name');
        const inpColor = document.getElementById('palette-color');
        const inpHex = document.getElementById('palette-color-hex');
        const inpBlocks = document.getElementById('palette-blocks');
        const btnSave = document.getElementById('btn-save-palette');
        const btnCancel = document.getElementById('btn-cancel-palette');
        if (!btnAdd || !form) return;

        btnAdd.addEventListener('click', () => {
            form.style.display = form.style.display === 'none' ? 'block' : 'none';
        });
        if (btnCancel) btnCancel.addEventListener('click', () => { form.style.display = 'none'; });
        // Synchronisation pipette <-> champ hexa
        if (inpColor && inpHex) {
            inpColor.addEventListener('input', () => { inpHex.value = inpColor.value; });
            inpHex.addEventListener('change', () => {
                let v = inpHex.value.trim();
                if (!v.startsWith('#')) v = '#' + v;
                if (/^#[0-9a-fA-F]{6}$/.test(v)) inpColor.value = v.toLowerCase();
                inpHex.value = inpColor.value;
            });
        }
        if (btnSave) btnSave.addEventListener('click', () => {
            const name = (inpName && inpName.value.trim()) || '';
            if (!name) { alert(window.t ? window.t('errPaletteName') : 'Donne un nom à ta palette !'); return; }
            const color = inpColor ? inpColor.value : '#a78bfa';
            const blocks = (inpBlocks && inpBlocks.value.trim())
                ? inpBlocks.value.split(',').map(s => s.trim()).filter(Boolean)
                : ['Grass Block'];
            const key = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
            if (this.generator.biomes[key]) { alert(window.t ? window.t('errPaletteExists') : 'Une palette porte déjà ce nom.'); return; }
            if (this.generator.saveStateForUndo) this.generator.saveStateForUndo();
            this.generator.addCustomBiome(key, name, color, blocks);
            form.style.display = 'none';
            if (inpName) inpName.value = '';
            if (inpBlocks) inpBlocks.value = '';
            this.renderEditorBiomes();
            this.renderSettingsBiomes();
            this.map2d.activeBiome = key;
            this.renderEditorBiomes();
            window.showToast && window.showToast('🎨 ' + name + (window.t && window.I18N && window.I18N.lang === 'en' ? ' palette added!' : ' ajoutée à tes palettes !'));
        });
    }

    /**
     * Presets et actions rapides (Reset, Save preset)
     */
    initPresetsAndActions() {
        const selectPreset = document.getElementById('select-preset');
        if (selectPreset) {
            selectPreset.innerHTML = `<option value="">${window.t ? window.t('presetDefault') : '-- Choisir un Preset --'}</option>`;
            for (let k in this.generator.presets) {
                const pName = window.getPresetName ? window.getPresetName(k, this.generator.presets[k]) : this.generator.presets[k].name;
                selectPreset.innerHTML += `<option value="${k}">${pName}</option>`;
            }

            // Charger presets depuis localStorage s'il y en a
            const saved = window.safeStorage.getItem('bloxd_custom_presets');
            if (saved) {
                try {
                    const custom = JSON.parse(saved);
                    for (let k in custom) {
                        this.generator.presets[k] = custom[k];
                        selectPreset.innerHTML += `<option value="${k}">⭐ ${custom[k].name}</option>`;
                    }
                } catch (e) {}
            }

            selectPreset.addEventListener('change', (e) => {
                if (e.target.value) {
                    if (this.generator && typeof this.generator.saveStateForUndo === 'function') this.generator.saveStateForUndo();
                    this.generator.loadPreset(e.target.value);
                    this.syncUIWithConfig();
                    if (typeof this.renderBiomesList === 'function') this.renderBiomesList();
                    this.map2d.render();
                    this.map3d.updateTerrain();
                    this.updateStatsBar();
                }
            });
        }

        const btnUndo = document.getElementById('btn-undo');
        const btnRedo = document.getElementById('btn-redo');
        if (btnUndo) btnUndo.addEventListener('click', () => window.triggerUndo());
        if (btnRedo) btnRedo.addEventListener('click', () => window.triggerRedo());

        const btnReset = document.getElementById('btn-reset');
        if (btnReset) btnReset.addEventListener('click', () => {
            if (this.generator && typeof this.generator.saveStateForUndo === 'function') this.generator.saveStateForUndo();
            if (this.generator.customEdits) this.generator.customEdits.clear();
            this.generator.generateGrid(false);
            this.map2d.render();
            this.map3d.updateTerrain();
            this.updateStatsBar();
        });

        const btnSavePreset = document.getElementById('btn-save-preset');
        if (btnSavePreset) btnSavePreset.addEventListener('click', () => {
            const name = prompt(window.t ? window.t('promptPresetName') : "Nom du Preset personnalisé :", window.t ? window.t('defaultPresetVal') : "Mon Univers Bloxd");
            if (!name) return;
            
            // Force synchronize UI values into config before saving
            const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
            const cfg = this.generator.config;
            if (getVal('cfg-world-x')) cfg.worldSizeX = parseInt(getVal('cfg-world-x')) || cfg.worldSizeX;
            if (getVal('cfg-world-z')) cfg.worldSizeZ = parseInt(getVal('cfg-world-z')) || cfg.worldSizeZ;
            if (getVal('cfg-seed')) cfg.seed = parseInt(getVal('cfg-seed')) || cfg.seed;
            if (getVal('cfg-base-y')) cfg.baseY = parseInt(getVal('cfg-base-y')) || cfg.baseY;
            if (getVal('cfg-sea-level')) cfg.seaLevel = parseInt(getVal('cfg-sea-level')) || cfg.seaLevel;
            if (getVal('cfg-min-h')) cfg.minHeight = parseInt(getVal('cfg-min-h')) || cfg.minHeight;
            if (getVal('cfg-max-h')) cfg.maxHeight = parseInt(getVal('cfg-max-h')) || cfg.maxHeight;
            if (getVal('cfg-noise-scale')) cfg.noiseScale = parseFloat(getVal('cfg-noise-scale')) || cfg.noiseScale;
            if (getVal('cfg-intensity')) cfg.terrainIntensity = parseInt(getVal('cfg-intensity')) || cfg.terrainIntensity;
            if (getVal('cfg-roughness')) cfg.roughness = parseFloat(getVal('cfg-roughness')) || cfg.roughness;

            const key = 'custom_' + Date.now();
            this.generator.presets[key] = {
                name: name,
                config: JSON.parse(JSON.stringify(this.generator.config)),
                biomes: JSON.parse(JSON.stringify(this.generator.biomes)),
                customEdits: this.generator.getSerializedCustomEdits()
            };

            // Save to localStorage
            let saved = JSON.parse(window.safeStorage.getItem('bloxd_custom_presets') || '{}');
            saved[key] = this.generator.presets[key];
            window.safeStorage.setItem('bloxd_custom_presets', JSON.stringify(saved));

            if (selectPreset) {
                selectPreset.innerHTML += `<option value="${key}" selected>⭐ ${name}</option>`;
            }
            alert(`${window.t ? window.t('presetSaved') : 'Preset sauvegardé avec succès : '}${name}`);
        });
    }

    /**
     * Synchronise les contrôles visuels du formulaire avec l'objet config actuel
     */
    update3dMeshBtn() {
        const btn3dMesh = document.getElementById('btn-3d-mesh');
        if (btn3dMesh) {
            btn3dMesh.textContent = this.generator.config.meshType === 'voxel' ? (window.t ? window.t('btn3dMeshVoxel') : '🧱 Voxel') : (window.t ? window.t('btn3dMeshSmooth') : '🟢 Lisse');
        }
    }
    
    syncUIWithConfig() {
        const cfg = this.generator.config;
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

        setVal('cfg-world-x', cfg.worldSizeX);
        setVal('cfg-world-z', cfg.worldSizeZ);
        setVal('cfg-seed', cfg.seed);
        setVal('cfg-base-y', cfg.baseY);
        setVal('cfg-sea-level', cfg.seaLevel);

        setVal('cfg-min-h', cfg.minHeight); setText('val-min-h', cfg.minHeight);
        this.update3dMeshBtn();
        setVal('cfg-max-h', cfg.maxHeight); setText('val-max-h', cfg.maxHeight);
        { const w = document.getElementById('max-h-warning'); if (w) w.style.display = cfg.maxHeight > 400 ? 'block' : 'none'; }
        setVal('cfg-noise-scale', cfg.noiseScale); setText('val-noise-scale', cfg.noiseScale);
        setVal('cfg-intensity', cfg.terrainIntensity); setText('val-intensity', cfg.terrainIntensity);
        setVal('cfg-roughness', cfg.roughness); setText('val-roughness', cfg.roughness);
    }

    /**
     * Déclenche la régénération du terrain et met à jour les 2 cartes
     */
    triggerRegeneration(preserveCustom = true) {
        this.generator.generateGrid(preserveCustom);
        this.map2d.render();
        this.map3d.updateTerrain();
        this.updateStatsBar();
    }

    /**
     * Met à jour la barre de statistiques (hauteurs min/max et compteurs de biomes)
     */
    updateStatsBar() {
        const stMin = document.getElementById('stat-min-h');
        const stMax = document.getElementById('stat-max-h');
        const stAvg = document.getElementById('stat-avg-h');
        if (stMin) stMin.textContent = `${this.generator.stats.minHeight}m`;
        if (stMax) stMax.textContent = `${this.generator.stats.maxHeight}m`;
        if (stAvg) stAvg.textContent = `${this.generator.stats.avgHeight}m`;
    }

    /**
     * Initialisation de la modale d'export (Télécharger le projet en ZIP / Script Python)
     */
    initExportModal() {
        const btnOpen = document.getElementById('btn-download-project');
        const modal = document.getElementById('export-modal');
        const btnClose = document.getElementById('btn-close-modal');
        const btnDownloadZip = document.getElementById('btn-do-download-zip');
        const inputFilename = document.getElementById('export-filename');
        const inputFoldername = document.getElementById('export-foldername');
        const inputAnchorX = document.getElementById('export-anchor-x');
        const inputAnchorY = document.getElementById('export-anchor-y');
        const inputAnchorZ = document.getElementById('export-anchor-z');

        if (!btnOpen || !modal) return;

        // Nettoie un nom de fichier/dossier saisi par l'utilisateur (retire l'extension
        // éventuelle et les caractères invalides sur la plupart des systèmes de fichiers)
        const sanitizeName = (raw, fallback) => {
            let n = (raw || "").trim().replace(/\.bloxdschem$/i, "").replace(/[\\/:*?"<>|]/g, "");
            return n.length > 0 ? n : fallback;
        };

        btnOpen.addEventListener('click', () => {
            modal.classList.add('active');
        });

        if (btnClose) btnClose.addEventListener('click', () => modal.classList.remove('active'));
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });

        if (btnDownloadZip) btnDownloadZip.addEventListener('click', async () => {
            btnDownloadZip.disabled = true;
            btnDownloadZip.innerHTML = '<i class="fas fa-cog fa-spin"></i> Génération directe du schématique...';

            try {
                // STYLE PIXELISE : lit la case à cocher de la modale
                const chkPix = document.getElementById('export-pixelated');
                this.generator.config.pixelatedExport = !!(chkPix && chkPix.checked);
                // MONO-FICHIER FORCÉ : pour outils externes hors Bloxd
                const chkSingle = document.getElementById('export-single-file');
                this.generator.config.forceSingleSchem = !!(chkSingle && chkSingle.checked);
                const schemBytes = this.generator.exportSchematicBinary();
                const anchorX = parseInt(inputAnchorX?.value, 10) || 0;
                const anchorY = parseInt(inputAnchorY?.value, 10) || 0;
                const anchorZ = parseInt(inputAnchorZ?.value, 10) || 0;

                if (!schemBytes.splitFiles || schemBytes.splitFiles.length <= 1) {
                    // Téléchargement direct et unique du fichier .bloxdschem sans rien d'autre
                    const filename = sanitizeName(inputFilename?.value, "monde_personnalise");
                    const blob = new Blob([schemBytes], { type: "application/octet-stream" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${filename}.bloxdschem`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                } else {
                    // Si le monde est grand (>180 chunks), on regroupe les parties dans un ZIP
                    const foldername = sanitizeName(inputFoldername?.value, "schematics_decoupes");
                    const zip = new JSZip();
                    const schemFolder = zip.folder(foldername);
                    let guideTxt = (window.t && window.I18N && window.I18N.lang === 'en') ? window.t('guideSplitHeader') : "============================================================\n📦 MONDE DÉCOUPÉ EN PARTIES (<200 CHUNKS/FICHIER)\n";
                    guideTxt += "============================================================\n\n";
                    guideTxt += "Ce monde étant volumineux, il a été découpé en plusieurs fichiers pour respecter\n";
                    guideTxt += "la limite technique de Bloxd.io (~200 chunks maximum par commande //schematic load).\n\n";
                    guideTxt += "⚠️ IMPORTANT : Bloxd.io ne repositionne PAS automatiquement chaque partie à sa\n";
                    guideTxt += "place dans le monde (comme le fait aussi l'outil officiel M2B pour ses schematics\n";
                    guideTxt += "découpés) : c'est à VOUS de vous déplacer entre deux chargements, sinon toutes\n";
                    guideTxt += "les parties se superposent au même endroit.\n\n";
                    guideTxt += "Chaque fichier est nommé numéro_[posX,posY,posZ], où posX/posY/posZ correspond à\n";
                    guideTxt += "la position (dans le monde Bloxd) de l'angle où poser ce schéma, calculée à partir\n";
                    guideTxt += `de la position d'ancrage que vous avez choisie (${anchorX}, ${anchorY}, ${anchorZ}).\n\n`;
                    guideTxt += "INSTRUCTIONS D'IMPORTATION :\n";
                    guideTxt += `1. Placez tous les fichiers .bloxdschem du dossier "${foldername}" dans le répertoire schématiques de Bloxd.\n`;
                    guideTxt += "2. En jeu, rendez-vous à la position de l'angle de collage indiquée dans le nom du 1er fichier.\n";
                    guideTxt += "3. Pour chaque fichier ci-dessous, déplacez-vous à la position [posX,posY,posZ] indiquée dans\n";
                    guideTxt += "   son nom, PUIS chargez-le :\n\n";
                    guideTxt += "🚨 RÈGLE D'OR — ALTITUDE Y CONSTANTE :\n";
                    guideTxt += "Bloxd colle chaque schéma PAR RAPPORT À VOTRE POSITION, Y COMPRIS VOTRE HAUTEUR !\n";
                    guideTxt += `Chargez TOUTES les parties depuis EXACTEMENT la même altitude Y=${anchorY}.\n`;
                    guideTxt += "Si vous marchez sur le terrain déjà généré (dunes, collines...), votre Y varie et\n";
                    guideTxt += "la partie suivante sera DÉCALÉE VERTICALEMENT (falaises de roche, sable surélevé).\n";
                    guideTxt += "👉 Astuce : passez en vol (/fly ou mode créatif), placez-vous à Y exact affiché\n";
                    guideTxt += "   à l'écran, et vérifiez ce Y avant CHAQUE //schematic load.\n\n";

                    schemBytes.splitFiles.forEach((file, idx) => {
                        const posX = anchorX + (file.offsetX || 0);
                        const posY = anchorY;
                        const posZ = anchorZ + (file.offsetZ || 0);
                        const schemName = `${idx + 1}_[${posX},${posY},${posZ}]`;
                        schemFolder.file(`${schemName}.bloxdschem`, file.bytes);
                        guideTxt += `   [${schemName}] Position : X=${posX}, Y=${posY}, Z=${posZ}\n`;
                        guideTxt += `   //schematic load ${schemName}\n\n`;
                    });

                    zip.file("GUIDE_CHARGEMENT_PARTIES.txt", guideTxt);
                    const blob = await zip.generateAsync({ type: "blob" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${foldername}.zip`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
            } catch (err) {
                console.error("Erreur lors de la génération du fichier .bloxdschem:", err);
                alert(window.t ? window.t('errSchemGen') : "Erreur lors de la création du fichier .bloxdschem.");
            } finally {
                btnDownloadZip.disabled = false;
                btnDownloadZip.innerHTML = '<i class="fas fa-download"></i> Télécharger le fichier .bloxdschem';
            }
        });
    }

    getDirectGuideContent() {
        if (window.t && window.I18N && window.I18N.lang === 'en') return window.t('directGuideContent');
        return `============================================================
📦 GUIDE D'IMPORTATION DIRECTE DANS BLOXD.IO
============================================================

Félicitations ! Votre monde a été généré en direct par Bloxd Terrain Editor sans avoir besoin de code Python.
Le fichier schématique prêt à l'emploi est situé dans le dossier "schematics" :
👉 monde_personnalise.bloxdschem

MODE D'EMPLOI EN 3 ÉTAPES SIMPLES :
1. Lancez Bloxd.io dans votre navigateur internet.
2. Placez le fichier "monde_personnalise.bloxdschem" dans votre dossier de schématiques Bloxd (ou utilisez un proxy/mod compatible).
3. Ouvrez le tchat en jeu et tapez la commande :
   //schematic load monde_personnalise

Et voilà ! Votre terrain apparaîtra instantanément dans le jeu.
============================================================
Note pour les développeurs : Si vous préférez exécuter les scripts manuellement, 
ils sont conservés dans le dossier "options_avancees_python/".
`;
    }

    getReadmeContent() {
        if (window.t && window.I18N && window.I18N.lang === 'en') return window.t('readmeHeader');
        return `# 📦 Projet Terrain Bloxd.io Personnalisé
Généré depuis l'application **Bloxd Terrain Editor**

## 🚀 Contenu de l'archive
- \`generate_terrain.py\` : Script de génération configuré avec vos paramètres exacts et biomes.
- \`bloxd_format.py\` : Moteur d'écriture binaire Avro (.bloxdschem).
- \`nameToId.json\` : Table de mapping des ID de blocs Bloxd.io.

## 🛠️ Comment générer votre carte sur votre ordinateur
1. Assurez-vous d'avoir Python 3 installé avec \`numpy\` :
   \`\`\`bash
   pip install numpy
   \`\`\`
2. Exécutez le générateur :
   \`\`\`bash
   python generate_terrain.py
   \`\`\`
3. Un fichier **\`custom_terrain.bloxdschem\`** sera généré en quelques secondes.

## 🎮 Comment importer dans Bloxd.io
1. Lancez Bloxd.io dans votre navigateur (mode Créatif ou serveur Worlds avec permissions).
2. Placez le fichier \`custom_terrain.bloxdschem\` ou utilisez un mod/proxy compatible avec les commandes de schématiques de Bloxd.
3. Chargez le schématique en jeu via la commande :
   \`//schematic load custom_terrain\`

Profitez de votre nouveau monde Bloxd ! 🌟
`;
    }

    getBloxdFormatPyContent() {
        return `"""
Low-level .bloxdschem (Avro-based) binary writer.
Reverse engineered from Bloxd.io schematic converter.
"""
import struct

def _uvarint(n: int) -> bytes:
    out = bytearray()
    n = int(n)
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            break
    return bytes(out)

def avro_int(n: int) -> bytes:
    n = int(n)
    zz = (n << 1) if n >= 0 else ((-n << 1) - 1)
    return _uvarint(zz)

def avro_string(s: str) -> bytes:
    b = s.encode("utf-8")
    return avro_int(len(b)) + b

def avro_bytes(b: bytes) -> bytes:
    return avro_int(len(b)) + b

class BloxdSchemWriter:
    def __init__(self, f, name: str, size_x: int, size_y: int, size_z: int, pos=(0, 0, 0)):
        self.f = f
        self._chunk_count = 0
        self._buffer = bytearray()
        self._flush_every = 512
        self.f.write(b"\\x00\\x00\\x00\\x00")
        self.f.write(avro_string(name))
        self.f.write(avro_int(pos[0]))
        self.f.write(avro_int(pos[1]))
        self.f.write(avro_int(pos[2]))
        self.f.write(avro_int(size_x))
        self.f.write(avro_int(size_y))
        self.f.write(avro_int(size_z))

    def add_chunk(self, cx: int, cy: int, cz: int, rle_bytes: bytes):
        self._buffer += avro_int(cx)
        self._buffer += avro_int(cy)
        self._buffer += avro_int(cz)
        self._buffer += avro_bytes(rle_bytes)
        self._chunk_count += 1
        if self._chunk_count >= self._flush_every:
            self._flush_block()

    def _flush_block(self):
        if self._chunk_count == 0: return
        self.f.write(avro_int(self._chunk_count))
        self.f.write(bytes(self._buffer))
        self._buffer = bytearray()
        self._chunk_count = 0

    def finish(self):
        self._flush_block()
        self.f.write(avro_int(0))
`;
    }

    getFallbackNameToId() {
        return {
            "Air": 0, "Dirt": 2, "Grass Block": 4, "Sand": 5, "Clay": 6, "Snow": 8,
            "Stone": 28, "Smooth Stone": 31, "Lime Wool": 56, "Green Wool": 64,
            "Lime Baked Clay": 73, "Green Baked Clay": 81, "Orange Baked Clay": 69,
            "Lime Concrete": 91, "Green Concrete": 98, "White Concrete": 97,
            "Yellow Concrete": 99, "Black Concrete": 86, "Water": 126,
            "Stone Bricks": 129, "Cracked Stone Bricks": 136, "Smooth Sandstone": 137,
            "Obsidian": 140, "Packed Snow": 8, "Sandstone": 38,
            "Baked Clay": 67, "Red Baked Clay": 82, "Dark Red Brick": 130, "Dark Red Stone": 131,
            "Smooth Red Sandstone": 475, "Red Sand": 650, "Magma": 471, "Cherry Log": 1222
        };
    }
}
window.UIManager = UIManager;

window.showToast = function(msg) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'app-toast';
        toast.style.cssText = "position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.95); color: #38bdf8; border: 1px solid #38bdf8; padding: 10px 22px; border-radius: 30px; font-weight: 600; font-size: 0.95rem; z-index: 10000; box-shadow: 0 4px 15px rgba(0,0,0,0.5); transition: opacity 0.3s ease; pointer-events: none;";
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    if (window._toastTimer) clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 1500);
};

window.triggerUndo = function() {
    if (!window.generatorInstance || typeof window.generatorInstance.undo !== 'function') return;
    const success = window.generatorInstance.undo();
    if (!success) return;
    if (window.uiManagerInstance) window.uiManagerInstance.syncUIWithConfig();
    if (window.map2dInstance) window.map2dInstance.render();
    if (window.map3dInstance) window.map3dInstance.updateTerrain();
    if (window.uiManagerInstance) window.uiManagerInstance.updateStatsBar();
    window.showToast(window.t ? window.t('toastUndo') : "↩️ Action annulée (Undo)");
};

window.triggerRedo = function() {
    if (!window.generatorInstance || typeof window.generatorInstance.redo !== 'function') return;
    const success = window.generatorInstance.redo();
    if (!success) return;
    if (window.uiManagerInstance) window.uiManagerInstance.syncUIWithConfig();
    if (window.map2dInstance) window.map2dInstance.render();
    if (window.map3dInstance) window.map3dInstance.updateTerrain();
    if (window.uiManagerInstance) window.uiManagerInstance.updateStatsBar();
    window.showToast(window.t ? window.t('toastRedo') : "↪️ Action rétablie (Redo)");
};

if (!window._undoShortcutsBound) {
    window._undoShortcutsBound = true;
    window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
            return;
        }
        // Ces raccourcis ne s'appliquent qu'à l'Éditeur, pas aux Paramètres (Settings) !
        if (!window.map2dInstance || window.map2dInstance.activeTab === 'settings') {
            return;
        }
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z' || e.code === 'KeyZ')) {
            e.preventDefault();
            window.triggerUndo();
        } else if (((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y' || e.code === 'KeyY')) ||
                   ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z' || e.code === 'KeyZ'))) {
            e.preventDefault();
            window.triggerRedo();
        }
    });
}