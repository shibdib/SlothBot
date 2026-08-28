/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const Log = require('logger');
let activeConfig;

// noinspection JSUnresolvedReference
let globals = function () {

    global.PROFILER_ENABLED = true; // Disable if you don't want to use the profiler. Should save CPU.

    // Creep build priorities (Lower is higher priority)
    global.PRIORITIES = {
        // Harvesters
        stationaryHarvester: 1,
        // Workers — upgrader sits a step ahead of drone so it wins ties at equal count.
        // Drone/upgrader were both 6, with drone queued first in essentialCreepQueue. Stable
        // sort meant drone always took the first slot after leveling, leaving the controller
        // idle while extensions filled.
        upgrader: 6, drone: 3, mineralHarvester: 7,
        // Haulers — slightly behind harvesters since they're gated by harvester presence
        hauler: 2, miscHauler: 7,
        // Remotes — harvesters before haulers (a hauler without a harvester does nothing)
        remoteHarvester: 5, remoteHauler: 4, remoteBuilder: 7, roadBuilder: 7, fuelTruck: 8, reserver: 6,
        // Military
        defender: 3, extreme: 3, priority: 4, urgent: 5, high: 6, medium: 7, secondary: 9
    };

    //
    //
    //
    //  DO NOT EDIT BELOW THIS LINE
    //
    //
    //


    const slothBotASCII = `
      SSSSS  L       OOO   TTTTT  H   H   BBBBB   OOO   TTTTT
     S        L      O   O    T    H   H   B    B O   O    T
      SSS     L      O   O    T    HHHHH   BBBBB  O   O    T
         S    L      O   O    T    H   H   B    B O   O    T
     SSSSS    LLLLL   OOO     T    H   H   BBBBB   OOO     T
     
     https://github.com/shibdib/SlothBot
    `;

    console.log(slothBotASCII);

    // Try to load a private server config otherwise load the default
    console.log(`Global Reset - Last reset occurred ${Game.time - (Memory.lastGlobalReset || Game.time)} ticks ago.`);
    Memory.lastGlobalReset = Game.time;

    // Helper for spreading expensive work over the first few ticks after a global reset
    // (many module-level caches, lastRun trackers, and ring buffers are empty, causing CPU spikes)
    global.ticksSinceLastGlobalReset = function () {
        return Game.time - (Memory.lastGlobalReset || Game.time);
    };

    // Ticks after global reset where we avoid heavy work and watch for cold-cache spikes.
    // Pair with main.js first-tick boot skip: that tick survives parse; this window
    // spreads cold-cache work after the loop starts running again.
    global.POST_RESET_DANGER_TICKS = 150;
    // Spread heavy room intel (tower grids, areExitsReachable) � one room per slot, not all at once.
    global.POST_RESET_HEAVY_INTEL_SPREAD = 150;

    global.isPostResetDangerWindow = function () {
        return global.ticksSinceLastGlobalReset() <= global.POST_RESET_DANGER_TICKS;
    };

    global.safeStructureOwner = function (structure) {
        if (!structure || !(structure instanceof OwnedStructure)) return undefined;
        try {
            return structure.owner && structure.owner.username;
        } catch (e) {
            return undefined;
        }
    };

    global.safeStructureMy = function (structure) {
        if (!structure || !(structure instanceof OwnedStructure)) return false;
        try {
            return !!structure.my;
        } catch (e) {
            return false;
        }
    };

    let structureRoomCacheTick = -1;
    let structureRoomCache = Object.create(null);
    let constructionSiteRoomCache = Object.create(null);

    global.invalidateStructureRoomCaches = function () {
        structureRoomCacheTick = -1;
        structureRoomCache = Object.create(null);
        constructionSiteRoomCache = Object.create(null);
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (room && room._invalidateStructureCaches) room._invalidateStructureCaches();
        }
    };

    global.collectOwnedRoads = function (roomName) {
        const seen = new Set();
        const roads = [];
        const add = (s) => {
            if (!s || s.structureType !== STRUCTURE_ROAD || seen.has(s.id)) return;
            seen.add(s.id);
            roads.push(s);
        };
        const roomList = roomName
            ? [Game.rooms[roomName]].filter(Boolean)
            : ((MY_ROOMS && MY_ROOMS.length)
                ? MY_ROOMS.map((n) => Game.rooms[n]).filter(Boolean)
                : Object.values(Game.rooms).filter((r) => r.controller && r.controller.my));

        for (const room of roomList) {
            if (!room.controller || !room.controller.my) continue;
            if (room.__nativeFind) {
                try {
                    (room.__nativeFind(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_ROAD}}) || []).forEach(add);
                } catch (e) { /* corrupt room */ }
            }
            try {
                room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_ROAD}}).forEach(add);
            } catch (e) { /* corrupt room */ }
            try {
                room.find(FIND_STRUCTURES, {filter: {structureType: STRUCTURE_ROAD}}).forEach(add);
            } catch (e) { /* corrupt room */ }
            if (room.roads && room.roads.length) room.roads.forEach(add);
        }
        if (Game.structures) {
            for (const id in Game.structures) {
                const s = Game.structures[id];
                if (!s || s.structureType !== STRUCTURE_ROAD) continue;
                const room = Game.rooms[s.pos.roomName];
                if (!room || !room.controller || !room.controller.my) continue;
                if (roomName && room.name !== roomName) continue;
                add(s);
            }
        }
        return {roads, visibleOwnedRooms: roomList.map((r) => r.name)};
    };

    // Console: resumeOwnedRoads() � clears the planner pause from clearOwnedRoads().
    global.resumeOwnedRoads = function () {
        delete Memory.pauseOwnedRoads;
        return {resumed: true, gameTime: Game.time};
    };

    /**
     * Planner console API (B2). All methods go through module.roomPlanner facade.
     * Alias: plannerV2 === planner (deprecated name kept for old macros).
     *
     * Soak / flags:
     *   status | empire | enable | enableEmpire | disable | pause | resume
     *   live | liveStatus | force | canary | canaryDryRun
     *   queues | lastRun | classify | budget
     *
     * Plan doc:
     *   inspect | migrate | remigrate | clear | resolved
     *
     * Inspect (read):
     *   anchors | spawn | extensions | core | economy | roads | ramparts
     *
     * Ensure (place via siteBudget):
     *   ensureAnchors | ensureSpawn | placeTowers | ensureExtensions | ensureCore
     *   ensureEconomy | ensureRoads | ensureRamparts | ensurePerimeter
     *   resetTowers | queueTowerReset | towerResetQueue
     *
     * Tick: orchestrator + plan* act + siteBudget. Memory.planner = pause/shadow only.
     * Errors: Memory._plannerOrchestratorError | _plannerPhaseError | _plannerSyncError
     */
    const _plannerMod = () => require('module.roomPlanner');
    const _plannerRoom = (roomName) => {
        if (!roomName) return {error: 'roomName required'};
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        return {room, roomName};
    };

    global.planner = {
        // ── Soak / flags ──────────────────────────────────────────────────
        status() {
            const mod = _plannerMod();
            const cfg = mod.getPlannerConfig();
            const forceRoom = mod.getPlannerForceRoom();
            const empire = mod.isPlannerEmpire();
            const rooms = [];
            for (const name in Game.rooms) {
                const room = Game.rooms[name];
                if (!room.controller || !room.controller.my) continue;
                const v2 = mod.isPlannerEnabled(room);
                const shadow = mod.isPlannerShadow(room);
                rooms.push({
                    room: name,
                    v2,
                    shadow,
                    live: v2 && !shadow,
                    forced: forceRoom === name,
                    hasPlan: !!(room.memory && room.memory.plan),
                    mode: room.memory && room.memory.plan && room.memory.plan.mode,
                    hub: (() => {
                        try {
                            return require('planDoc').getHub(room);
                        } catch (e) {
                            return room.memory && room.memory.bunkerHub;
                        }
                    })(),
                });
            }
            const warnings = [];
            if (forceRoom && empire) warnings.push('force_room_pins_turns');
            if (cfg.shadow) warnings.push('shadow_mode');
            return {
                config: cfg,
                empire,
                liveEmpire: empire && !cfg.shadow,
                forceRoom,
                warnings,
                schema: mod.PLAN_DOC_SCHEMA_VERSION,
                tickPath: 'orchestrator',
                rooms,
                syncError: Memory._plannerSyncError || Memory._plannerV2SyncError || null,
                orchestratorError: Memory._plannerOrchestratorError || null,
                phaseError: Memory._plannerPhaseError || Memory._plannerV2PhaseError || null,
            };
        },
        /** No args / true → empire live. Room name/list → resume + pin first room (no canary list). */
        enable(roomsOrTrue, opts) {
            const mod = _plannerMod();
            if (roomsOrTrue === undefined || roomsOrTrue === true) {
                return mod.enableEmpire(opts || {});
            }
            if (Array.isArray(roomsOrTrue) || typeof roomsOrTrue === 'string') {
                if (opts && opts.shadow) return this.pause();
                const first = Array.isArray(roomsOrTrue) ? roomsOrTrue[0] : roomsOrTrue;
                if (first) return this.live(first, opts);
                return mod.enableEmpire(opts || {});
            }
            return mod.setPlannerFlag(roomsOrTrue);
        },
        enableEmpire(opts) {
            return _plannerMod().enableEmpire(opts || {});
        },
        empire() {
            return _plannerMod().empireStatus();
        },
        /** Pause placement (shadow). Resume with resume / enable / enableEmpire. */
        disable() {
            const mod = _plannerMod();
            const cfg = mod.pausePlanner ? mod.pausePlanner() : mod.setPlannerFlag(false);
            if (typeof Memory !== 'undefined') delete Memory.plannerEmpireSoak;
            return {paused: true, config: cfg};
        },
        /** Alias for disable — E1 pause-only model. */
        pause() {
            return this.disable();
        },
        /** Resume live placement after pause/disable. */
        resume() {
            const mod = _plannerMod();
            const cfg = mod.resumePlanner ? mod.resumePlanner() : mod.setPlannerFlag(true);
            return {paused: false, config: cfg};
        },
        canary(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().canaryReport(r.room);
        },
        /** One-shot place all layers; requires shadow. */
        canaryDryRun(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().canaryDryRun(r.room);
        },
        live(roomName, opts) {
            return _plannerMod().enableLiveCanary(roomName, opts);
        },
        liveStatus(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().canaryLiveStatus(r.room);
        },
        force(roomName) {
            const mod = _plannerMod();
            if (roomName == null || roomName === false || roomName === '') {
                return {forceRoom: mod.setPlannerForceRoom(null)};
            }
            return {forceRoom: mod.setPlannerForceRoom(roomName)};
        },
        queues() {
            return _plannerMod().inspectPlannerQueues();
        },
        lastRun() {
            return _plannerMod().getLastPlannerTickReport();
        },
        classify(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().classifyPlannerRoom(r.room);
        },
        budget(roomName, opts) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().getSiteBudgetSnapshot(r.room, opts);
        },

        // ── Plan doc ──────────────────────────────────────────────────────
        inspect(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().inspectPlan(r.room);
        },
        migrate(roomName) {
            const mod = _plannerMod();
            if (!roomName) return mod.ensurePlansForOwnedRooms({forceAll: true});
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            const plan = mod.migrateFromLegacy(r.room);
            return {roomName, schema: plan.schema, mode: plan.mode, hub: plan.anchors.hub};
        },
        remigrate(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            const plan = _plannerMod().remigratePlan(r.room);
            return {
                roomName,
                remigrated: true,
                hub: plan && plan.anchors && plan.anchors.hub,
                mode: plan && plan.mode,
                authority: plan && plan.meta && plan.meta.authority,
            };
        },
        clear(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            _plannerMod().clearPlan(r.room);
            return {roomName, cleared: true};
        },
        resolved(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            const mod = _plannerMod();
            return {
                roomName,
                hub: mod.getHub(r.room),
                towers: mod.getTowerHubs(r.room),
                lab: mod.getLabHub(r.room),
                mode: mod.getPlanMode(r.room),
                plan: mod.inspectPlan(r.room),
            };
        },

        // ── Inspect ───────────────────────────────────────────────────────
        anchors(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().inspectAnchors(r.room);
        },
        spawn(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().inspectSpawn(r.room);
        },
        extensions(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().inspectExtensions(r.room);
        },
        core(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().inspectCore(r.room);
        },
        economy(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().inspectEconomy(r.room);
        },
        roads(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().inspectRoads(r.room);
        },
        ramparts(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().inspectRamparts(r.room);
        },

        // ── Ensure / place (siteBudget) ────────────────────────────────────
        ensureAnchors(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().ensureAllAnchors(r.room);
        },
        ensureSpawn(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().ensureSpawnSite(r.room);
        },
        placeTowers(roomName, maxPerCall) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            const mod = _plannerMod();
            const limit = maxPerCall === undefined ? mod.getTowerDeficit(r.room) : maxPerCall;
            const res = mod.placeTowerSites(r.room, limit);
            return {
                roomName,
                placed: typeof res === 'number' ? res : (res && res.placed) || 0,
                detail: typeof res === 'object' ? res : undefined,
                audit: mod.auditTowerHubTiles(r.room),
            };
        },
        ensureExtensions(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().placeExtensions(r.room);
        },
        ensureCore(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            const mod = _plannerMod();
            return {
                core: mod.placeCoreStamps(r.room),
                specials: mod.placeSpecials(r.room),
            };
        },
        ensureEconomy(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().placeEconomy(r.room);
        },
        ensureRoads(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().placeOwnedRoads(r.room);
        },
        ensureRamparts(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().placeRamparts(r.room);
        },
        ensurePerimeter(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().placePerimeter(r.room);
        },
        resetTowers(roomName) {
            const r = _plannerRoom(roomName);
            if (r.error) return r;
            return _plannerMod().resetTowerLayoutForRoom(r.room);
        },
        /** @param {string|string[]|true} [roomNames] true = all owned visible */
        queueTowerReset(roomNames) {
            let list = roomNames;
            if (list === true || list === undefined) {
                list = (typeof MY_ROOMS !== 'undefined' && MY_ROOMS && MY_ROOMS.length)
                    ? MY_ROOMS.slice()
                    : Object.values(Game.rooms)
                        .filter(room => room.controller && room.controller.my)
                        .map(room => room.name);
            }
            return _plannerMod().queueTowerLayoutReset(list);
        },
        towerResetQueue() {
            return {
                queue: Memory.towerLayoutResetQueue || [],
                misses: Memory._plannerTowerResetMiss || {},
                targetVersion: _plannerMod().TOWER_LAYOUT_VERSION,
            };
        },
    };
    /** @deprecated same object as planner */
    global.plannerV2 = global.planner;

    global.inspectExtensions = function (roomName) {
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        const {
            getExtensionDeficit,
            getExtensionPositions,
            clearDynamicLayoutMemory,
            auditExtensionPlacement,
            diagnoseExtensionBlockers,
            EXTENSION_LAYOUT_VERSION,
        } = require('planExtensions');
        const {tickTracker} = require('planState');
        const {canPlaceConstructionSite, roomConstructionSiteBudget} = require('planUtils');
        const needed = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
        const built = room.extensions.length;
        const sites = room.constructionSites.filter(s => s.structureType === STRUCTURE_EXTENSION).length;
        const positions = room.memory.dynamicLayout ? getExtensionPositions(room) : [];
        const siteBreakdown = {};
        for (const s of room.constructionSites) {
            siteBreakdown[s.structureType] = (siteBreakdown[s.structureType] || 0) + 1;
        }
        const lastSiteError = room.memory.plannerLastSiteError;
        const blockers = diagnoseExtensionBlockers(room);
        return {
            roomName,
            rcl: room.controller && room.controller.level,
            roomLevel: room.level,
            energyCapacity: room.energyCapacityAvailable,
            bunkerHub: room.memory.bunkerHub,
            dynamicLayout: !!room.memory.dynamicLayout,
            extensionClearanceVersion: room.memory.extensionClearanceVersion,
            extensionLayoutVersion: EXTENSION_LAYOUT_VERSION,
            /** Packed plan version in Memory — should match extensionLayoutVersion (6+ = connectivity layout). */
            dynamicPlanVersion: room.memory.dynamicExtensionsVersion,
            dynamicAccessOk: room.memory.dynamicAccessOk,
            dynamicAccessFailed: room.memory.dynamicAccessFailed,
            clearancePending: room.memory.extensionClearanceVersion !== EXTENSION_LAYOUT_VERSION,
            usingNewLayout: room.memory.dynamicLayout
                && room.memory.dynamicExtensionsVersion === EXTENSION_LAYOUT_VERSION
                && EXTENSION_LAYOUT_VERSION >= 5,
            needed,
            built,
            extensionSites: sites,
            deficit: getExtensionDeficit(room),
            siteBudget: roomConstructionSiteBudget(room),
            canPlace: canPlaceConstructionSite(room),
            totalSites: room.constructionSites.length,
            siteBreakdown,
            primaryBlocker: blockers.primaryBlocker,
            lastSkip: room.memory.plannerExtensionSkip,
            lastPlace: room.memory.plannerExtensionLast,
            lastSiteError: lastSiteError && {
                ...lastSiteError,
                age: Game.time - lastSiteError.tick,
            },
            dynamicPositions: positions.length,
            samplePositions: positions.slice(0, 5).map(p => `${p.x},${p.y}`),
            // All plan tiles should be (x+y) even on current generator — visual still “checkerboard”.
            planParityEven: positions.length
                ? positions.filter(p => (p.x + p.y) % 2 === 0).length
                : 0,
            planner: tickTracker[roomName],
            ...auditExtensionPlacement(room),
            resetDynamicLayout: room.memory.dynamicLayout
                ? () => {
                    clearDynamicLayoutMemory(room);
                    return 'cleared';
                }
                : undefined,
        };
    };

    /**
     * Console: diagnoseExtensionBlockers('E1N1') or diagnoseExtensionBlockers() for all owned rooms.
     * Walks every gate (hub, spawn, deficit, site budget, plan tiles, empire scheduler).
     */
    global.diagnoseExtensionBlockers = function (roomName) {
        const {diagnoseExtensionBlockers} = require('planExtensions');
        if (!roomName) {
            const names = (typeof MY_ROOMS !== 'undefined' && MY_ROOMS && MY_ROOMS.length)
                ? MY_ROOMS.slice()
                : Object.values(Game.rooms)
                    .filter(r => r.controller && r.controller.my)
                    .map(r => r.name);
            return names.map(name => {
                const room = Game.rooms[name];
                if (!room) return {roomName: name, error: 'no vision'};
                return diagnoseExtensionBlockers(room);
            }).filter(r => r.error || r.blocked || (r.deficit && r.deficit > 0));
        }
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        return diagnoseExtensionBlockers(room);
    };

    global.forceExtensions = function (roomName) {
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        const {
            tryPlaceRoomExtensions,
            getExtensionDeficit,
            getExtensionPositions,
            clearDynamicLayoutMemory,
        } = require('planExtensions');
        const {roomConstructionSiteBudget, canPlaceConstructionSite} = require('planUtils');
        // Force a fresh dynamic plan when placing after a mass wipe.
        if (room.memory.dynamicLayout) clearDynamicLayoutMemory(room);
        const result = tryPlaceRoomExtensions(room);
        return {
            ...result,
            deficit: getExtensionDeficit(room),
            planTiles: room.memory.dynamicLayout ? getExtensionPositions(room).length : undefined,
            siteBudget: roomConstructionSiteBudget(room),
            canPlace: canPlaceConstructionSite(room),
            dynamicLayout: !!room.memory.dynamicLayout,
            spawns: room.spawns.length,
        };
    };

    global.purgeInvalidExtensions = function (roomName) {
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        const {removeInvalidExtensions} = require('planExtensions');
        return removeInvalidExtensions(room);
    };

    // Console: inspectSpawn('E1N1') — diagnose missing spawn (V2 actors path).
    global.inspectSpawn = function (roomName) {
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        const actors = require('planActors');
        const {canPlaceConstructionSite, roomConstructionSiteBudget} = require('planUtils');
        const {tickTracker} = require('planState');
        const anchor = actors.getSpawnAnchor(room);
        const tile = anchor && {
            x: anchor.x,
            y: anchor.y,
            wall: !!(anchor.checkForWall && anchor.checkForWall()),
            structures: anchor.lookFor(LOOK_STRUCTURES).map(s => s.structureType),
            sites: anchor.lookFor(LOOK_CONSTRUCTION_SITES).map(s => ({
                type: s.structureType,
                progress: s.progress,
                progressTotal: s.progressTotal,
            })),
        };
        const siteBreakdown = {};
        for (const s of room.constructionSites) {
            siteBreakdown[s.structureType] = (siteBreakdown[s.structureType] || 0) + 1;
        }
        return {
            roomName,
            rcl: room.controller && room.controller.level,
            bunkerHub: room.memory.bunkerHub,
            dynamicLayout: !!room.memory.dynamicLayout,
            spawns: room.spawns.length,
            spawnSites: room.constructionSites.filter(s => s.structureType === STRUCTURE_SPAWN).length,
            towers: room.towers.length,
            extensions: room.extensions.length,
            siteBreakdown,
            siteBudget: roomConstructionSiteBudget(room),
            canPlace: canPlaceConstructionSite(room),
            spawnAnchor: tile,
            plannerSpawnBlocked: room.memory.plannerSpawnBlocked,
            planner: tickTracker[roomName],
            lastPlannerRoom: tickTracker.lastRoom,
            v2: actors.inspectSpawn(room),
            force: () => actors.ensureSpawnSite(room),
        };
    };

    global.forceSpawn = function (roomName) {
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        return require('planActors').ensureSpawnSite(room);
    };

    // Read-only: which extensions violate clearance and whether version cleanup has run.
    global.inspectExtensionClearance = function (roomName) {
        const {auditExtensionClearance} = require('planExtensions');
        const {tickTracker} = require('planState');

        if (!roomName) {
            return MY_ROOMS.map((name) => {
                const room = Game.rooms[name];
                if (!room) return {roomName: name, error: 'no vision'};
                const audit = auditExtensionClearance(room);
                audit.planner = tickTracker[name];
                return audit;
            }).filter((r) => r.error || r.clearancePending || r.invalidCount > 0);
        }

        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        const audit = auditExtensionClearance(room);
        const {auditOrphanBarriers} = require('planRamparts');
        audit.orphanBarriers = auditOrphanBarriers(room);
        audit.planner = tickTracker[roomName];
        audit.lastPlannerRoom = tickTracker.lastRoom;
        audit.plannerTick = tickTracker.lastTick;
        audit.plannerDueThisTick = tickTracker.lastTick < Game.time;
        return audit;
    };

    global.purgeOrphanBarriers = function (roomName) {
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        const {purgeOrphanBarriers} = require('planRamparts');
        return purgeOrphanBarriers(room);
    };

    global.recalculateRamparts = function (roomName) {
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        const {recalculateRampartsForRoom} = require('planRamparts');
        return recalculateRampartsForRoom(room);
    };

    // Run clearance + rampart recalc now. Pass true to force even if version already matches.
    global.runExtensionClearance = function (roomName, force) {
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        if (force) delete room.memory.extensionClearanceVersion;
        const {ensureExtensionClearance} = require('planExtensions');
        return ensureExtensionClearance(room, {force: !!force});
    };

    global.inspectRampartRecalc = function (roomName) {
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        const {auditRampartRecalc, auditStrayBarriers, previewRampartCleanup} = require('planRamparts');
        const audit = auditRampartRecalc(room);
        if (audit.cachedSpots > 0) {
            audit.strayBarriers = auditStrayBarriers(room);
        } else if (audit.canCompute) {
            audit.preview = previewRampartCleanup(room);
            audit.strayBarriers = audit.preview.strayBarriers;
        } else {
            audit.strayBarriers = {count: 0, strays: [], reason: 'cannot compute perimeter'};
        }
        return audit;
    };

    /**
     * Diagnose bunker perimeter gaps. Draws room visuals this tick.
     * Usage: debugBarriers('E52S16')
     *        debugBarriers('E52S16', {draw: false})
     *        debugBarriers('E52S16', {recompute: true})  // force hub-floodfill if cache empty
     *        debugBarriers('E52S16', {place: true})      // force ensurePerimeterSites this tick
     *
     * Legend: green=built, yellow=site, red=missing, orange=blocked, blue=hub, cyan=walkway, red line=leak path
     * sealed:false means BFS can still walk hub → exit without crossing planned spots/barriers.
     * placeFails / probe explain why sites were not created.
     */
    global.debugBarriers = function (roomName, options) {
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        const {debugBarriers} = require('planRamparts');
        return debugBarriers(room, options || {});
    };

    /** Full perimeter tile dump (includes every planned tile status). */
    global.diagnosePerimeter = function (roomName, options) {
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        const {diagnosePerimeter} = require('planRamparts');
        return diagnosePerimeter(room, options || {});
    };

    /** Force perimeter recompute, purge off-plan barriers, place missing sites, then debug. */
    /** Wipe all owned walls/ramparts/sites in a room (or all visible) and recompute the hub-flood plan. */
    global.wipeAndRebuildBarriers = function (roomName) {
        const ramparts = require('planRamparts');
        const rooms = roomName
            ? [Game.rooms[roomName]].filter(Boolean)
            : ((MY_ROOMS || []).map((n) => Game.rooms[n]).filter(Boolean));
        const out = [];
        for (const room of rooms) {
            const wiped = ramparts.wipeRoomBarriers(room);
            if (room.memory) room.memory.perimeterPlanRev = ramparts.PERIMETER_PLAN_REV;
            let spots = 0;
            try {
                spots = ramparts.initializeRampartSpots(room, undefined, true) || 0;
            } catch (e) {
                out.push({room: room.name, wiped, error: (e && e.message) || String(e)});
                continue;
            }
            out.push({
                room: room.name,
                wiped,
                spots,
                debug: ramparts.debugBarriers(room, {recompute: false, probe: false}),
            });
        }
        return roomName ? out[0] : out;
    };

    global.rebuildBarriers = function (roomName) {
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        const {
            recalculateRampartsForRoom,
            ensurePerimeterSites,
            purgeOrphanBarriers,
            debugBarriers,
        } = require('planRamparts');
        const recalc = recalculateRampartsForRoom(room);
        // Extra pass: recalc already strips strays; purge catches anything still off-plan.
        let purge = {removed: 0};
        try {
            purge = purgeOrphanBarriers(room);
        } catch (e) {
            purge = {error: (e && e.message) || String(e)};
        }
        // Place immediately — waiting on planner round-robin left gaps for thousands of ticks.
        let placed = 0;
        try {
            placed = ensurePerimeterSites(room, {
                maxPlace: 5,
                bridge: false,
                allowInit: false,
                recordStatus: true,
            });
        } catch (e) {
            room.memory._perimeterPlaceFails = {
                tick: Game.time,
                reason: 'exception',
                error: (e && e.message) || String(e),
                stack: e && e.stack ? String(e.stack).slice(0, 300) : undefined,
            };
        }
        const debug = debugBarriers(room, {recompute: false, probe: true});
        return {recalc, purge, placed, debug};
    };

    // Wipe towers, re-search ring hubs (dist 6-10), and recalculate ramparts.
    // resetAllTowerLayouts() queues one room per planner tick; pass true to run all now.
    global.resetTowerLayout = function (roomName) {
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        const {resetTowerLayoutForRoom} = require('module.roomPlanner');
        return resetTowerLayoutForRoom(room);
    };

    global.resetAllTowerLayouts = function (immediate) {
        const {resetTowerLayoutForRoom, queueTowerLayoutReset} = require('module.roomPlanner');
        const roomNames = (MY_ROOMS && MY_ROOMS.length)
            ? MY_ROOMS.slice()
            : Object.values(Game.rooms)
                .filter((r) => r.controller && r.controller.my)
                .map((r) => r.name);

        if (!immediate) {
            const queue = queueTowerLayoutReset(roomNames);
            return {
                ...queue,
                rooms: roomNames,
                mode: 'queued',
                note: 'one room per planner tick until queue is empty',
            };
        }

        const results = [];
        for (const name of roomNames) {
            const room = Game.rooms[name];
            if (!room) {
                results.push({roomName: name, error: 'no vision'});
                continue;
            }
            results.push(resetTowerLayoutForRoom(room));
        }
        return {
            mode: 'immediate',
            rooms: roomNames.length,
            results,
        };
    };

    global.inspectExpansion = function () {
        const ExpansionControl = require('module.expansion');
        return new ExpansionControl().auditExpansion();
    };

    global.inspectGlobalConstructionSites = function () {
        const {
            countGlobalConstructionSites,
            globalConstructionSiteBudget,
            countRoomConstructionSites,
        } = require('planUtils');
        const byRoom = {};
        for (const id in Game.constructionSites) {
            const site = Game.constructionSites[id];
            const name = site.pos.roomName;
            if (!byRoom[name]) byRoom[name] = {};
            byRoom[name][site.structureType] = (byRoom[name][site.structureType] || 0) + 1;
        }
        const owned = (MY_ROOMS && MY_ROOMS.length)
            ? MY_ROOMS.slice()
            : Object.values(Game.rooms)
                .filter((r) => r.controller && r.controller.my)
                .map((r) => r.name);
        const {globalConstructionSiteLimit} = require('planUtils');
        return {
            globalSites: countGlobalConstructionSites(),
            globalBudget: globalConstructionSiteBudget(),
            globalSiteLimit: globalConstructionSiteLimit(),
            byRoom,
            ownedRooms: owned.map((name) => ({
                roomName: name,
                sites: countRoomConstructionSites(name),
                breakdown: byRoom[name] || {},
            })),
        };
    };

    global.inspectTowerSites = function (roomName) {
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        const {
            countGlobalConstructionSites,
            globalConstructionSiteBudget,
        } = require('planUtils');
        const {auditTowerHubTiles} = require('module.roomPlanner');
        return {
            roomName,
            globalSites: countGlobalConstructionSites(),
            globalBudget: globalConstructionSiteBudget(),
            globalSiteLimit: 100,
            ...auditTowerHubTiles(room),
        };
    };

    global.placeTowerSites = function (roomName, maxPerCall) {
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        const {placeTowerSitesUpToDeficit, getTowerDeficit, auditTowerHubTiles} = require('planAnchors');
        const limit = maxPerCall === undefined ? getTowerDeficit(room) : maxPerCall;
        const placed = placeTowerSitesUpToDeficit(room, limit);
        return {roomName, placed, ...auditTowerHubTiles(room)};
    };

    // One tower site per owned room per call — avoids same-tick placement desync on memhack/private servers.
    global.placeAllTowerSites = function () {
        const {placeTowerSitesUpToDeficit, getTowerDeficit, auditTowerHubTiles} = require('planAnchors');
        const {countGlobalConstructionSites, globalConstructionSiteBudget} = require('planUtils');
        const roomNames = (MY_ROOMS && MY_ROOMS.length)
            ? MY_ROOMS.slice()
            : Object.values(Game.rooms)
                .filter((r) => r.controller && r.controller.my)
                .map((r) => r.name);
        const results = [];
        for (const name of roomNames) {
            const room = Game.rooms[name];
            if (!room) {
                results.push({roomName: name, error: 'no vision'});
                continue;
            }
            if (!getTowerDeficit(room)) {
                results.push({roomName: name, placed: 0, skipped: true, reason: 'no deficit'});
                continue;
            }
            if (globalConstructionSiteBudget() <= 0) {
                results.push({roomName: name, placed: 0, skipped: true, reason: 'global site cap'});
                continue;
            }
            const placed = placeTowerSitesUpToDeficit(room, 1);
            results.push({roomName: name, placed, ...auditTowerHubTiles(room)});
        }
        return {
            rooms: roomNames.length,
            globalSites: countGlobalConstructionSites(),
            globalBudget: globalConstructionSiteBudget(),
            totalPlaced: results.reduce((sum, r) => sum + (r.placed || 0), 0),
            note: 'Run each tick until totalPlaced is 0 or deficits are cleared.',
            results,
        };
    };

    global.inspectTowerLayoutReset = function () {
        const {TOWER_LAYOUT_VERSION} = require('module.roomPlanner');
        const {
            roomConstructionSiteBudget,
            canPlaceConstructionSite,
            countGlobalConstructionSites,
            globalConstructionSiteBudget,
            countRoomConstructionSites,
        } = require('planUtils');
        const roomNames = (MY_ROOMS && MY_ROOMS.length)
            ? MY_ROOMS.slice()
            : Object.values(Game.rooms)
                .filter((r) => r.controller && r.controller.my)
                .map((r) => r.name);
        const lastSiteError = (room) => {
            const err = room.memory.plannerLastSiteError;
            return err && {...err, age: Game.time - err.tick};
        };
        return {
            targetVersion: TOWER_LAYOUT_VERSION,
            globalSites: countGlobalConstructionSites(),
            globalBudget: globalConstructionSiteBudget(),
            globalSiteLimit: 100,
            queue: Memory.towerLayoutResetQueue || [],
            rooms: roomNames.map((name) => {
                const room = Game.rooms[name];
                if (!room) return {roomName: name, error: 'no vision'};
                const hubs = room.memory.towerHubs || [];
                let blockedHubs = 0;
                for (const {x, y} of hubs) {
                    const pos = new RoomPosition(x, y, room.name);
                    if (pos.checkForAllStructure() || pos.checkForConstructionSites()) blockedHubs++;
                }
                return {
                    roomName: name,
                    towerLayoutVersion: room.memory.towerLayoutVersion,
                    pending: (Memory.towerLayoutResetQueue || []).includes(name),
                    towerHubs: hubs.length,
                    blockedHubs,
                    builtTowers: room.towers.length,
                    towerSites: room.constructionSites.filter((s) => s.structureType === STRUCTURE_TOWER).length,
                    totalSites: countRoomConstructionSites(name),
                    siteBudget: roomConstructionSiteBudget(room),
                    globalBudget: globalConstructionSiteBudget(),
                    canPlace: canPlaceConstructionSite(room),
                    lastSiteError: lastSiteError(room),
                };
            }),
        };
    };

    // Console: inspectOwnedRoads('E1N1') � diagnose why owned-room road sites are/aren't placing.
    global.inspectOwnedRoads = function (roomName) {
        const room = Game.rooms[roomName];
        if (!room) return {error: 'no vision', roomName};
        const {
            getDesiredRoadTiles,
            evaluateRoadPlan,
            getRoadOrigin,
            countRoadConstructionSites,
            getRoomRoadStructures,
        } = require('planRoads');
        const {computeLayoutPending} = require('planLayout');
        const siteBudget = require('planSiteBudget');
        const plan = evaluateRoadPlan(room);
        const desired = getDesiredRoadTiles(room);
        const intel = INTEL[roomName] || {};
        const origin = getRoadOrigin(room);
        const layoutPending = computeLayoutPending(room);
        return {
            roomName,
            rcl: room.controller && room.controller.level,
            storage: !!room.storage,
            bunkerHub: room.memory.bunkerHub,
            origin: origin && {x: origin.x, y: origin.y},
            layoutTiles: plan.layout.size,
            connectorTiles: plan.connector.size,
            desiredTiles: desired.size,
            builtRoads: getRoomRoadStructures(room).length,
            missingPlaceable: plan.missing.length,
            complete: plan.complete,
            pathFailures: plan.pathFailures || (plan.stats && plan.stats.failedPaths) || 0,
            roadsBuilt: require('planUtils').getRoadsBuiltFlag(room),
            roadsBuiltIntelLegacy: intel.roadsBuilt,
            roadSites: countRoadConstructionSites(room),
            layoutPending,
            roadLimit: siteBudget.roadLimit(room, {layoutPending}),
            sampleMissing: plan.missing.slice(0, 5).map(p => `${p.x},${p.y}`),
        };
    };


    // Wipe owned-room roads + caches. clearOwnedRoads() = all MY_ROOMS | clearOwnedRoads('E41S23') = one room
    global.clearOwnedRoads = function (pauseTicksOrRoom, roomName) {
        let pauseTicks = 500;
        let targetRoom;
        if (typeof pauseTicksOrRoom === 'string') {
            targetRoom = pauseTicksOrRoom;
            pauseTicks = 0;
        } else {
            pauseTicks = pauseTicksOrRoom === undefined ? 500 : Number(pauseTicksOrRoom) || 0;
            targetRoom = roomName;
        }

        const planRoads = require('planRoads');
        const roomNames = targetRoom
            ? [targetRoom]
            : ((MY_ROOMS && MY_ROOMS.length)
                ? MY_ROOMS.slice()
                : Object.values(Game.rooms)
                    .filter((r) => r.controller && r.controller.my)
                    .map((r) => r.name));
        let destroyed = 0;
        let failed = 0;
        let sites = 0;
        let roadsFound = 0;
        const roomsCleared = [];

        for (const rn of roomNames) {
            const room = Game.rooms[rn];
            if (room && (!room.controller || !room.controller.my)) continue;
            const result = planRoads.clearOwnedRoomRoadNetwork(rn);
            destroyed += result.destroyed;
            failed += result.failed;
            sites += result.sites;
            roadsFound += result.roadsFound || 0;
            roomsCleared.push(rn);
        }

        delete Memory.pauseOwnedRoads;
        if (pauseTicks > 0) Memory.pauseOwnedRoads = Game.time + pauseTicks;
        global.invalidateStructureRoomCaches();
        return {
            destroyed,
            failed,
            sites,
            roadsFound,
            rooms: roomsCleared,
            ownedRooms: MY_ROOMS || [],
            pauseUntil: Memory.pauseOwnedRoads,
            resume: pauseTicks > 0 ? 'resumeOwnedRoads()' : 'planner active immediately',
        };
    };

    global.resetOwnedRoadNetwork = function (roomName) {
        return global.clearOwnedRoads(roomName);
    };

    global.resetAllOwnedRoadNetworks = function () {
        return global.clearOwnedRoads(0);
    };

    global.collectOwnedBarriers = function (roomName) {
        const types = new Set([STRUCTURE_WALL, STRUCTURE_RAMPART]);
        const seen = new Set();
        const walls = [];
        const ramparts = [];
        const add = (s) => {
            if (!s || !types.has(s.structureType) || seen.has(s.id)) return;
            const room = Game.rooms[s.pos.roomName];
            if (!room || !room.controller || !room.controller.my) return;
            if (roomName && room.name !== roomName) return;
            seen.add(s.id);
            if (s.structureType === STRUCTURE_WALL) walls.push(s);
            else ramparts.push(s);
        };
        const roomList = roomName
            ? [Game.rooms[roomName]].filter(Boolean)
            : ((MY_ROOMS && MY_ROOMS.length)
                ? MY_ROOMS.map((n) => Game.rooms[n]).filter(Boolean)
                : Object.values(Game.rooms).filter((r) => r.controller && r.controller.my));

        for (const room of roomList) {
            if (!room.controller || !room.controller.my) continue;
            if (room.constructedWalls && room.constructedWalls.length) room.constructedWalls.forEach(add);
            if (room.ramparts && room.ramparts.length) room.ramparts.forEach(add);
            const fromCache = global.roomStructuresFromGame
                ? global.roomStructuresFromGame(room)
                : [];
            fromCache.forEach(add);
            try {
                room.find(FIND_STRUCTURES, {filter: {structureType: STRUCTURE_WALL}}).forEach(add);
                room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_RAMPART}}).forEach(add);
            } catch (e) { /* corrupt room */ }
        }
        if (Game.structures) {
            for (const id in Game.structures) add(Game.structures[id]);
        }
        return {walls, ramparts, barriers: walls.concat(ramparts), visibleOwnedRooms: roomList.map((r) => r.name)};
    };

    // Console: clearOwnedBarriers() or clearOwnedBarriers('E1N1') � needs vision in target room(s).
    global.clearOwnedBarriers = function (roomName) {
        const types = [STRUCTURE_WALL, STRUCTURE_RAMPART];
        let destroyed = 0;
        let wallsDestroyed = 0;
        let rampartsDestroyed = 0;
        let failed = 0;
        let sites = 0;
        const {walls, ramparts, barriers, visibleOwnedRooms} = global.collectOwnedBarriers(roomName);

        for (const s of barriers) {
            const ret = s.destroy();
            if (ret === OK) {
                destroyed++;
                if (s.structureType === STRUCTURE_WALL) wallsDestroyed++;
                else rampartsDestroyed++;
            } else failed++;
        }

        const siteRooms = roomName
            ? [Game.rooms[roomName]].filter(Boolean)
            : visibleOwnedRooms.map((n) => Game.rooms[n]).filter(Boolean);
        for (const room of siteRooms) {
            if (!room.controller || !room.controller.my) continue;
            let roomSites = [];
            if (room.__nativeFind) {
                try {
                    roomSites = room.__nativeFind(FIND_MY_CONSTRUCTION_SITES) || [];
                } catch (e) { /* corrupt room */ }
            }
            if (!roomSites.length) {
                try {
                    roomSites = room.find(FIND_MY_CONSTRUCTION_SITES);
                } catch (e) { /* corrupt room */ }
            }
            if (global.roomConstructionSitesFromGame) {
                roomSites = roomSites.concat(global.roomConstructionSitesFromGame(room));
            }
            const seenSites = new Set();
            for (const site of roomSites) {
                if (!types.includes(site.structureType) || seenSites.has(site.id)) continue;
                seenSites.add(site.id);
                if (site.remove() === OK) sites++;
            }
        }

        global.invalidateStructureRoomCaches();
        const resetRooms = roomName ? [roomName] : (MY_ROOMS && MY_ROOMS.length ? MY_ROOMS : visibleOwnedRooms);
        for (const rn of resetRooms) {
            if (ROOM_RAMPART_SPOTS) ROOM_RAMPART_SPOTS[rn] = undefined;
            if (typeof quadTraps !== 'undefined') quadTraps[rn] = undefined;
            const mem = Game.rooms[rn] && Game.rooms[rn].memory;
            if (mem) {
                mem.quadTrapWalls = undefined;
                mem.quadTrapCombatFaces = undefined;
            }
        }
        return {
            destroyed,
            wallsDestroyed,
            rampartsDestroyed,
            failed,
            sites,
            wallsFound: walls.length,
            rampartsFound: ramparts.length,
            visibleOwnedRooms,
            ownedRooms: MY_ROOMS || [],
        };
    };

    global.ensureStructureRoomCaches = function () {
        if (structureRoomCacheTick === Game.time) return;
        structureRoomCacheTick = Game.time;
        structureRoomCache = Object.create(null);
        constructionSiteRoomCache = Object.create(null);
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            const roomStructures = room.find(FIND_STRUCTURES);
            for (const structure of roomStructures) {
                if (!structureRoomCache[roomName]) structureRoomCache[roomName] = [];
                structureRoomCache[roomName].push(structure);
            }
        }
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            const roomSites = room.find(FIND_CONSTRUCTION_SITES);
            for (const site of roomSites) {
                if (!constructionSiteRoomCache[roomName]) constructionSiteRoomCache[roomName] = [];
                constructionSiteRoomCache[roomName].push(site);
            }
        }
    };

    global.forceRefreshRoomConstructionSiteCache = function (room) {
        if (!room) return;
        const sites = [];
        try {
            room.find(FIND_CONSTRUCTION_SITES).forEach((site) => sites.push(site));
        } catch (e) {
            for (const id in Game.constructionSites) {
                const site = Game.constructionSites[id];
                if (site.pos.roomName === room.name) sites.push(site);
            }
        }
        constructionSiteRoomCache[room.name] = sites;
        room._constructionSites = sites;
        room._constructionSites_ts = Game.time;
    };

    global.roomNeedsSafeFind = function (room) {
        if (!room) return true;
        return !!(Memory._corruptFindRooms && Memory._corruptFindRooms[room.name]);
    };

    // Safe substitute for room.find(FIND_STRUCTURES) on corrupt rooms � one empire scan per tick.
    global.roomStructuresFromGame = function (room) {
        if (!room) return [];
        global.ensureStructureRoomCaches();
        return structureRoomCache[room.name] || [];
    };

    // Walls + ramparts from Game.structures cache. Room.constructedWalls uses native find and
    // is empty/unreliable on corrupt-room safe-find paths; ramparts alone omit perimeter walls.
    global.forEachRoomStructureList = function (list, fn) {
        if (!list) return;
        if (Array.isArray(list)) {
            list.forEach(fn);
            return;
        }
        try {
            if (typeof list.length === 'number') {
                for (let i = 0; i < list.length; i++) fn(list[i]);
            }
        } catch (e) { /* non-iterable structure list */ }
    };

    global.collectRoomBarriers = function (room) {
        if (!room) return [];
        const seen = new Set();
        const walls = [];
        const ramparts = [];
        const add = (s) => {
            if (!s || seen.has(s.id) || s.pos.roomName !== room.name) return;
            if (s.structureType === STRUCTURE_WALL) {
                seen.add(s.id);
                walls.push(s);
            } else if (s.structureType === STRUCTURE_RAMPART) {
                seen.add(s.id);
                ramparts.push(s);
            }
        };
        global.roomStructuresFromGame(room).forEach(add);
        global.forEachRoomStructureList(room.ramparts, add);
        try {
            global.forEachRoomStructureList(room.constructedWalls, add);
        } catch (e) { /* native find unavailable */ }
        try {
            room.find(FIND_STRUCTURES, {filter: {structureType: STRUCTURE_WALL}}).forEach(add);
            room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_RAMPART}}).forEach(add);
        } catch (e) { /* corrupt room */ }
        if (Game.structures) {
            for (const id in Game.structures) add(Game.structures[id]);
        }
        return walls.concat(ramparts);
    };

    global.roomConstructionSitesFromGame = function (room) {
        if (!room) return [];
        global.ensureStructureRoomCaches();
        return constructionSiteRoomCache[room.name] || [];
    };

    function structureFilterMatch(s, filter) {
        if (!filter) return true;
        if (typeof filter === 'function') return filter(s);
        if (filter.structureType) return s.structureType === filter.structureType;
        return true;
    }

    function inRangeOf(pos, obj, range) {
        return pos.getRangeTo(obj) <= range;
    }

    // Safe substitutes for room.find(FIND_MY_STRUCTURES) / pos.findInRange(FIND_STRUCTURES, �)
    global.roomMyStructures = function (room, opts) {
        if (!room) return [];
        const filter = opts && opts.filter;
        return global.roomStructuresFromGame(room).filter(s =>
            global.safeStructureMy(s) && structureFilterMatch(s, filter)
        );
    };

    global.roomMySpawns = function (room) {
        return global.roomMyStructures(room, {filter: {structureType: STRUCTURE_SPAWN}});
    };

    global.posStructuresInRange = function (pos, range, opts) {
        const room = Game.rooms[pos.roomName];
        if (!room) return [];
        const filter = opts && opts.filter;
        return global.roomStructuresFromGame(room).filter(s =>
            inRangeOf(pos, s, range) && structureFilterMatch(s, filter)
        );
    };

    global.posMyStructuresInRange = function (pos, range, opts) {
        const room = Game.rooms[pos.roomName];
        if (!room) return [];
        const filter = opts && opts.filter;
        return global.roomMyStructures(room).filter(s =>
            inRangeOf(pos, s, range) && structureFilterMatch(s, filter)
        );
    };

    global.posConstructionSitesInRange = function (pos, range, opts) {
        const room = Game.rooms[pos.roomName];
        if (!room) return [];
        const filter = opts && opts.filter;
        return global.roomConstructionSitesFromGame(room).filter(s =>
            inRangeOf(pos, s, range) && structureFilterMatch(s, filter)
        );
    };

    global.reportCorruptObject = function (obj, kind, err) {
        if (!Memory._corruptObjects) Memory._corruptObjects = [];
        const entry = {
            id: obj && obj.id,
            kind,
            room: obj && obj.pos && obj.pos.roomName,
            structureType: obj && obj.structureType,
            tick: Game.time,
            error: err && String(err.message || err),
        };
        const dupe = Memory._corruptObjects.find(o => o.id === entry.id && o.tick === entry.tick);
        if (!dupe) {
            Memory._corruptObjects.push(entry);
            if (Memory._corruptObjects.length > 30) Memory._corruptObjects = Memory._corruptObjects.slice(-30);
        }
    };

    global.reportCorruptFind = function (roomName, findType, err) {
        global.reportCorruptObject({id: `${roomName}:${findType}`, pos: {roomName}}, 'find', err);
        if (!Memory._corruptFindRooms) Memory._corruptFindRooms = {};
        Memory._corruptFindRooms[roomName] = Game.time;
    };

    global.purgeCorruptOwnedStructures = function () {
        let purged = 0;
        const tryPurgeOwned = function (obj, kind, removeFn) {
            let corrupt = false;
            let err;
            try {
                const owner = obj.owner;
                if (!owner || !owner.username) corrupt = true;
            } catch (e) {
                corrupt = true;
                err = e;
            }
            if (!corrupt) {
                try {
                    if (obj instanceof OwnedStructure) void obj.my;
                } catch (e) {
                    corrupt = true;
                    err = e;
                }
            }
            if (!corrupt) return;
            global.reportCorruptObject(obj, kind, err);
            try {
                removeFn();
                purged++;
            } catch (ignored) {
            }
        };
        for (const id in Game.structures) {
            const s = Game.structures[id];
            if (!(s instanceof OwnedStructure)) continue;
            tryPurgeOwned(s, 'structure', () => s.destroy());
        }
        for (const id in Game.constructionSites) {
            const s = Game.constructionSites[id];
            tryPurgeOwned(s, 'constructionSite', () => s.remove());
        }
        if (purged) {
            if (global.invalidateStructureRoomCaches) global.invalidateStructureRoomCaches();
            delete Memory._corruptFindRooms;
            for (const roomName in Game.rooms) {
                const r = Game.rooms[roomName];
                if (r._invalidateStructureCaches) r._invalidateStructureCaches();
                r._downgraded = undefined;
                r._impassibleStructures = undefined;
                r._hostileStructures = undefined;
                r._constructionSites = undefined;
            }
            log.a(`Purged ${purged} corrupt owned object(s). Share Memory._corruptObjects with your server admin.`);
        }
        return purged;
    };

    try {
        const configFile = activeConfig || `config.${Game.shard.name}`;
        require(configFile);
        activeConfig = activeConfig || `config.${Game.shard.name}`;

        console.log('------------------------------------------------------------------');
        console.log(`Loaded config for ${Game.shard.name}`);

        const combatMessage = COMBAT_SERVER
            ? 'Combat Server Mode Active - All Players Considered Hostile'
            : `Manual Enemies - ${HOSTILES.toString()}\nManual Allies - ${MANUAL_FRIENDS.toString()}`;

        console.log(combatMessage);

        if (COMBAT_SERVER) {
            console.log(`Manual Allies (Overrides the above) - ${MANUAL_FRIENDS.toString()}`);
        }

        console.log('------------------------------------------------------------------');
    } catch (e) {
        const fallbackConfig = activeConfig || 'config.default';
        require(fallbackConfig);
        activeConfig = 'config.default';

        console.log('------------------------------------------------------------------');
        console.log('No custom config found, loading default config.');
        console.log("Create a custom config using the naming scheme 'config.shardName.js'");

        const fallbackMessage = COMBAT_SERVER
            ? 'Combat Server Mode Active - All Players Considered Hostile'
            : `Manual Enemies - ${HOSTILES.toString()}\nManual Allies - ${MANUAL_FRIENDS.toString()}`;

        console.log(fallbackMessage);

        if (COMBAT_SERVER) {
            console.log(`Manual Allies (Overrides the above) - ${MANUAL_FRIENDS.toString()}`);
        }

        console.log('------------------------------------------------------------------');
    }

    // Config
    global.BOOST_AMOUNT = function (room, boost) {
        const base = room.level === 6 ? 5000 : room.level === 7 ? 25000 : 50000;
        if (!boost) return base;
        // T3 is the end-goal stockpile (largest target). T1/T2 are intermediate —
        // we want plenty for conversion and direct-use boosting, but at half the volume.
        if (LAB_WAR_PRIORITY.includes(boost) || LAB_PEACE_PRIORITY.includes(boost) || BUY_THESE_BOOSTS.includes(boost)) return base * 2;
        if (TIER_3_BOOSTS.includes(boost) || BASE_COMPOUNDS.includes(boost)) return base;
        if (TIER_2_BOOSTS.includes(boost)) return Math.floor(base * 0.5);
        if (TIER_1_BOOSTS.includes(boost)) return Math.floor(base * 0.5);
        return base;
    };
    global.DUMP_AMOUNT = 50000; // Fills buys (or if overflowing it will offload to other terminals)
    global.REACTION_AMOUNT = 10000; // Minimum amount we aim for base minerals
    // Per-tick lab reaction cost (not exposed as Screeps API constants).
    global.LAB_REACTION_MINERAL = 5;
    global.LAB_REACTION_ENERGY = 5;

    // Versioning for cache purposes
    global.PATHFINDER_VERSION = 1;
    global.INTEL_VERSION = 5;
    global.RAMPART_VERSION = 3;
    global.SAFE_RAMPART_HITS = 10000; // Minimum rampart HP before wallers move on to other barriers

    let controllerContainerCacheTick = -1;
    const controllerContainerCache = {};
    global.resolveControllerContainer = function (room) {
        if (!room) return null;
        if (controllerContainerCacheTick !== Game.time) {
            controllerContainerCacheTick = Game.time;
            for (const key in controllerContainerCache) delete controllerContainerCache[key];
        }
        if (controllerContainerCache[room.name] !== undefined) {
            return controllerContainerCache[room.name];
        }
        const {resolveControllerContainer} = require('planUtils');
        const resolved = resolveControllerContainer(room, true);
        controllerContainerCache[room.name] = resolved;
        return resolved;
    };

    let sourceContainerCacheTick = -1;
    const sourceContainerCache = {};
    global.resolveSourceContainer = function (source, room) {
        if (!source) return null;
        if (sourceContainerCacheTick !== Game.time) {
            sourceContainerCacheTick = Game.time;
            for (const key in sourceContainerCache) delete sourceContainerCache[key];
        }
        if (sourceContainerCache[source.id] !== undefined) {
            return sourceContainerCache[source.id];
        }
        const {resolveSourceContainer} = require('planUtils');
        const resolved = resolveSourceContainer(source, room, true);
        sourceContainerCache[source.id] = resolved;
        return resolved;
    };

    global.resolveSourceContainerSite = function (source) {
        const {resolveSourceContainerSite} = require('planUtils');
        return resolveSourceContainerSite(source);
    };

    // Debug
    global.PATHING_DEBUG = false;

    // Global cache for roles
    global.ROLE_CACHE = {};

    // Combat roles
    global.COMBAT_ROLES = ['attacker', 'claimAttacker', 'defender', 'longbow', 'longbowSquad', 'siegeDuo', 'SKAttacker', 'powerAttacker', 'powerHealer', 'cleaner']

    // Reaction
    // Prio - RA, Heals, Repairs, praising, tough
    global.LAB_WAR_PRIORITY = [RESOURCE_CATALYZED_GHODIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ALKALIDE, RESOURCE_CATALYZED_GHODIUM_ALKALIDE, RESOURCE_CATALYZED_UTRIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ACID, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE];
    global.LAB_PEACE_PRIORITY = [RESOURCE_CATALYZED_GHODIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ALKALIDE, RESOURCE_CATALYZED_LEMERGIUM_ACID, RESOURCE_CATALYZED_GHODIUM_ALKALIDE];
    global.BUY_THESE_BOOSTS = [RESOURCE_GHODIUM_ACID, RESOURCE_KEANIUM_ALKALIDE, RESOURCE_LEMERGIUM_ACID];
    global.TIER_3_BOOSTS = [RESOURCE_CATALYZED_GHODIUM_ALKALIDE, RESOURCE_CATALYZED_GHODIUM_ACID, RESOURCE_CATALYZED_ZYNTHIUM_ACID, RESOURCE_CATALYZED_UTRIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ACID, RESOURCE_CATALYZED_UTRIUM_ALKALIDE, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE];
    global.TIER_2_BOOSTS = [RESOURCE_GHODIUM_ALKALIDE, RESOURCE_GHODIUM_ACID, RESOURCE_ZYNTHIUM_ACID, RESOURCE_ZYNTHIUM_ALKALIDE, RESOURCE_LEMERGIUM_ALKALIDE, RESOURCE_LEMERGIUM_ACID, RESOURCE_KEANIUM_ACID, RESOURCE_KEANIUM_ALKALIDE, RESOURCE_UTRIUM_ALKALIDE, RESOURCE_UTRIUM_ACID];
    global.TIER_1_BOOSTS = [RESOURCE_GHODIUM_HYDRIDE, RESOURCE_GHODIUM_OXIDE, RESOURCE_ZYNTHIUM_HYDRIDE, RESOURCE_ZYNTHIUM_OXIDE, RESOURCE_LEMERGIUM_OXIDE, RESOURCE_LEMERGIUM_HYDRIDE, RESOURCE_KEANIUM_OXIDE, RESOURCE_KEANIUM_HYDRIDE, RESOURCE_UTRIUM_HYDRIDE, RESOURCE_UTRIUM_OXIDE];
    global.BASE_COMPOUNDS = [RESOURCE_GHODIUM, RESOURCE_ZYNTHIUM_KEANITE, RESOURCE_UTRIUM_LEMERGITE, RESOURCE_HYDROXIDE];
    global.BASE_MINERALS = [RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_UTRIUM, RESOURCE_LEMERGIUM, RESOURCE_KEANIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST];
    global.ALL_BOOSTS = _.union(TIER_3_BOOSTS, TIER_2_BOOSTS, TIER_1_BOOSTS, BASE_COMPOUNDS);

    // Commodities
    global.MAKE_THESE_COMMODITIES = [];
    global.BASE_COMMODITIES = [RESOURCE_SILICON, RESOURCE_METAL, RESOURCE_BIOMASS, RESOURCE_MIST];
    global.COMPRESSED_COMMODITIES = [RESOURCE_UTRIUM_BAR, RESOURCE_LEMERGIUM_BAR, RESOURCE_ZYNTHIUM_BAR, RESOURCE_KEANIUM_BAR, RESOURCE_GHODIUM_MELT, RESOURCE_OXIDANT, RESOURCE_REDUCTANT, RESOURCE_PURIFIER, RESOURCE_BATTERY];
    global.REGIONAL_0_COMMODITIES = [RESOURCE_WIRE, RESOURCE_CELL, RESOURCE_ALLOY, RESOURCE_CONDENSATE];
    global.REGIONAL_1_COMMODITIES = [RESOURCE_SWITCH, RESOURCE_PHLEGM, RESOURCE_TUBE, RESOURCE_CONCENTRATE];
    global.REGIONAL_2_COMMODITIES = [RESOURCE_TRANSISTOR, RESOURCE_TISSUE, RESOURCE_FIXTURES, RESOURCE_EXTRACT];
    global.REGIONAL_3_COMMODITIES = [RESOURCE_MICROCHIP, RESOURCE_MUSCLE, RESOURCE_FRAME, RESOURCE_SPIRIT];
    global.REGIONAL_4_COMMODITIES = [RESOURCE_CIRCUIT, RESOURCE_ORGANOID, RESOURCE_HYDRAULICS, RESOURCE_EMANATION];
    global.REGIONAL_5_COMMODITIES = [RESOURCE_DEVICE, RESOURCE_ORGANISM, RESOURCE_MACHINE, RESOURCE_ESSENCE];
    global.HIGHER_COMMODITIES = [RESOURCE_COMPOSITE, RESOURCE_CRYSTAL, RESOURCE_LIQUID];
    global.MANUFACTURED_COMMODITIES = _.union(BASE_COMMODITIES, HIGHER_COMMODITIES, REGIONAL_0_COMMODITIES, REGIONAL_1_COMMODITIES, REGIONAL_2_COMMODITIES, REGIONAL_3_COMMODITIES, REGIONAL_4_COMMODITIES, REGIONAL_5_COMMODITIES);
    global.ALL_COMMODITIES = _.union(BASE_COMMODITIES, HIGHER_COMMODITIES, REGIONAL_0_COMMODITIES, REGIONAL_1_COMMODITIES, REGIONAL_2_COMMODITIES, REGIONAL_3_COMMODITIES, REGIONAL_4_COMMODITIES, REGIONAL_5_COMMODITIES, COMPRESSED_COMMODITIES);

    // Commodity resource types
    global.COMMODITY_RESOURCE_TYPES = {
        [RESOURCE_WIRE]: RESOURCE_UTRIUM,
        [RESOURCE_CELL]: RESOURCE_LEMERGIUM,
        [RESOURCE_ALLOY]: RESOURCE_ZYNTHIUM,
        [RESOURCE_CONDENSATE]: RESOURCE_KEANIUM
    }

    //Cache stuff
    global.CACHE = {};
    global.ROUTE_CACHE = CACHE.ROUTE_CACHE = {};
    global.ROUTE_DISTANCE = CACHE.ROUTE_DISTANCE = {};
    global.PATH_CACHE = CACHE.PATH_CACHE = {};
    global.ROAD_CACHE_OWNED = CACHE.ROAD_CACHE_OWNED = {};
    global.ROAD_CACHE_REMOTE = CACHE.ROAD_CACHE_REMOTE = {};
    global.ROAD_CACHE = CACHE.ROAD_CACHE = CACHE.ROAD_CACHE_OWNED;
    global.ROOM_CPU_ARRAY = CACHE.ROOM_CPU_ARRAY = {};
    global.ROOM_REMOTE_TARGETS = CACHE.ROOM_REMOTE_TARGETS = {};
    global.ROOM_HARVESTER_EXTENSIONS = CACHE.ROOM_HARVESTER_EXTENSIONS = {};
    global.ALLY_HELP_REQUESTS = CACHE.ALLY_HELP_REQUESTS = {};
    global.INTEL = CACHE.INTEL = {};
    if (global.rebuildIntelIndexes) global.rebuildIntelIndexes();
    global.MY_MINERALS = CACHE.MY_MINERALS = {};
    global.CREEP_QUEUES = CACHE.CREEP_QUEUES = {};
    global.MARKET_HISTORY = CACHE.MARKET_HISTORY = {};
    global.ORDER_CACHE = CACHE.ORDER_CACHE = {};
    global.TOWER_DAMAGE_CACHE = CACHE.TOWER_DAMAGE_CACHE = {};
    global.ROOM_RAMPART_SPOTS = CACHE.ROOM_RAMPART_SPOTS = {};

    // Set some diplo stuff
    global.ENEMIES = [];
    global.THREATS = [];
    global.WAR_TARGETS = [];
    global.MY_ROOMS = [];
    global.FRIENDLIES = [];

    // Declare intel cache

    global.ICONS = {
        [STRUCTURE_CONTROLLER]: "\uD83C\uDFF0",
        [STRUCTURE_SPAWN]: "\uD83C\uDFE5",
        [STRUCTURE_EXTENSION]: "\uD83C\uDFEA",
        [STRUCTURE_CONTAINER]: "\uD83D\uDCE4",
        [STRUCTURE_STORAGE]: "\uD83C\uDFE6",
        [STRUCTURE_RAMPART]: "\uD83D\uDEA7",
        [STRUCTURE_WALL]: "\u26F0",
        [STRUCTURE_TOWER]: "\uD83D\uDD2B",
        [STRUCTURE_ROAD]: "\uD83D\uDEE3",
        [STRUCTURE_LINK]: "\uD83D\uDCEE",
        [STRUCTURE_EXTRACTOR]: "\uD83C\uDFED",
        [STRUCTURE_LAB]: "\u2697",
        [STRUCTURE_TERMINAL]: "\uD83C\uDFEC",
        [STRUCTURE_OBSERVER]: "\uD83D\uDCE1",
        [STRUCTURE_POWER_SPAWN]: "\uD83C\uDFDB",
        [STRUCTURE_NUKER]: "\u2622",
        [STRUCTURE_KEEPER_LAIR]: "" // TODO: Add icon for keeper lair
        ,
        [STRUCTURE_PORTAL]: "" // TODO: Add icon for portal
        ,
        [STRUCTURE_POWER_BANK]: "" // TODO: Add icon for power bank
        ,
        source: "" // TODO: Add icon for source
        ,
        constructionSite: "\uD83C\uDFD7",
        resource: "\uD83D\uDEE2",
        creep: "" // TODO: Add icon for creep
        ,
        moveTo: "\u27A1",
        attack: "\uD83D\uDDE1" // NOTE: Same as attackController
        ,
        build: "\uD83D\uDD28",
        repair: "\uD83D\uDD27",
        dismantle: "\u2692",
        harvest: "\u26CF",
        pickup: "\u2B07" // NOTE: Same as withdraw
        ,
        withdraw: "\u2B07" // NOTE: Same as pickup
        ,
        transfer: "\u2B06" // NOTE: Same as upgradeController
        ,
        upgradeController: "\u2B06" // NOTE: Same as transfer
        ,
        claimController: "\uD83D\uDDDD",
        reserveController: "\uD83D\uDD12",
        attackController: "\uD83D\uDDE1" // NOTE: Same as attack
        ,
        recycle: "\u267B",
        tired: "\uD83D\uDCA6",
        stuck0: "\uD83D\uDCA5",
        stuck1: "\uD83D\uDCAB",
        stuck2: "\uD83D\uDCA2",
        wait0: "\uD83D\uDD5B" // 12:00
        ,
        wait1: "\uD83D\uDD67" // 12:30
        ,
        wait2: "\uD83D\uDD50" // 01:00
        ,
        wait3: "\uD83D\uDD5C" // 01:30
        ,
        wait4: "\uD83D\uDD51" // 02:00
        ,
        wait5: "\uD83D\uDD5D" // 02:30
        ,
        wait6: "\uD83D\uDD52" // 03:00
        ,
        wait7: "\uD83D\uDD5E" // 03:30
        ,
        wait8: "\uD83D\uDD53" // 04:00
        ,
        wait9: "\uD83D\uDD5F" // 04:30
        ,
        wait10: "\uD83D\uDD54" // 05:00
        ,
        wait11: "\uD83D\uDD60" // 05:30
        ,
        wait12: "\uD83D\uDD55" // 06:00
        ,
        wait13: "\uD83D\uDD61" // 06:30
        ,
        wait14: "\uD83D\uDD56" // 07:00
        ,
        wait15: "\uD83D\uDD62" // 07:30
        ,
        wait16: "\uD83D\uDD57" // 08:00
        ,
        wait17: "\uD83D\uDD63" // 08:30
        ,
        wait18: "\uD83D\uDD58" // 09:00
        ,
        wait19: "\uD83D\uDD64" // 09:30
        ,
        wait20: "\uD83D\uDD59" // 10:00
        ,
        wait21: "\uD83D\uDD65" // 10:30
        ,
        wait22: "\uD83D\uDD5A" // 11:00
        ,
        wait23: "\uD83D\uDD66" // 11:30
        ,
        sleep: "\uD83D\uDCA4" // for when script is terminated early to refill bucket
        ,
        testPassed: "\uD83C\uDF89" // for when scout reaches its goal location
        ,
        testFinished: "\uD83C\uDFC1" // for when scout has finished its test run
        ,
        reaction: "\ud83d\udd2c",
        haul: "\ud83d\ude9a",
        haul2: "\ud83d\ude9b",
        respond: "\ud83d\ude93",
        boost: "\ud83c\udccf",
        nuke: "\u2622",
        noEntry: "\u26d4",
        renew: "\u26fd",
        greenCheck: "\u2705",
        crossedSword: "\u2694",
        castle: "\ud83c\udff0",
        traffic: "\ud83d\udea6",
        border: "\ud83d\udec2",
        hospital: "\ud83c\udfe5",
        courier: "\ud83d\ude90",
        power: "\u26a1",
        medical: "\u2695",
        eye: "\ud83d\udc40",
        santa: "\ud83c\udf85"
    };

    global.UNIT_COST = (body) => _.sum(body, p => BODYPART_COST[p.type || p]);

    global.CUMULATIVE_CONTROLLER_DOWNGRADE = _.map(CONTROLLER_DOWNGRADE, (v1, k1, c1) => (_.reduce(c1, (a, v2, k2, c2) => (a + ((k2 <= k1) ? v2 : 0)), 0)));

    global.ROOM_ENERGY_CAPACITY = {0: 0, 1: 300, 2: 550, 3: 800, 4: 1300, 5: 1800, 6: 2300, 7: 5600, 8: 12900};

    global.RCL_1_EXTENSIONS = 0;
    global.RCL_2_EXTENSIONS = 5;
    global.RCL_3_EXTENSIONS = 10;
    global.RCL_4_EXTENSIONS = 20;
    global.RCL_5_EXTENSIONS = 30;
    global.RCL_6_EXTENSIONS = 40;
    global.RCL_7_EXTENSIONS = 50;
    global.RCL_8_EXTENSIONS = 60;

    if (Memory.tickInfo) global.EST_SEC_PER_TICK = Memory.tickInfo.tickLength; else global.EST_SEC_PER_TICK = 2.5; // time between ticks is currently averaging ~4.84 seconds (as of 2017/05/07)
    global.EST_TICKS_PER_MIN = Math.ceil(60 / EST_SEC_PER_TICK); // 60s
    global.EST_TICKS_PER_DAY = Math.ceil(86400 / EST_SEC_PER_TICK); // 24h * 60m * 60s = 86400s

    global.toStr = (obj) => JSON.stringify(obj, null, 2); // shortcut to stringify an object (idea credit: warinternal, from the Screeps Slack)

    // Upkeep costs
    global.RAMPART_UPKEEP = RAMPART_DECAY_AMOUNT / REPAIR_POWER / RAMPART_DECAY_TIME;
    global.ROAD_UPKEEP = ROAD_DECAY_AMOUNT / REPAIR_POWER / ROAD_DECAY_TIME;
    global.CONTAINER_UPKEEP = CONTAINER_DECAY / REPAIR_POWER / CONTAINER_DECAY_TIME_OWNED;
    global.REMOTE_CONTAINER_UPKEEP = CONTAINER_DECAY / REPAIR_POWER / CONTAINER_DECAY_TIME;

    // Boost Components
    global.BOOST_COMPONENTS = {
        //Tier 3
        [RESOURCE_CATALYZED_GHODIUM_ALKALIDE]: [RESOURCE_GHODIUM_ALKALIDE, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_GHODIUM_ACID]: [RESOURCE_GHODIUM_ACID, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_ZYNTHIUM_ACID]: [RESOURCE_ZYNTHIUM_ACID, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE]: [RESOURCE_ZYNTHIUM_ALKALIDE, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE]: [RESOURCE_LEMERGIUM_ALKALIDE, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_LEMERGIUM_ACID]: [RESOURCE_LEMERGIUM_ACID, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_KEANIUM_ALKALIDE]: [RESOURCE_KEANIUM_ALKALIDE, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_KEANIUM_ACID]: [RESOURCE_KEANIUM_ACID, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_UTRIUM_ACID]: [RESOURCE_UTRIUM_ACID, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_UTRIUM_ALKALIDE]: [RESOURCE_UTRIUM_ALKALIDE, RESOURCE_CATALYST], //Tier 2
        [RESOURCE_GHODIUM_ACID]: [RESOURCE_GHODIUM_HYDRIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_GHODIUM_ALKALIDE]: [RESOURCE_GHODIUM_OXIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_ZYNTHIUM_ACID]: [RESOURCE_ZYNTHIUM_HYDRIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_ZYNTHIUM_ALKALIDE]: [RESOURCE_ZYNTHIUM_OXIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_LEMERGIUM_ALKALIDE]: [RESOURCE_LEMERGIUM_OXIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_LEMERGIUM_ACID]: [RESOURCE_LEMERGIUM_HYDRIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_KEANIUM_ALKALIDE]: [RESOURCE_KEANIUM_OXIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_KEANIUM_ACID]: [RESOURCE_KEANIUM_HYDRIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_UTRIUM_ACID]: [RESOURCE_UTRIUM_HYDRIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_UTRIUM_ALKALIDE]: [RESOURCE_UTRIUM_OXIDE, RESOURCE_HYDROXIDE], //Tier 1
        [RESOURCE_GHODIUM_HYDRIDE]: [RESOURCE_GHODIUM, RESOURCE_HYDROGEN],
        [RESOURCE_GHODIUM_OXIDE]: [RESOURCE_GHODIUM, RESOURCE_OXYGEN],
        [RESOURCE_ZYNTHIUM_HYDRIDE]: [RESOURCE_ZYNTHIUM, RESOURCE_HYDROGEN],
        [RESOURCE_ZYNTHIUM_OXIDE]: [RESOURCE_ZYNTHIUM, RESOURCE_OXYGEN],
        [RESOURCE_LEMERGIUM_OXIDE]: [RESOURCE_LEMERGIUM, RESOURCE_OXYGEN],
        [RESOURCE_LEMERGIUM_HYDRIDE]: [RESOURCE_LEMERGIUM, RESOURCE_HYDROGEN],
        [RESOURCE_KEANIUM_OXIDE]: [RESOURCE_KEANIUM, RESOURCE_OXYGEN],
        [RESOURCE_KEANIUM_HYDRIDE]: [RESOURCE_KEANIUM, RESOURCE_HYDROGEN],
        [RESOURCE_UTRIUM_HYDRIDE]: [RESOURCE_UTRIUM, RESOURCE_HYDROGEN],
        [RESOURCE_UTRIUM_OXIDE]: [RESOURCE_UTRIUM, RESOURCE_OXYGEN], //Base
        [RESOURCE_GHODIUM]: [RESOURCE_ZYNTHIUM_KEANITE, RESOURCE_UTRIUM_LEMERGITE],
        [RESOURCE_HYDROXIDE]: [RESOURCE_OXYGEN, RESOURCE_HYDROGEN],
        [RESOURCE_ZYNTHIUM_KEANITE]: [RESOURCE_ZYNTHIUM, RESOURCE_KEANIUM],
        [RESOURCE_UTRIUM_LEMERGITE]: [RESOURCE_UTRIUM, RESOURCE_LEMERGIUM]
    };

    global.TOWER_POWER_FROM_RANGE = function (dist, power) {
        if (dist <= TOWER_OPTIMAL_RANGE) {
            return power
        }
        if (dist >= TOWER_FALLOFF_RANGE) {
            return power * (1 - TOWER_FALLOFF);
        }
        let towerFalloffPerTile = TOWER_FALLOFF / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE)
        return Math.round(power * (1 - (dist - TOWER_OPTIMAL_RANGE) * towerFalloffPerTile))
    }

    // Boost Uses
    global.BOOST_USE = {
        'attack': [RESOURCE_CATALYZED_UTRIUM_ACID, RESOURCE_UTRIUM_ACID, RESOURCE_UTRIUM_HYDRIDE],
        'upgrade': [RESOURCE_CATALYZED_GHODIUM_ACID, RESOURCE_GHODIUM_ACID, RESOURCE_GHODIUM_HYDRIDE],
        'tough': [RESOURCE_CATALYZED_GHODIUM_ALKALIDE, RESOURCE_GHODIUM_ALKALIDE, RESOURCE_GHODIUM_OXIDE],
        'ranged_attack': [RESOURCE_CATALYZED_KEANIUM_ALKALIDE, RESOURCE_KEANIUM_ALKALIDE, RESOURCE_KEANIUM_OXIDE],
        'heal': [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_LEMERGIUM_ALKALIDE, RESOURCE_LEMERGIUM_OXIDE],
        'build': [RESOURCE_CATALYZED_LEMERGIUM_ACID, RESOURCE_LEMERGIUM_ACID, RESOURCE_LEMERGIUM_HYDRIDE],
        'move': [RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, RESOURCE_ZYNTHIUM_ALKALIDE, RESOURCE_ZYNTHIUM_OXIDE],
        'harvest': [RESOURCE_CATALYZED_UTRIUM_ALKALIDE, RESOURCE_UTRIUM_ALKALIDE, RESOURCE_UTRIUM_OXIDE],
        'dismantle': [RESOURCE_CATALYZED_ZYNTHIUM_ACID, RESOURCE_ZYNTHIUM_ACID, RESOURCE_ZYNTHIUM_HYDRIDE]
    }

    // Get Username
    global.MY_USERNAME = _.get(_.find(Game.spawns) || _.find(Game.creeps) || _.get(_.find(Game.rooms, room => room.controller && room.controller.my), 'controller'), ['owner', 'username'],);
    // Seed FRIENDLIES on global reset; main.js refreshFriendlies() runs again after populateLOANlist.
    if (!global.MANUAL_FRIENDS) global.MANUAL_FRIENDS = [];
    if (!global.LOAN_LIST) global.LOAN_LIST = [...MANUAL_FRIENDS];
    global.FRIENDLIES = _.union(
        LOAN_LIST,
        MY_USERNAME ? [MY_USERNAME] : [],
        ['Shibdib'],
        MANUAL_FRIENDS
    );

    /*
     Cached dynamic properties: Declaration
     By warinternal, from the Screeps Slack
     NOTES:
     - This function is easiest to use when declared as a global
     - See prototype.creep for usage examples
     */
    global.defineCachedGetter = function (proto, propertyName, fn) {
        Object.defineProperty(proto, propertyName, {
            get: function () {
                if (this === proto || this === undefined) return;
                let result = fn.call(this, this);
                Object.defineProperty(this, propertyName, {
                    value: result, configurable: true, enumerable: false
                });
                return result;
            }, configurable: true, enumerable: false
        });
    };

    //Get average of array
    try {
        global.average = arr => arr.reduce((p, c) => p + c, 0) / arr.length;
    } catch (e) {
        global.average = undefined;
    }

    global.displayText = function (room, x, y, what, br = false) {
        if (!br) {
            room.visual.text(what, x, y, {
                color: "black", opacity: 0.9, align: "left", font: "bold 0.6 Monospace"
            }).text(what, x, y, {
                color: "black", opacity: 0.9, align: "left", font: "bold 0.6 Monospace",
            });
        } else {
            room.visual.text(what, x, y, {
                color: "black",
                opacity: 0.9,
                align: "left",
                font: "bold 0.6 Monospace",
                backgroundColor: "black",
                backgroundPadding: 0.3
            }).text(what, x, y, {
                color: "black",
                opacity: 0.9,
                align: "left",
                font: "bold 0.6 Monospace",
                backgroundColor: "#eeeeee",
                backgroundPadding: 0.2
            });
        }
    };

    // League Of Automated Nations Alliance and NCP processing
    global.populateLOANlist = function (LOANuser = "LeagueOfAutomatedNations", LOANsegment = 99) {
        const shardNames = ['shard0', 'shard1', 'shard2', 'shard3', 'shardX'];
        if (shardNames.includes(Game.shard.name)) {
            // Handle alliance data first
            if (!global.ALLIANCE_DATA_AGE || global.ALLIANCE_DATA_AGE + 10000 < Game.time) {
                global.LOAN_LIST = [...MANUAL_FRIENDS];
                global.LOAN_CHECK = false;
                // Check if the segment is set
                if (RawMemory.foreignSegment && RawMemory.foreignSegment.username && RawMemory.foreignSegment.username === LOANuser && RawMemory.foreignSegment.id === 99) {
                    global.ALLIANCE_DATA_AGE = Game.time;
                    const data = JSON.parse(RawMemory.foreignSegment.data);
                    global.ALLIANCE_DATA = data;
                    const keys = Object.keys(data);
                    for (let iL = keys.length - 1; iL >= 0; iL--) {
                        if (data[keys[iL]].includes(MY_USERNAME)) {
                            global.LOAN_LIST = [...global.LOAN_LIST, ...MANUAL_FRIENDS];
                            global.LOAN_ALLIANCE = keys[iL];
                            break;
                        }
                    }
                    console.log(`Loaded LOAN data from ${LOANuser}.`);
                } else {
                    // Handle not being able to find the data
                    if (!global.LOAN_ATTEMPT) global.LOAN_ATTEMPT = 1; else global.LOAN_ATTEMPT++;
                    if (global.LOAN_ATTEMPT >= 25) {
                        console.log(`Failed to get alliance data from ${LOANuser} after 25 attempts.`);
                        global.LOAN_ATTEMPT = 0;
                        global.ALLIANCE_DATA_AGE = Game.time;
                        global.NCP_DATA_AGE = Game.time;
                        global.LOAN_CHECK = true;
                        global.LOAN_LIST = [...MANUAL_FRIENDS];
                        global.ALLIANCE_DATA = undefined;
                        global.NCP_DATA = undefined;
                        return false;
                    }
                    RawMemory.setActiveForeignSegment(LOANuser, 99);
                }
            } else if (!global.NCP_DATA_AGE || global.NCP_DATA_AGE + 20000 < Game.time) {
                global.LOAN_CHECK = false;
                // Check if the segment is set
                if (RawMemory.foreignSegment && RawMemory.foreignSegment.username && RawMemory.foreignSegment.username === LOANuser && RawMemory.foreignSegment.id === 98) {
                    global.NCP_DATA_AGE = Game.time;
                    global.NCP_DATA = RawMemory.foreignSegment.data;
                    global.LOAN_CHECK = true;
                } else {
                    RawMemory.setActiveForeignSegment(LOANuser, 98);
                }
            }
            return true;
        } else {
            // For non-shard environments
            global.LOAN_CHECK = true;
            global.LOAN_LIST = [...MANUAL_FRIENDS];
            global.ALLIANCE_DATA = undefined;
            if (!global.NCP_DATA) global.NCP_DATA = undefined;
            return false;
        }
    };


    global.shuffle = function (array) {
        let counter = array.length;
        // While there are elements in the array
        while (counter > 0) {
            // Pick a random index
            let index = Math.floor(Math.random() * counter);
            // Decrease counter by 1
            counter--;
            // And swap the last element with it
            let temp = array[counter];
            array[counter] = array[index];
            array[index] = temp;
        }
        return array;
    };

    global.getLevel = function (room) {
        if (!room.controller) return 0;
        const capacity = room.energyCapacityAvailable || 0;
        if (!capacity) return 0;
        let energyLevel = 0;
        for (let lvl = 8; lvl >= 0; lvl--) {
            if (capacity >= ROOM_ENERGY_CAPACITY[lvl]) {
                energyLevel = lvl;
                break;
            }
        }
        return Math.min(energyLevel, room.controller.level);
    };

    global.terminalEnergyTarget = function () {
        return global.TERMINAL_ENERGY_TARGET || TERMINAL_ENERGY_BUFFER + 20000;
    };

    global.terminalExportableEnergy = function (terminal, destRoomName, desiredAmount) {
        const stored = terminal.store[RESOURCE_ENERGY] || 0;
        const floor = TERMINAL_ENERGY_BUFFER;
        if (stored <= floor) return 0;
        let amount = Math.min(desiredAmount || stored - floor, stored - floor);
        if (amount <= 0) return 0;
        const txCost = Game.market.calcTransactionCost(amount, terminal.room.name, destRoomName);
        const maxSafe = stored - floor - txCost;
        return Math.max(0, Math.min(amount, maxSafe));
    };


    function resolveRoomName(roomArg) {
        if (roomArg instanceof Room) return roomArg.name;
        if (roomArg && roomArg.pos !== undefined) return roomArg.pos.roomName;
        if (roomArg && roomArg.roomName !== undefined) return roomArg.roomName;
        if (typeof roomArg === 'string') return roomArg;
        return undefined;
    }

    // Game.notify auto-turns E37S19 into a live room link, which rips history hrefs
    // apart. Encode NSEW in the URL path and as HTML entities in link text.
    const ROOM_DIR_URL = {N: '%4E', S: '%53', E: '%45', W: '%57'};
    const ROOM_DIR_HTML = {N: '&#78;', S: '&#83;', E: '&#69;', W: '&#87;'};

    function encodeRoomDirs(roomName, map) {
        if (!roomName) return roomName;
        let out = '';
        for (let i = 0; i < roomName.length; i++) {
            const c = roomName.charAt(i);
            out += map[c] || c;
        }
        return out;
    }

    function historyTick(tick) {
        const t = tick == null ? Game.time : tick;
        return t - (t % 20);
    }

    function historyHost() {
        const shard = (Game.shard && Game.shard.name) || 'shard0';
        const ptr = Game.shard && Game.shard.ptr;
        const season = /season/i.test(shard);
        const base = ptr ? 'https://screeps.com/ptr' : season ? 'https://screeps.com/season' : 'https://screeps.com/a';
        return {base, shard};
    }

    global.roomLink = function (roomArg, text = undefined, select = true) {
        let id;
        if (roomArg) id = roomArg.id; else return undefined;
        const roomName = resolveRoomName(roomArg);
        if (!roomName) {
            console.log(`Invalid parameter to roomLink global function: ${roomArg} of type ${typeof roomArg}`);
            return undefined;
        }
        text = text || (id ? roomArg : roomName);
        return `<a href="#!/room/${Game.shard.name}/${roomName}" ${select && id ? `onclick="angular.element('body').injector().get('RoomViewPendingSelector').set('${id}')"` : ``}>${text}</a>`;
    };

    global.roomHistoryLink = function (roomArg, text = undefined, select = true, tick) {
        if (!roomArg && roomArg !== '') return undefined;
        const id = roomArg && roomArg.id;
        const roomName = resolveRoomName(roomArg);
        if (!roomName) {
            console.log(`Invalid parameter to roomHistoryLink global function: ${roomArg} of type ${typeof roomArg}`);
            return undefined;
        }
        text = text || (id ? roomArg : roomName);
        const shard = (Game.shard && Game.shard.name) || 'shard0';
        return `<a href="#!/history/${shard}/${roomName}?t=${historyTick(tick)}" ${select && id ? `onclick="angular.element('body').injector().get('RoomViewPendingSelector').set('${id}')"` : ``}>${text}</a>`;
    };

    // Full URL for emails / external clients. Room name is encoded so Game.notify
    // does not rewrite E37S19 into a live-room <a> and break the href.
    global.roomHistoryUrl = function (roomArg, tick) {
        const roomName = resolveRoomName(roomArg);
        if (!roomName) return undefined;
        const {base, shard} = historyHost();
        return `${base}/#!/history/${shard}/${encodeRoomDirs(roomName, ROOM_DIR_URL)}?t=${historyTick(tick)}`;
    };

    // Short Game.notify history link: same idea as roomLink, full URL in href.
    global.roomHistoryNotifyLink = function (roomArg, text, tick) {
        const roomName = resolveRoomName(roomArg);
        const url = global.roomHistoryUrl(roomArg, tick);
        if (!roomName || !url) return undefined;
        return `<a href='${url}'>${encodeRoomDirs(text || roomName, ROOM_DIR_HTML)}</a>`;
    };

    global.getRandomInt = function (min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    };

    global.isEven = function (n) {
        return n % 2 === 0;
    };

    global.isOdd = function (n) {
        return Math.abs(n % 2) === 1;
    };

    global.BUCKET_MAX = 10000;

    global.clamp = function clamp(min, val, max) {
        if (val < min) return min;
        if (val > max) return max;
        return val;
    };

    global.CPU_TASK_LIMITS = {};

    global.SHARD3 = Game.shard.name === 'shard3';

    global.log = new Log();

    global.floodFill = function (roomName) {
        const room = Game.rooms[roomName];
        if (!room) return console.log(`floodFill: no visibility in ${roomName}`);

        const terrain = new Room.Terrain(roomName);
        const startTime = Game.cpu.getUsed();
        const matrix = new PathFinder.CostMatrix();

        global.roomStructuresFromGame(room)
            .filter(s => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART)
            .forEach(s => matrix.set(s.pos.x, s.pos.y, 255));

        // Seed all four edges (i = 0..49 covers every tile including corners)
        const queue = [];
        for (let i = 0; i <= 49; i++) {
            if (terrain.get(i, 0) !== TERRAIN_MASK_WALL) {
                matrix.set(i, 0, 1);
                queue.push([i, 0]);
            }
            if (terrain.get(i, 49) !== TERRAIN_MASK_WALL) {
                matrix.set(i, 49, 1);
                queue.push([i, 49]);
            }
            if (terrain.get(0, i) !== TERRAIN_MASK_WALL) {
                matrix.set(0, i, 1);
                queue.push([0, i]);
            }
            if (terrain.get(49, i) !== TERRAIN_MASK_WALL) {
                matrix.set(49, i, 1);
                queue.push([49, i]);
            }
        }

        // O(n) BFS with a head pointer — avoids O(n²) splice-per-level
        let head = 0;
        while (head < queue.length) {
            const [x, y] = queue[head++];
            for (let dx = x - 1; dx <= x + 1; dx++) {
                for (let dy = y - 1; dy <= y + 1; dy++) {
                    if (dx > 0 && dx < 49 && dy > 0 && dy < 49 && matrix.get(dx, dy) === 0 && (terrain.get(dx, dy) & TERRAIN_MASK_WALL) === 0) {
                        matrix.set(dx, dy, 1);
                        queue.push([dx, dy]);
                    }
                }
            }
        }

        console.log('cpu used:', Game.cpu.getUsed() - startTime);

        const visual = new RoomVisual(roomName);
        for (let x = 1; x < 49; x++) {
            for (let y = 1; y < 49; y++) {
                if (matrix.get(x, y) === 1) {
                    visual.circle(x, y, {radius: 0.2, fill: 'white', opacity: 0.6});
                }
            }
        }
    };

    // Safe toJSON methods for game objects to prevent end-of-tick serialization crashes
    // when a game object is accidentally saved into Memory.
    const safeClasses = [
        'RoomObject', 'Room', 'RoomPosition', 'Creep', 'PowerCreep', 'Structure', 'Spawn', 'OwnedStructure',
        'StructureContainer', 'StructureController', 'StructureExtension', 'StructureExtractor', 'StructureFactory',
        'StructureInvaderCore', 'StructureKeeperLair', 'StructureLab', 'StructureLink', 'StructureNuker',
        'StructureObserver', 'StructurePortal', 'StructurePowerBank', 'StructurePowerSpawn', 'StructureRampart',
        'StructureRoad', 'StructureSpawn', 'StructureStorage', 'StructureTerminal', 'StructureTower', 'StructureWall',
        'ConstructionSite', 'Tombstone', 'Ruin', 'Resource', 'Source', 'Mineral', 'Deposit', 'Nuke', 'Flag'
    ];
    for (let className of safeClasses) {
        if (typeof global[className] !== 'undefined' && global[className].prototype) {
            global[className].prototype.toJSON = function () {
                return this.id || this.name || "[" + className + "]";
            };
        }
    }
    if (typeof RoomPosition !== 'undefined' && RoomPosition.prototype) {
        RoomPosition.prototype.toJSON = function () {
            return {x: this.x, y: this.y, roomName: this.roomName};
        };
    }
};

module.exports = globals;
