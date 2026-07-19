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
 * Module : map3d.js
 * Rôle : Visualisation 3D interactive du terrain avec Three.js (mesh Voxel en escaliers ou Lisse, eau, éclairage)
 */

class Map3D {
    constructor(containerId, generator) {
        this.container = document.getElementById(containerId);
        this.generator = generator;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this.terrainMesh = null;
        this.waterMesh = null;
        this.wireframeMesh = null;

        this.showWireframe = false;
        this.animFrameId = null;

        // TACHE 1 : rendu à la demande (dirty flag) + pause quand invisible
        this._needsRender = true;   // au moins un rendu au démarrage
        this._wasHidden = false;    // détecte la transition invisible -> visible

        this.init();
    }

    /**
     * Initialisation de la scène Three.js, caméra, renderer, lumières et contrôles
     */
    init() {
        if (!this.container || typeof THREE === 'undefined') {
            console.error("Three.js non disponible ou conteneur introuvable !");
            return;
        }

        const width = this.container.clientWidth || 600;
        const height = this.container.clientHeight || 400;

        // 1. Scène
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#0f111a'); // Thème sombre voxel
        this.scene.fog = new THREE.FogExp2('#0f111a', 0.0012);

        // 2. Caméra
        this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 10000);
        this.camera.position.set(0, 350, 450);

        // 3. Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.innerHTML = '';
        this.container.appendChild(this.renderer.domElement);

        // 4. Lumières
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xfffaed, 0.9);
        sunLight.position.set(300, 600, 400);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 1024;
        sunLight.shadow.mapSize.height = 1024;
        sunLight.shadow.camera.near = 50;
        sunLight.shadow.camera.far = 1500;
        const d = 500;
        sunLight.shadow.camera.left = -d;
        sunLight.shadow.camera.right = d;
        sunLight.shadow.camera.top = d;
        sunLight.shadow.camera.bottom = -d;
        this.scene.add(sunLight);

        // Lumière d'appoint d'horizon (bleutée)
        const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x1e293b, 0.35);
        this.scene.add(hemiLight);

        // 5. OrbitControls
        if (typeof THREE.OrbitControls !== 'undefined') {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        } else if (typeof OrbitControls !== 'undefined') {
            this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        }

        if (this.controls) {
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.08;
            this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
            this.controls.target.set(0, 80, 0);
            this.controls.update();
            // TACHE 1 : OrbitControls émet 'change' à chaque mouvement de caméra,
            // y compris pendant la décélération du damping -> on ne rend que
            // quand l'image peut réellement changer.
            if (typeof this.controls.addEventListener === 'function') {
                this.controls.addEventListener('change', () => { this._needsRender = true; });
            } else {
                // Fallback : sans EventDispatcher on rend à chaque frame (comportement historique)
                this._alwaysRender = true;
            }

            // ZOOM TRAVERSANT (fix "impossible de continuer à zoomer") :
            // le dolly d'OrbitControls est multiplicatif autour d'une cible FIXE :
            // près de la cible, chaque cran de molette n'avance presque plus et
            // le zoom semble bloqué. Ici, quand on zoome en étant déjà proche,
            // on POUSSE la cible vers l'avant le long du regard -> zoom sans fin.
            this.renderer.domElement.addEventListener('wheel', (e) => {
                if (!this.controls || !this.camera) return;
                if (e.deltaY >= 0) return; // on ne traite que le zoom AVANT
                const cam = this.camera.position, tgt = this.controls.target;
                const dx = tgt.x - cam.x, dy = tgt.y - cam.y, dz = tgt.z - cam.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist < 30) {
                    // Avance la cible de ~40% de la distance restante (borné)
                    const step = Math.max(2, dist * 0.4);
                    const inv = step / (dist || 1);
                    tgt.x += dx * inv; tgt.y += dy * inv; tgt.z += dz * inv;
                    this.controls.update();
                    this._needsRender = true;
                }
            }, { passive: true });
        }

        // 7. Raycaster 3D & Curseur Pinceau penché selon la pente
        this.raycaster = new THREE.Raycaster();
        this.mouse3D = new THREE.Vector2();
        
        // VISIBILITE : anneau plus épais, rendu par-dessus le terrain
        // (depthTest: false) avec liseré noir pour contraster sur tout biome
        const ringGeom = new THREE.RingGeometry(0.72, 1.0, 48);
        ringGeom.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x10b981,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
            depthWrite: false
        });
        this.brushCursor3D = new THREE.Mesh(ringGeom, ringMat);
        this.brushCursor3D.renderOrder = 999;
        const ringOutlineGeom = new THREE.RingGeometry(1.0, 1.12, 48);
        ringOutlineGeom.rotateX(-Math.PI / 2);
        const ringOutline = new THREE.Mesh(ringOutlineGeom, new THREE.MeshBasicMaterial({
            color: 0x000000, side: THREE.DoubleSide, transparent: true, opacity: 0.7,
            depthTest: false, depthWrite: false
        }));
        ringOutline.renderOrder = 998;
        this.brushCursor3D.add(ringOutline);
        this.brushCursor3D.visible = false;
        this.scene.add(this.brushCursor3D);

        this.init3DInteractiveEvents();

        // 6. Gestion du redimensionnement
        window.addEventListener('resize', () => this.resize());

        this.animate();
    }

    init3DInteractiveEvents() {
        const dom = this.renderer.domElement;
        
        dom.addEventListener('mousemove', (e) => {
            if (!window.map2dInstance || window.map2dInstance.activeTab !== 'editor') {
                if (this.brushCursor3D && this.brushCursor3D.visible) {
                    this.brushCursor3D.visible = false;
                    this._needsRender = true;
                }
                return;
            }

            const rect = dom.getBoundingClientRect();
            const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            this.mouse3D.set(mx, my);

            if (!this.terrainMesh) return;
            this.raycaster.setFromCamera(this.mouse3D, this.camera);
            const _rt1 = (this.detailGroup && this.detailGroup.visible) ? [this.terrainMesh, this.detailGroup] : [this.terrainMesh];
            const intersects = this.raycaster.intersectObjects(_rt1, true);

            if (intersects.length > 0) {
                const hit = intersects[0];
                const point = hit.point;
                const normal = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);

                this.brushCursor3D.visible = true;
                const radiusBlocks = window.map2dInstance.brushRadius || 4;
                const scale = 3.5;
                const worldRadius = radiusBlocks * scale;
                this.brushCursor3D.scale.set(worldRadius, worldRadius, worldRadius);

                this.brushCursor3D.position.copy(point).addScaledVector(normal, 0.6);
                this.brushCursor3D.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
                this._needsRender = true;

                const tool = window.map2dInstance.activeTool;
                let hexColor = 0xffffff;
                if (tool === 'raise') hexColor = 0x10b981;
                else if (tool === 'lower') hexColor = 0xef4444;
                else if (tool === 'smooth') hexColor = 0xf59e0b;
                else if (tool === 'flatten') hexColor = 0x8b5cf6;
                else if (tool === 'sphere' || tool === 'box') hexColor = 0xa78bfa;
                else if (tool === 'eraser') hexColor = 0xec4899;
                else if (tool === 'biome') {
                    const bKey = window.map2dInstance.activeBiome || 'plain';
                    const bHex = this.generator.biomes[bKey]?.color || '#ffffff';
                    hexColor = parseInt(bHex.replace('#',''), 16);
                }
                this.brushCursor3D.material.color.setHex(hexColor);

                if (this.isPainting3D) {
                    this.applyBrush3D(point, normal, tool, radiusBlocks, window.map2dInstance.brushIntensity || 15, window.map2dInstance.activeBiome || 'plain');
                }
            } else {
                if (this.brushCursor3D.visible) this._needsRender = true;
                this.brushCursor3D.visible = false;
            }
        });

        const handleDown = (e) => {
            if (e.button === 0 && window.map2dInstance && window.map2dInstance.activeTab === 'editor' && !e.shiftKey && !e.ctrlKey) {
                if (this.controls) this.controls.enabled = false;
                e.stopPropagation(); // EMPÊCHE ORBITCONTROLS DE TOURNER LA CAMÉRA LORS DU CLIC GAUCHE EN ÉDITEUR !
                this.isPainting3D = true;
                this.firstClickH3D = null; // capturé au 1er point touché (outil Aplatir)
                this._stampDone3D = false; // nouvelle pose de forme autorisée
                if (this.generator && typeof this.generator.saveStateForUndo === 'function') {
                    this.generator.saveStateForUndo();
                }
                if (this.brushCursor3D && this.brushCursor3D.visible) {
                    this.raycaster.setFromCamera(this.mouse3D, this.camera);
                    const _rt2 = (this.detailGroup && this.detailGroup.visible) ? [this.terrainMesh, this.detailGroup] : [this.terrainMesh];
                    const intersects = this.raycaster.intersectObjects(_rt2, true);
                    if (intersects.length > 0) {
                        this.applyBrush3D(intersects[0].point, intersects[0].face.normal, window.map2dInstance.activeTool, window.map2dInstance.brushRadius || 4, window.map2dInstance.brushIntensity || 15, window.map2dInstance.activeBiome || 'plain');
                    }
                }
            }
        };
        dom.addEventListener('pointerdown', handleDown, { capture: true });
        dom.addEventListener('mousedown', handleDown, { capture: true });

        const handleUp = (e) => {
            if (this.isPainting3D) {
                this.isPainting3D = false;
                this.firstClickH3D = null;
                if (this.controls) this.controls.enabled = true;
                this.updateTerrain();
                if (window.map2dInstance) window.map2dInstance.render();
                if (window.uiManagerInstance) window.uiManagerInstance.updateStatsBar();
            }
            if (this.controls && !this.controls.enabled && window.map2dInstance && window.map2dInstance.activeTab === 'editor') {
                this.controls.enabled = true;
            }
        };
        window.addEventListener('pointerup', handleUp, { capture: true });
        window.addEventListener('mouseup', handleUp, { capture: true });
    }

    applyBrush3D(point, normal, tool, radius, intensity, activeBiome) {
        if (!this.generator || !this.generator.grid || !this.generator.grid.length) return;
        const grid = this.generator.grid;
        const resX = grid.length;
        const resZ = grid[0] ? grid[0].length : 0;
        const scale = 3.5;
        const halfSizeX = (resX * scale) / 2;
        const halfSizeZ = (resZ * scale) / 2;

        const centerGx = Math.floor((point.x + halfSizeX) / scale);
        const centerGz = Math.floor((point.z + halfSizeZ) / scale);

        // TAMPONS 3D : sphère / pavé posés une fois par clic
        if (tool === 'sphere' || tool === 'box') {
            if (this._stampDone3D) return;
            this._stampDone3D = true;
            const p = (window.uiManagerInstance && window.uiManagerInstance.stampParams) || { w: 16, d: 16, h: 20, paintBiome: true };
            const ok = this.generator.applyStamp(centerGx, centerGz, tool, p.w, p.d, p.h, p.paintBiome ? activeBiome : null);
            if (ok) {
                // p.w/p.d sont en blocs : la zone modifiée réelle est lastBrushRegion (cellules)
                const reg = this.generator.lastBrushRegion || { gxMin: centerGx - 2, gxMax: centerGx + 2, gzMin: centerGz - 2, gzMax: centerGz + 2 };
                this.updateTerrainRegion(reg.gxMin - 1, reg.gxMax + 1, reg.gzMin - 1, reg.gzMax + 1);
                if (window.map2dInstance) {
                    if (typeof window.map2dInstance.requestRender === 'function') window.map2dInstance.requestRender();
                    else window.map2dInstance.render();
                }
            }
            return;
        }

        // Outil Aplatir : mémorise la hauteur du tout premier point touché du geste
        if (tool === 'flatten' && (this.firstClickH3D === null || this.firstClickH3D === undefined)) {
            if (centerGx >= 0 && centerGx < resX && centerGz >= 0 && centerGz < resZ && grid[centerGx] && grid[centerGx][centerGz]) {
                this.firstClickH3D = grid[centerGx][centerGz].height;
            }
        }

        let modified = false;

        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                let dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > radius) continue;

                let gx = centerGx + dx;
                let gz = centerGz + dz;
                if (gx < 0 || gx >= resX || gz < 0 || gz >= resZ) continue;

                let cell = grid[gx][gz];
                let falloff = 1.0 - (dist / (radius + 1));
                
                let slopeBonus = 1.0;
                if (radius > 0 && normal) {
                    slopeBonus = 1.0 + ((dx * normal.x + dz * normal.z) / radius) * 0.75;
                }
                let step = intensity * falloff * 0.5 * Math.max(0.3, slopeBonus);

                if (tool === 'raise') {
                    cell.height = Math.min(this.generator.config.maxHeight, cell.height + step);
                    cell.isCustomHeight = true;
                    modified = true;
                } else if (tool === 'lower') {
                    cell.height = Math.max(this.generator.config.minHeight, cell.height - step);
                    cell.isCustomHeight = true;
                    modified = true;
                } else if (tool === 'flatten' && this.firstClickH3D !== null && this.firstClickH3D !== undefined) {
                    cell.height = cell.height + (this.firstClickH3D - cell.height) * falloff;
                    cell.isCustomHeight = true;
                    modified = true;
                } else if (tool === 'biome') {
                    // REGLE PRIORITAIRE : respecter les règles de hauteur verrouillées
                    const lockedBy = this.generator.isBiomePaintBlocked ? this.generator.isBiomePaintBlocked(cell.height) : null;
                    if (lockedBy && lockedBy !== activeBiome) continue;
                    cell.biome = activeBiome;
                    cell.isCustomBiome = true;
                    modified = true;
                } else if (tool === 'eraser') {
                    let procH = this.generator.fbmTerrain(cell.worldX, cell.worldZ);
                    procH = Math.round(Math.max(this.generator.config.minHeight, Math.min(this.generator.config.maxHeight, procH)));
                    cell.height = procH;
                    cell.biome = this.generator.assignBiomeProcedural(procH, cell.worldX, cell.worldZ);
                    cell.isCustomHeight = false;
                    cell.isCustomBiome = false;
                    modified = true;
                    if (this.generator.removeCustomEdit) this.generator.removeCustomEdit(cell.worldX, cell.worldZ);
                }

                if (tool !== 'eraser' && modified) {
                    if (this.generator.setCustomEdit) this.generator.setCustomEdit(cell.worldX, cell.worldZ, cell.isCustomHeight ? cell.height : null, cell.isCustomBiome ? cell.biome : null);
                }
            }
        }

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
                                sum += grid[mx][mz].height;
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
                        let cell = grid[gx][gz];
                        cell.height = Math.round(tempH[gx][gz]);
                        cell.isCustomHeight = true;
                        modified = true;
                        if (this.generator.setCustomEdit) this.generator.setCustomEdit(cell.worldX, cell.worldZ, cell.height, cell.isCustomBiome ? cell.biome : null);
                    }
                }
            }
        }

        if (modified) {
            if (!this._lastPaint3DTime || Date.now() - this._lastPaint3DTime > 45) {
                this._lastPaint3DTime = Date.now();
                // TACHE 2 : chemin partiel (fallback interne en rebuild si voxel).
                // +1 : l'outil smooth lit les voisins immédiats de la zone.
                this.updateTerrainRegion(centerGx - radius - 1, centerGx + radius + 1,
                                         centerGz - radius - 1, centerGz + radius + 1);
                // requestRender : coalescé et sauté si la section 2D est masquée
                if (window.map2dInstance) {
                    if (typeof window.map2dInstance.requestRender === 'function') window.map2dInstance.requestRender();
                    else window.map2dInstance.render();
                }
            }
        }
    }

    /**
     * Gère le redimensionnement du conteneur parent
     */
    resize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width === 0 || height === 0) return;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this._needsRender = true;
    }

    /**
     * Réinitialise la caméra 3D vers une vue isométrique globale
     */
    resetCamera() {
        if (!this.camera || !this.controls) return;
        const extent = this.generator.config.gridResolution * 2.5;
        this.camera.position.set(0, extent * 0.95, extent * 1.1);
        this.controls.target.set(0, this.generator.config.baseY || 80, 0);
        this.controls.update();
        this._needsRender = true;
    }

    /**
     * Met à jour ou régénère la géométrie 3D selon la grille du générateur
     */

    /**
     * Convertit la couleur du biome d'une cellule en THREE.Color (avec ombrage selon la hauteur).
     * GRADIENT DE BIOMES : si grid/gx/gz sont fournis et qu'un voisin (rayon 2) a un biome
     * different, les couleurs sont melangees (moyenne ponderee par la distance) pour une
     * transition progressive entre les biomes, comme sur la carte 2D.
     */
    getCellColor(cell, grid, gx, gz) {
        const biomeObj = (this.generator && this.generator.biomes && this.generator.biomes[cell.biome]) || null;
        const c = new THREE.Color(biomeObj ? biomeObj.color : '#4ade80');

        if (grid && gx !== undefined && gz !== undefined) {
            const resX = grid.length, resZ = grid[0] ? grid[0].length : 0;
            let hasDiff = false;
            for (let dx = -1; dx <= 1 && !hasDiff; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const nx = gx + dx, nz = gz + dz;
                    if (nx < 0 || nx >= resX || nz < 0 || nz >= resZ) continue;
                    if (grid[nx][nz].biome !== cell.biome) { hasDiff = true; break; }
                }
            }
            if (hasDiff) {
                const R = 2;
                let r = 0, g = 0, b = 0, wSum = 0;
                for (let dx = -R; dx <= R; dx++) {
                    for (let dz = -R; dz <= R; dz++) {
                        const nx = gx + dx, nz = gz + dz;
                        if (nx < 0 || nx >= resX || nz < 0 || nz >= resZ) continue;
                        const d = Math.sqrt(dx * dx + dz * dz);
                        if (d > R) continue;
                        const w = 1 / (1 + d * d);
                        const nBio = this.generator.biomes[grid[nx][nz].biome];
                        const nc = new THREE.Color(nBio ? nBio.color : '#4ade80');
                        r += nc.r * w; g += nc.g * w; b += nc.b * w; wSum += w;
                    }
                }
                c.r = r / wSum; c.g = g / wSum; c.b = b / wSum;
            }
        }

        const maxH = Math.max(1, (this.generator && this.generator.config && this.generator.config.maxHeight) || 400);
        const shade = 0.72 + 0.28 * Math.min(1, Math.max(0, cell.height / maxH));
        c.multiplyScalar(shade);
        return c;
    }

    /**
     * Géométrie lissée : grille de sommets partagés (heightmap classique)
     */
    buildSmoothGeometry(grid, resX, resZ, scale, halfSizeX, halfSizeZ) {
        const positions = new Float32Array(resX * resZ * 3);
        const colors = new Float32Array(resX * resZ * 3);
        const indices = [];

        for (let gx = 0; gx < resX; gx++) {
            for (let gz = 0; gz < resZ; gz++) {
                const cell = grid[gx][gz];
                const i = (gx * resZ + gz) * 3;
                positions[i] = gx * scale - halfSizeX;
                positions[i + 1] = cell.height;
                positions[i + 2] = gz * scale - halfSizeZ;
                const col = this.getCellColor(cell, grid, gx, gz);
                colors[i] = col.r; colors[i + 1] = col.g; colors[i + 2] = col.b;
            }
        }

        for (let gx = 0; gx < resX - 1; gx++) {
            for (let gz = 0; gz < resZ - 1; gz++) {
                const a = gx * resZ + gz;
                const b = (gx + 1) * resZ + gz;
                const c = (gx + 1) * resZ + (gz + 1);
                const d = gx * resZ + (gz + 1);
                indices.push(a, d, b, b, d, c);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        this._cellRanges = null; // le sink ne concerne que le mode voxel
        return geometry;
    }

    /**
     * Géométrie voxel en marches d'escalier : dessus plat par cellule + jupes verticales
     * entre cellules voisines de hauteurs différentes (style Bloxd/Minecraft)
     */
    buildVoxelSteppedGeometry(grid, resX, resZ, scale, halfSizeX, halfSizeZ) {
        const positions = [];
        const colors = [];
        // Plages de vertices par cellule : permet d'enfoncer/restaurer le
        // plateau d'une cellule sous les chunks de détail (_syncCoarseSink)
        const cellRanges = new Map();

        const pushQuad = (v0, v1, v2, v3, col) => {
            // Deux triangles (v0,v1,v2) et (v0,v2,v3)
            positions.push(
                v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2],
                v0[0], v0[1], v0[2], v2[0], v2[1], v2[2], v3[0], v3[1], v3[2]
            );
            for (let k = 0; k < 6; k++) colors.push(col.r, col.g, col.b);
        };

        for (let gx = 0; gx < resX; gx++) {
            for (let gz = 0; gz < resZ; gz++) {
                const cell = grid[gx][gz];
                const _cellStart = positions.length;
                const h = cell.height;
                const x0 = gx * scale - halfSizeX;
                const x1 = x0 + scale;
                const z0 = gz * scale - halfSizeZ;
                const z1 = z0 + scale;
                const col = this.getCellColor(cell, grid, gx, gz);

                // Face du dessus (plateau plat)
                pushQuad([x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0], col);

                // Jupe verticale côté +X si le voisin est plus bas
                const sideCol = col.clone().multiplyScalar(0.78);
                if (gx + 1 < resX) {
                    const nh = grid[gx + 1][gz].height;
                    if (nh < h) pushQuad([x1, h, z0], [x1, h, z1], [x1, nh, z1], [x1, nh, z0], sideCol);
                }
                // Jupe verticale côté -X
                if (gx - 1 >= 0) {
                    const nh = grid[gx - 1][gz].height;
                    if (nh < h) pushQuad([x0, h, z1], [x0, h, z0], [x0, nh, z0], [x0, nh, z1], sideCol);
                }
                // Jupe verticale côté +Z
                if (gz + 1 < resZ) {
                    const nh = grid[gx][gz + 1].height;
                    if (nh < h) pushQuad([x1, h, z1], [x0, h, z1], [x0, nh, z1], [x1, nh, z1], sideCol);
                }
                // Jupe verticale côté -Z
                if (gz - 1 >= 0) {
                    const nh = grid[gx][gz - 1].height;
                    if (nh < h) pushQuad([x0, h, z0], [x1, h, z0], [x1, nh, z0], [x0, nh, z0], sideCol);
                }
                cellRanges.set(gx + ',' + gz, { s: _cellStart, e: positions.length });
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
        this._cellRanges = cellRanges;
        return geometry;
    }

    updateTerrain() {
        if (!this.scene || !this.generator.grid || this.generator.grid.length === 0) return;
        // VUE UNIQUE : ne pas reconstruire un mesh invisible (vue 2D affichée).
        // Le rebuild est rattrapé au basculement vers la 3D (voir ui.js switchView).
        if (this.container && this.container.offsetParent === null) {
            this._terrainDirty = true;
            return;
        }
        this._terrainDirty = false;

        // Nettoyage de l'ancien mesh
        if (this.terrainMesh) {
            this.scene.remove(this.terrainMesh);
            if (this.terrainMesh.geometry) this.terrainMesh.geometry.dispose();
            if (this.terrainMesh.material) this.terrainMesh.material.dispose();
            this.terrainMesh = null;
        }
        if (this.wireframeMesh) {
            this.scene.remove(this.wireframeMesh);
            if (this.wireframeMesh.geometry) this.wireframeMesh.geometry.dispose();
            if (this.wireframeMesh.material) this.wireframeMesh.material.dispose();
            this.wireframeMesh = null;
        }
        if (this.waterMesh) {
            this.scene.remove(this.waterMesh);
            if (this.waterMesh.geometry) this.waterMesh.geometry.dispose();
            if (this.waterMesh.material) this.waterMesh.material.dispose();
            this.waterMesh = null;
        }

        const grid = this.generator.grid;
        const resX = grid.length;
        const resZ = grid[0] ? grid[0].length : 0;
        const scale = 3.5; // Facteur d'échelle pour un bon rendu dans l'espace 3D
        const halfSizeX = (resX * scale) / 2;
        const halfSizeZ = (resZ * scale) / 2;

        let geometry;
        if (this.generator.config.meshType === 'voxel') {
            geometry = this.buildVoxelSteppedGeometry(grid, resX, resZ, scale, halfSizeX, halfSizeZ);
        } else {
            geometry = this.buildSmoothGeometry(grid, resX, resZ, scale, halfSizeX, halfSizeZ);
        }

        geometry.computeVertexNormals();

        // Matériau terrain avec couleurs par sommet
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.8,
            metalness: 0.1,
            flatShading: this.generator.config.meshType === 'voxel'
        });

        this.terrainMesh = new THREE.Mesh(geometry, material);
        this.terrainMesh.castShadow = true;
        this.terrainMesh.receiveShadow = true;
        this.scene.add(this.terrainMesh);

        // TACHE 2 : mémorise le layout du buffer pour autoriser les mises à jour
        // partielles (updateTerrainRegion). Si la grille change de taille ou de
        // meshType, ce meta devient obsolète et force un rebuild complet.
        this._geomMeta = {
            resX: resX, resZ: resZ, scale: scale,
            halfSizeX: halfSizeX, halfSizeZ: halfSizeZ,
            meshType: this.generator.config.meshType
        };
        // Le terrain de base a changé : état de sink périmé (nouvelle géométrie)
        this._sunkCells = new Map();
        // ... et la surcouche de détail aussi
        this.clearDetailOverlay();

        // Optionnel : Wireframe
        if (this.showWireframe) {
            const wireMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.15 });
            this.wireframeMesh = new THREE.Mesh(geometry, wireMat);
            this.scene.add(this.wireframeMesh);
        }

        // Plan d'eau
        if (this.generator.config.showWater) {
            const waterGeom = new THREE.PlaneGeometry(resX * scale, resZ * scale);
            waterGeom.rotateX(-Math.PI / 2);
            const waterMat = new THREE.MeshPhysicalMaterial({
                color: 0x0ea5e9,
                transparent: true,
                opacity: 0.65,
                roughness: 0.1,
                metalness: 0.05,
                transmission: 0.35
            });
            this.waterMesh = new THREE.Mesh(waterGeom, waterMat);
            // +0.35 : évite le z-fighting (scintillement) avec le terrain qui
            // affleure exactement au niveau de la mer, tout en restant sous la
            // première couche de terre (seaLevel + 1)
            this.waterMesh.position.set(0, this.generator.config.seaLevel + 0.35, 0);
            this.waterMesh.receiveShadow = true;
            this.scene.add(this.waterMesh);
        }

        this._needsRender = true;
    }

    /**
     * TACHE 2 : mise à jour PARTIELLE du terrain 3D (coups de pinceau localisés).
     * Réécrit en place les Y et couleurs des vertices de la zone [gxMin..gxMax] x
     * [gzMin..gzMax] dans les TypedArray existants du BufferGeometry (aucune
     * allocation, aucun dispose), puis marque les attributs needsUpdate.
     *
     * Limites assumées :
     * - Mode 'smooth' uniquement : layout indexé fixe (1 vertex par cellule,
     *   index i = (gx*resZ+gz)*3). En mode 'voxel', la topologie varie (les jupes
     *   apparaissent/disparaissent selon les voisins) -> fallback rebuild complet.
     * - La zone est élargie de +2 cellules : getCellColor mélange les couleurs de
     *   biomes dans un rayon de 2, les cellules en bordure de zone doivent donc
     *   être re-colorées aussi (sinon halo de couleurs périmées autour du coup).
     * - computeVertexNormals est rappelé sur toute la géométrie : pas de
     *   réallocation (il réutilise l'attribut normal existant), c'est le poste
     *   le moins cher ; le gain principal vient d'éviter le rebuild des buffers.
     */
    updateTerrainRegion(gxMin, gxMax, gzMin, gzMax) {
        // VUE UNIQUE : section 3D cachée -> on note juste que le mesh est périmé
        if (this.container && this.container.offsetParent === null) {
            this._terrainDirty = true;
            return;
        }
        const grid = this.generator && this.generator.grid;
        const meta = this._geomMeta;
        // Garde-fous : pas de mesh, meta absent/obsolète, grille redimensionnée,
        // ou mode voxel -> rebuild complet classique.
        if (!this.terrainMesh || !meta || !grid || !grid.length ||
            meta.meshType !== 'smooth' || this.generator.config.meshType !== 'smooth' ||
            grid.length !== meta.resX || (grid[0] ? grid[0].length : 0) !== meta.resZ) {
            this.updateTerrain();
            return;
        }

        const geom = this.terrainMesh.geometry;
        const posAttr = geom.attributes.position;
        const colAttr = geom.attributes.color;
        if (!posAttr || !colAttr) { this.updateTerrain(); return; }
        const pos = posAttr.array;
        const col = colAttr.array;

        // Marge de 2 cellules pour le mélange de couleurs aux frontières de biomes
        const M = 2;
        const x0 = Math.max(0, Math.floor(gxMin) - M);
        const x1 = Math.min(meta.resX - 1, Math.ceil(gxMax) + M);
        const z0 = Math.max(0, Math.floor(gzMin) - M);
        const z1 = Math.min(meta.resZ - 1, Math.ceil(gzMax) + M);
        if (x0 > x1 || z0 > z1) return;

        for (let gx = x0; gx <= x1; gx++) {
            const row = grid[gx];
            for (let gz = z0; gz <= z1; gz++) {
                const cell = row[gz];
                const i = (gx * meta.resZ + gz) * 3;
                pos[i + 1] = cell.height; // X/Z ne bougent jamais (layout de grille fixe)
                const c = this.getCellColor(cell, grid, gx, gz);
                col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b;
            }
        }

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        // Invalide la surcouche de détail 3D sur la zone peinte (coords monde)
        {
            const wx0 = meta && this.generator.currentGridMeta ? this.generator.currentGridMeta.startWorldX + x0 * this.generator.currentGridMeta.stepX : 0;
            const wx1 = meta && this.generator.currentGridMeta ? this.generator.currentGridMeta.startWorldX + (x1 + 1) * this.generator.currentGridMeta.stepX : 0;
            const wz0 = meta && this.generator.currentGridMeta ? this.generator.currentGridMeta.startWorldZ + z0 * this.generator.currentGridMeta.stepZ : 0;
            const wz1 = meta && this.generator.currentGridMeta ? this.generator.currentGridMeta.startWorldZ + (z1 + 1) * this.generator.currentGridMeta.stepZ : 0;
            this.clearDetailOverlayInRegion(wx0 - 2, wx1 + 2, wz0 - 2, wz1 + 2);
        }
        // Normales recalculées en place (pas de réallocation) pour un éclairage correct
        geom.computeVertexNormals();
        // Bornes réutilisées par le raycaster du pinceau 3D : à rafraîchir si les
        // hauteurs sortent de l'ancienne sphère englobante
        if (geom.boundingSphere) geom.computeBoundingSphere();
        this._needsRender = true;
    }


    /* ============================================================
       SURCOUCHE DE DÉTAIL 3D (grands mondes, ex. 4000x4000)
       Quand la caméra est proche, des chunks 16x16 blocs à la vraie
       résolution 1:1 (mêmes données que la 2D et l'export, via
       generator.getDetailChunk) sont affichés PAR-DESSUS le mesh
       grossier, UNIQUEMENT dans le rayon visible autour de la cible
       caméra. Un mesh par chunk -> le frustum culling de Three.js
       ignore automatiquement ce qui sort de l'écran, et rien n'est
       calculé hors du rayon visible. Cache LRU + budget par tick.
       ============================================================ */
    _maybeUpdateDetailOverlay() {
        const now = Date.now();
        if (this._lastDetailCheck && now - this._lastDetailCheck < 120) return;
        this._lastDetailCheck = now;

        const gen = this.generator;
        if (!gen || !gen.needsDetailChunks || !gen.needsDetailChunks() ||
            !this.terrainMesh || !this.controls || !this._geomMeta) {
            if (this.detailGroup) this.detailGroup.visible = false;
            this._restoreAllSunk();
            return;
        }
        const meta = gen.currentGridMeta;
        if (!meta) return;
        const scale = this._geomMeta.scale || 3.5;
        const halfSizeX = this._geomMeta.halfSizeX, halfSizeZ = this._geomMeta.halfSizeZ;

        // Rayon visible approx. en blocs : distance caméra -> cible, ouverture fov
        const dist = this.camera.position.distanceTo(this.controls.target);
        const fov = (this.camera.fov || 60) * Math.PI / 180;
        const radiusScene = Math.tan(fov / 2) * dist * 1.7;
        const blocksPerUnit = meta.stepX / scale;
        const radiusBlocks = radiusScene * blocksPerUnit;

        // Deux seuils distincts :
        // - OFF_RADIUS : au-delà, le détail 1:1 serait imperceptible (~<2px/bloc)
        //   -> surcouche masquée, zéro calcul
        // - MAX_RADIUS : rayon de CHARGEMENT clampé (les grands mondes couvrent
        //   vite des centaines de blocs, on détaille en priorité autour de la cible)
        const OFF_RADIUS_BLOCKS = 700;
        const MAX_RADIUS_BLOCKS = 260;
        if (!this.detailGroup) {
            this.detailGroup = new THREE.Group();
            this.scene.add(this.detailGroup);
            this._detailMeshes = new Map();
            this._detailMeshOrder = [];
        }
        if (radiusBlocks > OFF_RADIUS_BLOCKS) {
            if (this.detailGroup.visible) { this.detailGroup.visible = false; this._needsRender = true; }
            this._restoreAllSunk();
            return;
        }
        this.detailGroup.visible = true;

        // POINT REGARDÉ (raycast) : le rayon central de la caméra est intersecté
        // avec le terrain ; c'est LE point que le joueur regarde. Fallback : la
        // cible OrbitControls si le rayon sort du terrain.
        let lookX, lookZ;
        if (this.raycaster && this.terrainMesh) {
            this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
            const _rt3 = (this.detailGroup && this.detailGroup.visible) ? [this.terrainMesh, this.detailGroup] : [this.terrainMesh];
            const hits = this.raycaster.intersectObjects(_rt3, true);
            if (hits.length > 0) { lookX = hits[0].point.x; lookZ = hits[0].point.z; }
        }
        if (lookX === undefined) { lookX = this.controls.target.x; lookZ = this.controls.target.z; }
        const wcx = (lookX + halfSizeX) / scale * meta.stepX + meta.startWorldX;
        const wcz = (lookZ + halfSizeZ) / scale * meta.stepZ + meta.startWorldZ;

        const S = gen.detailChunkSize();
        const r = Math.min(radiusBlocks, MAX_RADIUS_BLOCKS);
        const rc = Math.max(1, Math.ceil(r / S)); // rayon en chunks
        const ccx = Math.floor(wcx / S), ccz = Math.floor(wcz / S);

        // PARCOURS EN SPIRALE : le chunk regardé d'abord, puis anneaux concentriques
        // (droite, bas, gauche, haut) -> le détail apparaît là où le joueur regarde
        // et s'étend autour, au lieu d'un balayage ligne par ligne.
        let budget = 32;
        const tryChunk = (cx, cz) => {
            if (budget <= 0) return;
            const key = cx + ',' + cz;
            if (this._detailMeshes.has(key)) return;
            const mesh = this._buildDetailChunkMesh(cx, cz, meta, scale, halfSizeX, halfSizeZ);
            if (!mesh) { this._detailMeshes.set(key, null); this._detailMeshOrder.push(key); return; }
            this.detailGroup.add(mesh);
            this._detailMeshes.set(key, mesh);
            this._detailMeshOrder.push(key);
            budget--;
            this._needsRender = true;
        };
        tryChunk(ccx, ccz); // centre = point regardé
        for (let ring = 1; ring <= rc && budget > 0; ring++) {
            // bord haut et bas de l'anneau
            for (let dx = -ring; dx <= ring && budget > 0; dx++) {
                tryChunk(ccx + dx, ccz - ring);
                tryChunk(ccx + dx, ccz + ring);
            }
            // bords gauche/droite (sans les coins déjà faits)
            for (let dz = -ring + 1; dz <= ring - 1 && budget > 0; dz++) {
                tryChunk(ccx - ring, ccz + dz);
                tryChunk(ccx + ring, ccz + dz);
            }
        }
        // LRU "spatial" : on n'évince JAMAIS un chunk encore dans le rayon
        // visible (sinon les chunks à l'écran se chassent mutuellement et des
        // gros carrés grossiers ne se remplissent jamais). Le cap s'adapte au
        // rayon courant, et l'éviction ne touche que les chunks hors-zone.
        const cap = Math.max(600, (2 * rc + 3) * (2 * rc + 3));
        if (this._detailMeshOrder.length > cap) {
            let toEvict = this._detailMeshOrder.length - cap;
            const keep = [];
            for (const key of this._detailMeshOrder) {
                const parts = key.split(',');
                const kx = parseInt(parts[0], 10), kz = parseInt(parts[1], 10);
                const inView = Math.max(Math.abs(kx - ccx), Math.abs(kz - ccz)) <= rc + 1;
                if (!inView && toEvict > 0) {
                    toEvict--;
                    const m = this._detailMeshes.get(key);
                    this._detailMeshes.delete(key);
                    if (m) {
                        this.detailGroup.remove(m);
                        if (m.geometry) m.geometry.dispose();
                    }
                } else {
                    keep.push(key);
                }
            }
            this._detailMeshOrder = keep;
        }

        // Enfonce le mesh grossier sous les chunks 1:1 chargés (fix "gros cubes")
        this._syncCoarseSink();
    }

    _buildDetailChunkMesh(cx, cz, meta, scale, halfSizeX, halfSizeZ) {
        const gen = this.generator;
        const chunk = gen.getDetailChunk(cx, cz);
        if (!chunk) return null;
        const S = gen.detailChunkSize();
        const chunkXp = gen.getDetailChunk(cx + 1, cz);
        const chunkZp = gen.getDetailChunk(cx, cz + 1);
        const chunkXZp = gen.getDetailChunk(cx + 1, cz + 1);
        // Voisins OUEST/NORD : nécessaires pour ne PAS dessiner de murs de jupe
        // aux frontières internes de chunks (traits noirs vus en parallèle X/Z)
        const chunkXm = gen.getDetailChunk(cx - 1, cz);
        const chunkZm = gen.getDetailChunk(cx, cz - 1);
        const hAt = (lx, lz) => {
            if (lx < S && lz < S) return chunk.heights[lz * S + lx];
            if (lx >= S && lz < S) return chunkXp ? chunkXp.heights[lz * S + (lx - S)] : chunk.heights[lz * S + (S - 1)];
            if (lx < S && lz >= S) return chunkZp ? chunkZp.heights[(lz - S) * S + lx] : chunk.heights[(S - 1) * S + lx];
            return chunkXZp ? chunkXZp.heights[(lz - S) * S + (lx - S)] : chunk.heights[S * S - 1];
        };
        const bAt = (lx, lz) => {
            const cxx = Math.min(S - 1, lx), czz = Math.min(S - 1, lz);
            return chunk.biomes[czz * S + cxx];
        };
        // FIX "mélange voxel/lisse" : le chunk 1:1 est rendu SOLIDE et OPAQUE
        // au-dessus du mesh grossier (même style que le meshType courant, +LIFT,
        // jupe périphérique).
        // FIX "blocs difformes" : la scène compresse X/Z (1 bloc = scale/stepX
        // unités) mais pas Y. On projette donc le relief du chunk à l'échelle
        // CUBIQUE : 1 bloc de dénivelé = sBlock unités = la largeur d'un bloc.
        // Ancrage sur la surface grossière (bilinéaire, continue entre chunks) :
        // yScene = base(wx,wz) + (h - base) * sBlock -> cubes 1x1x1 parfaits,
        // posés au bon endroit, sans couture entre chunks.
        const LIFT = 0.25;
        const isVoxel = this.generator.config.meshType === 'voxel';
        const maxH = Math.max(1, this.generator.config.maxHeight || 400);
        const pxOf = (wx) => (wx - meta.startWorldX) / meta.stepX * scale - halfSizeX;
        const pzOf = (wz) => (wz - meta.startWorldZ) / meta.stepZ * scale - halfSizeZ;
        const sBlock = scale / meta.stepX; // taille scène d'UN bloc (horizontale = verticale voulue)
        const grid = this.generator.grid;
        const baseAt = (wx, wz) => {
            // hauteur de la surface grossière (bilinéaire, comme updateTerrainRegion)
            const fx = (wx - meta.startWorldX) / meta.stepX - 0.5;
            const fz = (wz - meta.startWorldZ) / meta.stepZ - 0.5;
            const x0i = Math.max(0, Math.min(meta.resX - 1, Math.floor(fx)));
            const z0i = Math.max(0, Math.min(meta.resZ - 1, Math.floor(fz)));
            const x1i = Math.min(meta.resX - 1, x0i + 1);
            const z1i = Math.min(meta.resZ - 1, z0i + 1);
            const tx = Math.max(0, Math.min(1, fx - x0i));
            const tz = Math.max(0, Math.min(1, fz - z0i));
            return grid[x0i][z0i].height * (1 - tx) * (1 - tz) + grid[x1i][z0i].height * tx * (1 - tz) +
                   grid[x0i][z1i].height * (1 - tx) * tz + grid[x1i][z1i].height * tx * tz;
        };
        // Le clamp de recouvrement (v2.0) aplatissait le détail sur le plateau
        // grossier -> "gros cube aux couleurs 1:1". Supprimé : le mesh grossier
        // est désormais ENFONCÉ sous les cellules détaillées (_syncCoarseSink),
        // le détail garde donc son vrai relief 1:1.
        const yScene = (h, wx, wz) => {
            const b = baseAt(wx, wz);
            return b + (h - b) * sBlock + LIFT;
        };
        const colorOf = (lx, lz) => {
            const bio = gen.biomes[bAt(lx, lz)];
            const c = new THREE.Color(bio ? bio.color : '#4ade80');
            const shade = 0.72 + 0.28 * Math.min(1, Math.max(0, hAt(lx, lz) / maxH));
            c.multiplyScalar(shade);
            return c;
        };

        const positions = [];
        const colors = [];
        const pushTri = (ax, ay, az, bx, by, bz, cx2, cy2, cz2, c) => {
            positions.push(ax, ay, az, bx, by, bz, cx2, cy2, cz2);
            for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
        };
        const pushQuad = (v0, v1, v2, v3, c) => {
            pushTri(v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2], c);
            pushTri(v0[0], v0[1], v0[2], v2[0], v2[1], v2[2], v3[0], v3[1], v3[2], c);
        };

        if (isVoxel) {
            // Style voxel 1:1 : un plateau par BLOC + jupes vers les voisins,
            // hauteurs re-projetées à l'échelle cubique (yScene)
            const stepPx = scale / meta.stepX, stepPz = scale / meta.stepZ;
            for (let lz = 0; lz < S; lz++) {
                for (let lx = 0; lx < S; lx++) {
                    const wx = chunk.x0 + lx, wz = chunk.z0 + lz;
                    const wcx = wx + 0.5, wcz = wz + 0.5;
                    const h = yScene(hAt(lx, lz), wcx, wcz);
                    const x0 = pxOf(wx), x1 = x0 + stepPx;
                    const z0 = pzOf(wz), z1 = z0 + stepPz;
                    const c = colorOf(lx, lz);
                    pushQuad([x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0], c);
                    const sideC = c.clone().multiplyScalar(0.78);
                    // jupes : hauteurs voisines projetées avec la MEME colonne de base
                    // (continuité assurée par baseAt bilinéaire)
                    const bottom = h - Math.max(2.5 * sBlock, LIFT + 2);
                    const nE = lx + 1 <= S ? yScene(hAt(lx + 1, lz), wcx + 1, wcz) : bottom;
                    if (nE < h) pushQuad([x1, h, z0], [x1, h, z1], [x1, Math.max(nE, bottom), z1], [x1, Math.max(nE, bottom), z0], sideC);
                    // OUEST : hauteur réelle du chunk voisin (plus de mur artificiel
                    // à chaque frontière de chunk) ; bottom seulement en bord de monde
                    const hW = lx - 1 >= 0 ? hAt(lx - 1, lz) : (chunkXm ? chunkXm.heights[lz * S + (S - 1)] : null);
                    const nW = hW === null ? bottom : yScene(hW, wcx - 1, wcz);
                    if (nW < h) pushQuad([x0, h, z1], [x0, h, z0], [x0, Math.max(nW, bottom), z0], [x0, Math.max(nW, bottom), z1], sideC);
                    const nS2 = lz + 1 <= S ? yScene(hAt(lx, lz + 1), wcx, wcz + 1) : bottom;
                    if (nS2 < h) pushQuad([x1, h, z1], [x0, h, z1], [x0, Math.max(nS2, bottom), z1], [x1, Math.max(nS2, bottom), z1], sideC);
                    // NORD : idem
                    const hN = lz - 1 >= 0 ? hAt(lx, lz - 1) : (chunkZm ? chunkZm.heights[(S - 1) * S + lx] : null);
                    const nN = hN === null ? bottom : yScene(hN, wcx, wcz - 1);
                    if (nN < h) pushQuad([x0, h, z0], [x1, h, z0], [x1, Math.max(nN, bottom), z0], [x0, Math.max(nN, bottom), z0], sideC);
                }
            }
        } else {
            // Style lisse 1:1 : grille de quads sur sommets 17x17 (échelle cubique)
            const yV = (lx, lz) => yScene(hAt(lx, lz), chunk.x0 + lx, chunk.z0 + lz);
            for (let lz = 0; lz < S; lz++) {
                for (let lx = 0; lx < S; lx++) {
                    const wx = chunk.x0 + lx, wz = chunk.z0 + lz;
                    const c = colorOf(lx, lz);
                    pushQuad(
                        [pxOf(wx), yV(lx, lz), pzOf(wz)],
                        [pxOf(wx), yV(lx, lz + 1), pzOf(wz + 1)],
                        [pxOf(wx + 1), yV(lx + 1, lz + 1), pzOf(wz + 1)],
                        [pxOf(wx + 1), yV(lx + 1, lz), pzOf(wz)], c);
                }
            }
            // Jupe périphérique UNIQUEMENT en bord de monde : entre chunks
            // adjacents, les sommets de bord sont identiques (cache partagé +
            // base bilinéaire continue), donc aucune jupe n'est nécessaire —
            // c'étaient ces murs x0.75 qui dessinaient des traits noirs le
            // long des frontières de chunks vus en parallèle X/Z.
            const drop = 4 + LIFT;
            if (!chunkZm) for (let lx = 0; lx < S; lx++) {
                const wx = chunk.x0 + lx;
                const cN = colorOf(lx, 0).multiplyScalar(0.75);
                pushQuad([pxOf(wx), yV(lx, 0), pzOf(chunk.z0)], [pxOf(wx + 1), yV(lx + 1, 0), pzOf(chunk.z0)],
                         [pxOf(wx + 1), yV(lx + 1, 0) - drop, pzOf(chunk.z0)], [pxOf(wx), yV(lx, 0) - drop, pzOf(chunk.z0)], cN);
            }
            if (!chunkZp) for (let lx = 0; lx < S; lx++) {
                const wx = chunk.x0 + lx;
                const cS = colorOf(lx, S - 1).multiplyScalar(0.75);
                pushQuad([pxOf(wx + 1), yV(lx + 1, S), pzOf(chunk.z0 + S)], [pxOf(wx), yV(lx, S), pzOf(chunk.z0 + S)],
                         [pxOf(wx), yV(lx, S) - drop, pzOf(chunk.z0 + S)], [pxOf(wx + 1), yV(lx + 1, S) - drop, pzOf(chunk.z0 + S)], cS);
            }
            if (!chunkXm) for (let lz = 0; lz < S; lz++) {
                const wz = chunk.z0 + lz;
                const cW = colorOf(0, lz).multiplyScalar(0.75);
                pushQuad([pxOf(chunk.x0), yV(0, lz + 1), pzOf(wz + 1)], [pxOf(chunk.x0), yV(0, lz), pzOf(wz)],
                         [pxOf(chunk.x0), yV(0, lz) - drop, pzOf(wz)], [pxOf(chunk.x0), yV(0, lz + 1) - drop, pzOf(wz + 1)], cW);
            }
            if (!chunkXp) for (let lz = 0; lz < S; lz++) {
                const wz = chunk.z0 + lz;
                const cE = colorOf(S - 1, lz).multiplyScalar(0.75);
                pushQuad([pxOf(chunk.x0 + S), yV(S, lz), pzOf(wz)], [pxOf(chunk.x0 + S), yV(S, lz + 1), pzOf(wz + 1)],
                         [pxOf(chunk.x0 + S), yV(S, lz + 1) - drop, pzOf(wz + 1)], [pxOf(chunk.x0 + S), yV(S, lz) - drop, pzOf(wz)], cE);
            }
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
        geom.computeVertexNormals();
        if (!this._detailMaterial) {
            this._detailMaterial = new THREE.MeshStandardMaterial({
                vertexColors: true, roughness: 0.85, metalness: 0.05,
                flatShading: true,
                polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
            });
        }
        return new THREE.Mesh(geom, this._detailMaterial);
    }

    clearDetailOverlay() {
        this._restoreAllSunk();
        if (!this.detailGroup) return;
        for (const [, m] of this._detailMeshes || []) {
            if (m) { this.detailGroup.remove(m); if (m.geometry) m.geometry.dispose(); }
        }
        this._detailMeshes = new Map();
        this._detailMeshOrder = [];
        this._needsRender = true;
    }

    /** Invalidation ciblée (coup de pinceau) : zone en coordonnées MONDE (blocs) */
    clearDetailOverlayInRegion(wx0, wx1, wz0, wz1) {
        if (!this._detailMeshes || this._detailMeshes.size === 0) return;
        const S = this.generator.detailChunkSize();
        const cx0 = Math.floor(wx0 / S), cx1 = Math.floor(wx1 / S);
        const cz0 = Math.floor(wz0 / S), cz1 = Math.floor(wz1 / S);
        for (let cx = cx0; cx <= cx1; cx++) {
            for (let cz = cz0; cz <= cz1; cz++) {
                const key = cx + ',' + cz;
                const m = this._detailMeshes.get(key);
                if (m !== undefined) {
                    this._detailMeshes.delete(key);
                    const idx = this._detailMeshOrder.indexOf(key);
                    if (idx !== -1) this._detailMeshOrder.splice(idx, 1);
                    if (m) { this.detailGroup.remove(m); if (m.geometry) m.geometry.dispose(); }
                }
            }
        }
        this._syncCoarseSink();
        this._needsRender = true;
    }


    /* ============================================================
       SINK DU MESH GROSSIER (fix "gros cubes au zoom") :
       en mode voxel, chaque cellule de la grille ENTIÈREMENT couverte
       par des chunks 1:1 chargés est enfoncée à y=-10000 : son plateau
       géant n'existe plus sous la zone détaillée et ne peut plus
       percer. Restauration exacte à l'éviction / au dézoom / au clear.
       ============================================================ */
    _syncCoarseSink() {
        if (!this._sunkCells) this._sunkCells = new Map();
        const voxelOk = this.terrainMesh && this._geomMeta && this._geomMeta.meshType === 'voxel' && this._cellRanges;
        if (!voxelOk || !this._detailMeshes || !this.detailGroup || !this.detailGroup.visible) {
            this._restoreAllSunk();
            return;
        }
        const gen = this.generator;
        const meta = gen.currentGridMeta;
        if (!meta) { this._restoreAllSunk(); return; }
        const S = gen.detailChunkSize();
        const loaded = new Set();
        this._detailMeshes.forEach((m, key) => { if (m) loaded.add(key); });

        // Cellules dont TOUS les chunks couvrants sont chargés
        const desired = new Set();
        const seen = new Set();
        loaded.forEach((key) => {
            const p = key.split(',');
            const cx = parseInt(p[0], 10), cz = parseInt(p[1], 10);
            const wx0 = cx * S, wz0 = cz * S;
            const gx0 = Math.floor((wx0 - meta.startWorldX) / meta.stepX);
            const gx1 = Math.floor((wx0 + S - 0.001 - meta.startWorldX) / meta.stepX);
            const gz0 = Math.floor((wz0 - meta.startWorldZ) / meta.stepZ);
            const gz1 = Math.floor((wz0 + S - 0.001 - meta.startWorldZ) / meta.stepZ);
            for (let gx = Math.max(0, gx0); gx <= Math.min(meta.resX - 1, gx1); gx++) {
                for (let gz = Math.max(0, gz0); gz <= Math.min(meta.resZ - 1, gz1); gz++) {
                    const ck = gx + ',' + gz;
                    if (seen.has(ck)) continue;
                    seen.add(ck);
                    const cwx0 = meta.startWorldX + gx * meta.stepX;
                    const cwx1 = meta.startWorldX + (gx + 1) * meta.stepX - 0.001;
                    const cwz0 = meta.startWorldZ + gz * meta.stepZ;
                    const cwz1 = meta.startWorldZ + (gz + 1) * meta.stepZ - 0.001;
                    let full = true;
                    for (let qx = Math.floor(cwx0 / S); qx <= Math.floor(cwx1 / S) && full; qx++) {
                        for (let qz = Math.floor(cwz0 / S); qz <= Math.floor(cwz1 / S); qz++) {
                            if (!loaded.has(qx + ',' + qz)) { full = false; break; }
                        }
                    }
                    if (full) desired.add(ck);
                }
            }
        });

        let changed = false;
        const pos = this.terrainMesh.geometry.attributes.position;
        const toRestore = [];
        this._sunkCells.forEach((saved, ck) => { if (!desired.has(ck)) toRestore.push(ck); });
        for (let i = 0; i < toRestore.length; i++) { this._restoreCell(toRestore[i], pos.array); changed = true; }
        desired.forEach((ck) => {
            if (this._sunkCells.has(ck)) return;
            const range = this._cellRanges.get(ck);
            if (!range) return;
            const saved = new Float32Array(Math.ceil((range.e - range.s) / 3));
            let si = 0;
            for (let i = range.s + 1; i < range.e; i += 3) { saved[si++] = pos.array[i]; pos.array[i] = -10000; }
            this._sunkCells.set(ck, saved);
            changed = true;
        });
        if (changed) { pos.needsUpdate = true; this._needsRender = true; }
    }

    _restoreCell(ck, posArr) {
        const saved = this._sunkCells.get(ck);
        const range = this._cellRanges && this._cellRanges.get(ck);
        if (saved && range) {
            let si = 0;
            for (let i = range.s + 1; i < range.e; i += 3) posArr[i] = saved[si++];
        }
        this._sunkCells.delete(ck);
    }

    _restoreAllSunk() {
        if (!this._sunkCells || this._sunkCells.size === 0) return;
        if (this.terrainMesh && this._cellRanges) {
            const pos = this.terrainMesh.geometry.attributes.position;
            const keys = Array.from(this._sunkCells.keys());
            for (let i = 0; i < keys.length; i++) this._restoreCell(keys[i], pos.array);
            pos.needsUpdate = true;
            this._needsRender = true;
        } else {
            this._sunkCells.clear();
        }
    }

        updateControlsMode() {
        if (!this.controls || typeof THREE === 'undefined') return;
        if (window.map2dInstance && window.map2dInstance.activeTab === 'editor') {
            this.controls.enableRotate = false; // Bloque totalement la rotation caméra en mode Éditeur !
            this.controls.mouseButtons = {
                LEFT: -1,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: -1
            };
        } else {
            this.controls.enableRotate = true; // Réactive la rotation pour Paramètres
            this.controls.mouseButtons = {
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN
            };
        }
    }

    animate() {
        this.animFrameId = requestAnimationFrame(() => this.animate());

        // TACHE 1 : ne consommer NI GPU NI CPU quand le canvas 3D ne peut pas être vu
        // (onglet navigateur caché, section 3D repliée via le splitter, display:none).
        // La boucle rAF reste vivante pour reprendre instantanément au retour.
        const hidden = (typeof document !== 'undefined' && document.hidden) ||
            !this.container || this.container.offsetParent === null ||
            this.container.clientWidth < 8 || this.container.clientHeight < 8;
        if (hidden) {
            this._wasHidden = true;
            return; // pas de controls.update() : aucun delta ne s'accumule (pas d'interaction possible)
        }
        if (this._wasHidden) {
            this._wasHidden = false;
            this._needsRender = true; // premier rendu forcé au retour de visibilité
        }

        this.updateControlsMode();
        // controls.update() reste appelé à chaque frame visible : c'est léger et
        // c'est lui qui fait vivre l'inertie du damping (qui émet 'change' -> dirty).
        if (this.controls) this.controls.update();
        // DETAIL AU ZOOM (grands mondes) : chargement progressif des chunks visibles
        this._maybeUpdateDetailOverlay();

        if ((this._needsRender || this._alwaysRender) && this.renderer && this.scene && this.camera) {
            this._needsRender = false;
            this.renderer.render(this.scene, this.camera);
        }
    }
}
window.Map3D = Map3D;