/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Version 2.4 - Map HUD: size-budgeted LOD overlays (2026)
 */

const profiler = require("tools.profiler");
const {getShibMove} = require('pathUtils');
const state = require('hcState');
const {
    getEmpireReadiness,
    getOpsPauseReason,
    getOpsStressNote,
    isLiveCombatReady,
    getCombatReadyFailReason,
} = require('hcReadiness');
const {getColonyRole} = require('module.colonyProfile');

const VALID_ROOM_NAME = /^[WE]\d+[NS]\d+$/;
const ROOM_NAME_PARSE = /^([WE])(\d+)([NS])(\d+)$/;

// Engine throws at 1024 KB. Stop adding low-priority layers before that.
const MAP_BUDGET = 850 * 1024;
const NEARBY_RANGE = 4;
const NEARBY_FULL_CAP = 80;
const FAR_PIP_CAP = 200;
const SCOUT_DOT_CAP = 250;
const THREAT_CAP = 40;
const STATIC_REFRESH = 50;
const SCOUT_MAX_AGE = 18000;

const TRAIL_STYLE = {color: '#ffff44', opacity: 0.28, width: 0.3};
const OWNED_FILL = {fill: '#00B7EB', opacity: 0.10, stroke: '#00B7EB', strokeWidth: 1.8};
const RCL_TEXT = {color: '#ffffff', fontSize: 7.5, align: 'center', backgroundColor: '#003344'};
const MINERAL_TEXT = {color: '#aaffff', fontSize: 5.5, align: 'center'};
const BAR_BG = {fill: '#111111', opacity: 0.65};
const BAR_RCL = {fill: '#9B59B6', opacity: 0.85};
const BAR_ENERGY = {fill: '#FFD700', opacity: 0.85};
const OP_LINE = {color: '#ff2222', width: 1.8, opacity: 0.85};
const OP_CIRCLE = {radius: 11, stroke: '#ff2222', strokeWidth: 1.8, fill: 'transparent', opacity: 0.75};
const OP_TEXT = {color: '#ffcccc', fontSize: 5.2, align: 'center', backgroundColor: '#440000'};
const AUX_CIRCLE = {
    radius: 13,
    stroke: '#ffff00',
    strokeWidth: 1.3,
    lineStyle: 'dashed',
    fill: 'transparent',
    opacity: 0.7
};
const AUX_TEXT = {color: '#ffffaa', fontSize: 5.2, align: 'center', backgroundColor: '#444400'};
const EXPAND_CIRCLE = {
    radius: 16,
    stroke: '#00ff00',
    strokeWidth: 1.8,
    fill: '#00ff00',
    opacity: 0.12,
    lineStyle: 'dashed'
};
const EXPAND_TEXT = {color: '#aaffaa', fontSize: 5.5, align: 'center', backgroundColor: '#003300'};
const POWER_TEXT = {color: '#ffdd66', fontSize: 5, align: 'center', backgroundColor: '#221100'};
const NUKE_TEXT = {color: '#ff4444', fontSize: 6, align: 'center', backgroundColor: '#330000'};
const SM_TEXT = {color: '#58d68d', fontSize: 5.5, align: 'center'};
const PORTAL_CIRCLE = {radius: 2.5, fill: '#00ffff', opacity: 0.65};
const LOOT_CIRCLE = {radius: 2.2, fill: '#FFD700', opacity: 0.75};

let _MapVisuals;
let _centerPosCache = {};
let _lastMapCapLog = 0;
let _ownedXYCache = {tick: 0, roomsKey: '', xy: []};

let creepTrailCache = {dots: [], segments: []};
let activeIntelCache = {tick: 0, rooms: []};
let staticIntelCache = {tick: 0, rooms: []};

const HUD_LAYOUT = {
    x: 0.45,
    width: 9.3,
    rowH: 0.92,
    pad: 0.14,
    colValue: 3.6,
    colMeta: 7.0,
};

class HUD {
    constructor() {
        if (!global.HUD_DATA) global.HUD_DATA = {};
        this.hudData = global.HUD_DATA;
        if (Memory.HUD) {
            if (!this.hudData.GCL && Memory.HUD.GCL) this.hudData.GCL = Memory.HUD.GCL;
            if (!this.hudData.RCL && Memory.HUD.RCL) this.hudData.RCL = Memory.HUD.RCL;
            delete Memory.HUD;
        }
        if (!this.hudData.GCL) this.hudData.GCL = {last: Game.gcl.progress, progress: []};
        if (!this.hudData.RCL) this.hudData.RCL = {};
    }

    run() {
        if (!Memory.tickInfo) return;

        if (Memory._mapVisuals !== undefined) delete Memory._mapVisuals;
        this._empireReadiness = state.EMPIRE_READINESS || getEmpireReadiness();
        this._opCount = this.countMilitaryOps();

        this.updateGCLData();

        for (const roomName of this.getOwnedRooms()) {
            const room = Game.rooms[roomName];
            if (!room) continue;
            this.updateRCLData(room);
            this.renderDashboard(room);
        }

        try {
            this.renderMapHUD();
        } catch (e) {
            logMapError('HUD', e);
        }
    }

    getOwnedRooms() {
        return Array.isArray(global.MY_ROOMS) ? global.MY_ROOMS : [];
    }

    updateGCLData() {
        const currentProgress = Game.gcl.progress;
        const gcl = this.hudData.GCL;
        if (currentProgress > gcl.last) {
            gcl.progress.push(currentProgress - gcl.last);
            if (gcl.progress.length > 25) gcl.progress.shift();
            gcl.last = currentProgress;
        } else if (currentProgress < gcl.last) {
            gcl.last = currentProgress;
        }
    }

    updateRCLData(room) {
        if (!room.controller.progressTotal) return;
        const currentProgress = room.controller.progress;
        const rcl = this.hudData.RCL[room.name] || (this.hudData.RCL[room.name] = {
            last: currentProgress,
            progress: [],
        });
        if (currentProgress > rcl.last) {
            rcl.progress.push(currentProgress - rcl.last);
            if (rcl.progress.length > 25) rcl.progress.shift();
            rcl.last = currentProgress;
        } else if (currentProgress < rcl.last) {
            rcl.last = currentProgress;
        }
    }

    countMilitaryOps() {
        let count = 0;
        if (Memory.targetRooms) {
            for (const roomName in Memory.targetRooms) {
                if (Memory.targetRooms[roomName] && VALID_ROOM_NAME.test(roomName)) count++;
            }
        }
        if (Memory.auxiliaryTargets) {
            for (const roomName in Memory.auxiliaryTargets) {
                if (Memory.auxiliaryTargets[roomName] && VALID_ROOM_NAME.test(roomName)) count++;
            }
        }
        return count;
    }

    average(arr) {
        if (!arr || !arr.length) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    formatCompactEnergy(amount) {
        if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'm';
        if (amount >= 1000) return Math.round(amount / 1000) + 'k';
        return String(amount || 0);
    }

    drawHudPanel(room, x, y, width, height) {
        room.visual.rect(x - 0.2, y - 0.48, width + 0.4, height + 0.12, {
            fill: '#080b10',
            opacity: 0.88,
            stroke: '#1e2a38',
            strokeWidth: 0.05
        });
        room.visual.line(x - 0.05, y - 0.48, x + width + 0.05, y - 0.48, {
            color: '#2a3d52', opacity: 0.9, width: 0.04
        });
    }

    drawHudSeparator(room, x, y, width) {
        room.visual.line(x + 0.05, y - 0.42, x + width - 0.05, y - 0.42, {
            color: '#243040', opacity: 0.75, width: 0.025
        });
    }

    drawHudRow(room, x, y, width, left, right, opts = {}) {
        this.drawHudRow3(room, x, y, width, left, null, right, opts);
    }

    drawHudRow3(room, x, y, width, left, value, meta, opts = {}) {
        const {pad, colValue, colMeta} = HUD_LAYOUT;
        const ty = y + 0.11;
        if (left) {
            room.visual.text(left, x + pad, ty, {
                color: opts.leftColor || '#d8dee9',
                align: 'left',
                font: opts.leftFont || 'bold 0.36 Tahoma'
            });
        }
        if (value) {
            room.visual.text(value, x + colValue, ty, {
                color: opts.valueColor || opts.rightColor || '#d8dee9',
                align: 'left',
                font: opts.valueFont || opts.rightFont || 'bold 0.36 Tahoma'
            });
        }
        if (meta) {
            room.visual.text(meta, x + colMeta, ty, {
                color: opts.metaColor || opts.rightColor || '#9aa8b5',
                align: 'right',
                font: opts.metaFont || opts.rightFont || '0.34 Tahoma'
            });
        }
    }

    drawHudRowSplit(room, x, y, width, left, value, subline, opts = {}) {
        const {pad} = HUD_LAYOUT;
        const ty = y + 0.07;
        if (left) {
            room.visual.text(left, x + pad, ty, {
                color: opts.leftColor || '#d8dee9',
                align: 'left',
                font: opts.leftFont || 'bold 0.36 Tahoma'
            });
        }
        if (value) {
            room.visual.text(value, x + width - pad, ty, {
                color: opts.valueColor || '#d8dee9',
                align: 'right',
                font: opts.valueFont || 'bold 0.36 Tahoma'
            });
        }
        if (subline) {
            room.visual.text(subline, x + width - pad, y + 0.4, {
                color: opts.subColor || '#7a8794',
                align: 'right',
                font: opts.subFont || '0.28 Tahoma'
            });
        }
    }

    drawMiniBar(room, x, y, width, pct, color) {
        const clamped = Math.max(0, Math.min(100, pct || 0));
        const barY = y - 0.28;
        const barH = 0.42;
        room.visual.rect(x, barY, width, barH, {fill: '#141c26', opacity: 0.95});
        const fillW = width * (clamped / 100);
        if (fillW > 0) room.visual.rect(x, barY, fillW, barH, {fill: color, opacity: 0.72});
    }

    renderDashboard(room) {
        const {x, width, rowH} = HUD_LAYOUT;
        let y = 0.75;
        const hasAudit = room.energyDiag && room.energyInfo;
        const empire = this._empireReadiness || getEmpireReadiness();
        const pauseReason = hasAudit ? getOpsPauseReason(empire) : null;
        const stressNote = hasAudit ? getOpsStressNote(empire) : null;
        const readinessRows = hasAudit ? ((pauseReason || stressNote) ? 3 : 2) : 0;
        const rows = 1 + (room.level < 8 ? 1 : 0) + 2 + (hasAudit ? 3 + readinessRows : 1);

        this.drawHudPanel(room, x, y, width, rows * rowH);

        const gclInfo = this.getGCLInfo();
        this.drawBar(room, x, y, width, gclInfo.progress, '#00B7EB', `GCL ${gclInfo.level}`, gclInfo.time);
        y += rowH;

        if (room.level < 8) {
            const rclInfo = this.getRCLInfo(room);
            this.drawBar(room, x, y, width, rclInfo.progress, '#9B59B6', `RCL ${rclInfo.level}`, rclInfo.time);
            y += rowH;
        }

        y = this.renderStatusAndDefense(room, x, y, width);
        y += rowH;

        y = this.renderEnergyAudit(room, x, y, width, hasAudit);
        if (hasAudit) this.renderReadiness(room, x, y, width, empire, pauseReason, stressNote);
    }

    renderStatusAndDefense(room, x, y, width) {
        const {rowH} = HUD_LAYOUT;
        const opCount = this._opCount || 0;
        const storage = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
        const terminal = room.terminal ? room.terminal.store[RESOURCE_ENERGY] : 0;
        const displayEnergy = this.formatCompactEnergy(storage + terminal);

        let statusText = 'Secure';
        let statusColor = '#7dcea0';

        if (room.controller.safeMode) {
            statusText = `Safe ${this.timeFormat(room.controller.safeMode * Memory.tickInfo.tickLength)}`;
            statusColor = '#58d68d';
        } else if (INTEL[room.name] && INTEL[room.name].threatLevel) {
            const threat = INTEL[room.name].threatLevel;
            statusText = `Threat L${threat}`;
            statusColor = threat >= 4 ? '#ff5252' : threat >= 3 ? '#ff9f43' : '#ffd166';
        } else if (room.hostileCreeps.length) {
            statusText = `${room.hostileCreeps.length} Hostile`;
            statusColor = '#ffd166';
        }

        const towers = room.towers.filter(t => t.isActive() && t.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST).length;
        if (towers > 0) statusText += ` · ${towers}T`;

        this.drawHudRow3(room, x, y, width, `⚡ ${displayEnergy}`, null, statusText, {
            leftColor: '#ffd76a', leftFont: 'bold 0.4 Tahoma',
            metaColor: statusColor, metaFont: 'bold 0.36 Tahoma'
        });
        y += rowH;

        const bucket = Game.cpu.bucket;
        const cpuColor = bucket < 2000 ? '#ff6b6b' : bucket < 5000 ? '#ffb347' : '#7ec8e3';
        const cpuText = `CPU ${Game.cpu.getUsed().toFixed(1)} · B${bucket}`;
        const milText = opCount > 0 ? `${opCount} mil` : null;

        this.drawHudRow3(room, x, y, width, cpuText, null, milText, {
            leftColor: cpuColor, leftFont: '0.34 Tahoma',
            metaColor: '#8aa0b2', metaFont: '0.32 Tahoma'
        });
        return y;
    }

    renderEnergyAudit(room, x, y, width, hasAudit) {
        const {rowH} = HUD_LAYOUT;

        if (!hasAudit) {
            this.drawHudRow(room, x, y, width, 'Energy audit pending…', null, {
                leftColor: '#6d7a86', leftFont: '0.34 Tahoma'
            });
            return y + rowH;
        }

        const diag = room.energyDiag;
        const info = room.energyInfo;
        const spendDetail = `upg ${diag.upgradeExpense} · drn ${diag.maintenanceExpense || diag.droneExpense || 0} · spn ${diag.spawnExpense}`;

        this.drawHudSeparator(room, x, y, width);
        this.drawHudRowSplit(room, x, y, width, 'Income', `+${info.income}/t`, `harv ${diag.statHarv} · rem ${diag.remoteHarv}`, {
            leftColor: '#5dade2', valueColor: '#5dade2', subColor: '#607080'
        });
        y += rowH;

        this.drawHudRowSplit(room, x, y, width, 'Spend', `-${info.expense}/t`, spendDetail, {
            leftColor: '#f1948a', valueColor: '#f1948a', subColor: '#806868'
        });
        y += rowH;

        const measured = info.spareIncome != null ? Math.round(info.spareIncome) : (room.energyIncome || 0);
        const netSign = measured >= 0 ? '+' : '';
        const netColor = measured >= 0 ? '#9fd89f' : '#ef6b6b';
        const stateLabels = ['CRIT', 'LOW', 'OK', 'SURPLUS'];
        const stateColors = ['#ef6b6b', '#ffb347', '#7dcea0', '#5dade2'];
        const state = Math.min(3, Math.max(0, room.energyState || 0));
        const trend = info.trend != null ? ` Δ${Math.floor(info.trend)}` : '';

        this.drawHudRow3(room, x, y, width, 'Net', `${netSign}${measured}/t`, `${stateLabels[state]}${trend}`, {
            leftColor: netColor, valueColor: netColor,
            metaColor: stateColors[state] || '#7dcea0', metaFont: 'bold 0.34 Tahoma'
        });
        return y + rowH;
    }

    renderReadiness(room, x, y, width, empire, pauseReason, stressNote) {
        const {pad, rowH} = HUD_LAYOUT;
        const diag = room.energyDiag;
        const opsPaused = !!pauseReason;
        const opsThrottled = !opsPaused && !!stressNote;
        const opsColor = opsPaused ? '#ef6b6b' : (opsThrottled ? '#ffb347' : '#7dcea0');
        const opsLabel = opsPaused ? '● HOLD' : (opsThrottled ? '● LOW' : '● GO');

        this.drawHudSeparator(room, x, y, width);
        const nvSuffix = empire.invisible > 0 ? ` (+${empire.invisible} nv)` : '';
        const empireLabel = `Empire ${empire.combatReady}/${empire.minCombatReady}${nvSuffix}`;
        this.drawHudRow(room, x, y, width, opsLabel, empireLabel, {
            leftColor: opsColor, leftFont: 'bold 0.38 Tahoma',
            rightColor: '#aeb9c4', rightFont: '0.34 Tahoma'
        });
        y += rowH;

        const liveCr = isLiveCombatReady(room);
        const crFail = getCombatReadyFailReason(room);
        const crFlag = liveCr ? 'CR ✓' : (crFail ? `CR ✗ ${crFail}` : 'CR ✗');
        const crColor = liveCr ? '#7dcea0' : '#ef6b6b';
        const stockPct = Math.min(100, diag.stockpilePct || 0);
        const stockColor = stockPct >= 100 ? '#5dade2' : stockPct >= 50 ? '#7dcea0' : '#ffb347';
        const barW = width * 0.46;
        const barX = x + pad;

        this.drawMiniBar(room, barX, y, barW, stockPct, stockColor);

        const stockLabel = room.level >= 8
            ? `${this.formatCompactEnergy(diag.stockEnergy)} / ${this.formatCompactEnergy(diag.stockTarget)}`
            : `${stockPct}%`;
        const role = (diag && diag.colonyRole) || getColonyRole(room);
        const roleTag = {launch: 'LNCH', frontier: 'FRNT', core: 'CORE', outpost: 'OUTP'}[role] || '';
        const roomStatus = `${roleTag}  ${crFlag}  ${stockLabel}`;

        room.visual.text(roomStatus, x + width - pad, y + 0.11, {
            color: crColor, align: 'right', font: '0.34 Tahoma'
        });
        y += rowH;

        const skip = state.lastPlanSkip && state.lastPlanSkipTick + 1500 > Game.time
            ? state.lastPlanSkip : null;
        const statusNote = pauseReason || stressNote || skip;
        if (statusNote) {
            this.drawHudRow(room, x, y, width, statusNote, null, {
                leftColor: opsPaused ? '#c97a7a' : '#d4a55a', leftFont: '0.32 Tahoma'
            });
            y += rowH;
        }

        return y;
    }

    getGCLInfo() {
        const avg = this.average(this.hudData.GCL.progress);
        const remaining = avg > 0
            ? (Game.gcl.progressTotal - Game.gcl.progress) / avg * Memory.tickInfo.tickLength
            : Infinity;
        return {
            level: Game.gcl.level,
            progress: Game.gcl.progressTotal > 0 ? (Game.gcl.progress / Game.gcl.progressTotal) * 100 : 0,
            time: this.timeFormat(remaining)
        };
    }

    getRCLInfo(room) {
        const rclData = this.hudData.RCL[room.name] || {progress: []};
        const avg = this.average(rclData.progress);
        const remaining = avg > 0
            ? (room.controller.progressTotal - room.controller.progress) / avg * Memory.tickInfo.tickLength
            : Infinity;
        return {
            level: room.controller.level,
            progress: room.controller.progressTotal > 0
                ? (room.controller.progress / room.controller.progressTotal) * 100
                : 0,
            time: this.timeFormat(remaining)
        };
    }

    drawBar(room, x, y, width, progress, color, textLeft, textRight) {
        const pct = Number.isFinite(progress) ? progress : 0;
        const pad = HUD_LAYOUT.pad;
        room.visual.rect(x + pad * 0.5, y - 0.34, width - pad, 0.68, {fill: '#121820', opacity: 0.9});
        const fillWidth = Math.max(0, Math.min(width - pad, (width - pad) * (pct / 100)));
        if (fillWidth > 0) {
            room.visual.rect(x + pad * 0.5, y - 0.34, fillWidth, 0.68, {fill: color, opacity: 0.7});
        }
        room.visual.text(textLeft, x + pad, y + 0.1, {color: '#eef2f6', align: 'left', font: 'bold 0.4 Tahoma'});
        room.visual.text(`${pct.toFixed(1)}% · ${textRight}`, x + width - pad, y + 0.1, {
            color: '#b8c4ce', align: 'right', font: '0.35 Tahoma'
        });
    }

    ownerColor(name) {
        if (name && this._enemySet.has(name)) return '#ff3333';
        if (name && this._friendSet.has(name)) return '#33ff88';
        return '#e0ce5c';
    }

    collectMapIntel(nearbySet, ownedXY) {
        const owned = this._ownedSet;
        const nearby = [];
        const far = [];
        const seen = new Set();
        const now = Game.time;
        const intelAll = global.INTEL;

        const consider = (roomName, forceNearby) => {
            if (!roomName || owned.has(roomName) || seen.has(roomName)) return;
            if (!VALID_ROOM_NAME.test(roomName)) return;
            seen.add(roomName);
            const intel = intelAll && intelAll[roomName];
            if (!intel) return;
            const notable = (intel.owner && intel.level) ||
                (intel.reservation && !intel.owner) ||
                (intel.invaderCore && intel.invaderCore > now) ||
                intel.commodity ||
                intel.portal;
            if (!notable) return;
            const xy = roomNameToXY(roomName);
            const dist = xy ? minChebyshev(xy, ownedXY) : 99;
            const rec = {roomName, intel, dist};
            if (forceNearby || nearbySet.has(roomName)) nearby.push(rec);
            else far.push(rec);
        };

        const idx = global.getIntelIndexes ? global.getIntelIndexes(now) : null;
        if (idx && idx.byOwner) {
            for (const account in idx.byOwner) {
                const list = idx.byOwner[account];
                if (!list) continue;
                for (let i = 0; i < list.length; i++) {
                    const r = list[i];
                    consider(r && (r.name || r.roomName));
                }
            }
        } else if (intelAll) {
            for (const roomName in intelAll) consider(roomName, false);
        }
        if (idx) {
            forEachName(idx.invaderCores, (n) => consider(n, false));
            forEachName(idx.commodity, (n) => consider(n, false));
        }
        forEachName(nearbySet, (n) => consider(n, false));

        const force = (roomName) => consider(roomName, true);
        if (Memory.targetRooms) {
            for (const roomName in Memory.targetRooms) {
                if (Memory.targetRooms[roomName]) force(roomName);
            }
        }
        if (Memory.auxiliaryTargets) {
            for (const roomName in Memory.auxiliaryTargets) {
                if (Memory.auxiliaryTargets[roomName]) force(roomName);
            }
        }
        if (Memory.claimTarget && Memory.claimTarget.room) force(Memory.claimTarget.room);

        nearby.sort((a, b) => a.dist - b.dist);
        const nearbyKept = nearby.slice(0, NEARBY_FULL_CAP);
        for (let i = NEARBY_FULL_CAP; i < nearby.length; i++) far.push(nearby[i]);
        far.sort((a, b) => {
            const ae = (a.intel.owner && this._enemySet.has(a.intel.owner)) ? 0 : 1;
            const be = (b.intel.owner && this._enemySet.has(b.intel.owner)) ? 0 : 1;
            if (ae !== be) return ae - be;
            return a.dist - b.dist;
        });

        return {
            nearby: nearbyKept,
            far: far.slice(0, FAR_PIP_CAP),
        };
    }

    renderNearbyIntel(roomName, intel, now) {
        if (intel.owner && intel.level) {
            const color = this.ownerColor(intel.owner);
            mapRect(roomName, 0, 0, 50, 50, {fill: color, opacity: 0.08, stroke: color, strokeWidth: 0.8});
            mapText(intel.owner, 25, 18, roomName, {color, fontSize: 4.5, align: 'center', backgroundColor: '#111'});
            mapText('R' + intel.level, 25, 25, roomName, {
                color,
                fontSize: 4.5,
                align: 'center',
                backgroundColor: '#111'
            });
            if (intel.towers) {
                mapText('T' + intel.towers, 42, 25, roomName, {color: '#ffaa66', fontSize: 3.6, align: 'center'});
            }
            if (intel.safemode && intel.safemode > now) {
                mapText('SM', 8, 8, roomName, {color: '#58d68d', fontSize: 3.6, align: 'center'});
            } else if (intel.ticksToDowngrade && intel.ticksToDowngrade < 5000) {
                mapText('DG', 8, 8, roomName, {color: '#ff9966', fontSize: 3.6, align: 'center'});
            }
        } else if (intel.reservation && !intel.owner) {
            const isOurs = this._ourRemotes.has(roomName);
            const color = intel.sk ? '#ff9900' :
                isOurs ? '#00B7EB' :
                    (this._enemySet.has(intel.reservation) ? '#ff6666' : '#66ffaa');
            mapRect(roomName, 0, 0, 50, 50, {
                fill: color, opacity: 0.06, stroke: color, strokeWidth: 0.6, lineStyle: 'dashed'
            });
            mapText(isOurs ? 'RSV' : intel.reservation, 25, 19, roomName, {
                color, fontSize: 4.5, align: 'center', backgroundColor: '#111'
            });
        }

        if (intel.invaderCore && intel.invaderCore > now && !(intel.threatLevel > 0)) {
            mapCircle(25, 25, roomName, {
                radius: 8,
                fill: '#800080',
                opacity: 0.18,
                stroke: '#aa44cc',
                strokeWidth: 0.6
            });
            mapText('CORE', 25, 26, roomName, {color: '#cc88ff', fontSize: 4.5, align: 'center'});
        }

        if (intel.portal) {
            mapCircle(25, 40, roomName, PORTAL_CIRCLE);
            const dest = portalDestLabel(intel.portal);
            if (dest) mapText(dest, 25, 44, roomName, {color: '#88ffff', fontSize: 3.2, align: 'center'});
        }

        if (Number.isFinite(intel.sources) && intel.sources > 0) {
            mapText(intel.sources + 'S', 8, 37, roomName, {color: '#88aaff', fontSize: 3.8, align: 'center'});
        }
        if (intel.mineral) {
            mapText(intel.mineral, 42, 37, roomName, {color: '#88ffaa', fontSize: 3.8, align: 'center'});
        }

        this.renderAgeDot(roomName, intel, now);
    }

    renderFarPip(roomName, intel, now) {
        let color = '#e0ce5c';
        if (intel.owner && intel.level) color = this.ownerColor(intel.owner);
        else if (intel.reservation) {
            color = this._ourRemotes.has(roomName) ? '#00B7EB' :
                (this._enemySet.has(intel.reservation) ? '#ff6666' : '#66ffaa');
        } else if (intel.invaderCore && intel.invaderCore > now) color = '#aa44cc';
        else if (intel.commodity) color = '#4488aa';
        else if (intel.portal) color = '#00cccc';
        mapRect(roomName, 2, 2, 46, 46, {fill: color, opacity: 0.10, stroke: color, strokeWidth: 0.4});
    }

    renderAgeDot(roomName, intel, now) {
        const age = this.getIntelAge(intel, now);
        mapCircle(44, 44, roomName, {radius: 2.2, fill: age.color, opacity: 0.85});
    }

    renderMapHUD() {
        if (!Game.map || !Game.map.visual) return;

        const currentTime = Game.time;
        const bucket = Game.cpu.bucket;
        const myRooms = this.getOwnedRooms();
        this._enemySet = asSet(global.ENEMIES);
        this._friendSet = asSet(global.FRIENDLIES);
        this._ownedSet = asSet(myRooms);
        try {
            this._ourRemotes = collectOurRemotes();
        } catch (e) {
            this._ourRemotes = new Set();
        }

        // Import/rebuild static first. Import failure must not skip live owned/ops.
        try {
            const refreshStatic = !_MapVisuals || currentTime % STATIC_REFRESH === 0;
            if (refreshStatic) {
                this.renderOwnedStatic(myRooms);
                if (bucket >= 2000 && underBudget()) this.renderRemoteLinks(myRooms);
                if (bucket >= 2000 && underBudget()) {
                    const ownedXY = getOwnedXY(myRooms);
                    const nearbySet = buildNearbySet(ownedXY, NEARBY_RANGE);
                    const lists = this.collectMapIntel(nearbySet, ownedXY);
                    staticIntelCache.rooms = lists.nearby.map((r) => r.roomName);
                    staticIntelCache.tick = currentTime;
                    for (let i = 0; i < lists.nearby.length && underBudget(); i++) {
                        this.renderNearbyIntel(lists.nearby[i].roomName, lists.nearby[i].intel, currentTime);
                    }
                    for (let i = 0; i < lists.far.length && underBudget(); i++) {
                        this.renderFarPip(lists.far[i].roomName, lists.far[i].intel, currentTime);
                    }
                    if (underBudget()) this.renderScoutDots(nearbySet, lists.nearby, lists.far, currentTime);
                }
                _MapVisuals = Game.map.visual.export();
            } else if (_MapVisuals) {
                Game.map.visual.import(_MapVisuals);
            }
        } catch (e) {
            _MapVisuals = undefined;
            logMapError('static', e);
        }

        try {
            this.renderOwnedLive(myRooms);
            this.renderOpsLive(currentTime);
        } catch (e) {
            logMapError('live-core', e);
            return;
        }

        if (bucket < 2000) return;
        try {
            if (underBudget()) this.renderThreatsLive(currentTime);
            if (underBudget()) this.renderPowerLive(currentTime);
            if (bucket >= 3000 && underBudget()) this.renderCreepTrails();
        } catch (e) {
            logMapError('live-extra', e);
        }
    }

    renderOwnedStatic(myRooms) {
        for (let i = 0; i < myRooms.length; i++) {
            const roomName = myRooms[i];
            const room = Game.rooms[roomName];
            if (!room) continue;
            mapRect(roomName, 0, 0, 50, 50, OWNED_FILL);
            mapText('R' + room.controller.level, 25, 22, roomName, RCL_TEXT);
            if (room.mineral && room.mineral.mineralType) {
                mapText(room.mineral.mineralType, 5, 8, roomName, MINERAL_TEXT);
            }
        }
    }

    renderOwnedLive(myRooms) {
        for (let i = 0; i < myRooms.length; i++) {
            const roomName = myRooms[i];
            const room = Game.rooms[roomName];
            if (!room) continue;

            if (room.controller.progressTotal) {
                const pct = room.controller.progress / room.controller.progressTotal;
                mapRect(roomName, 1, 41, 48, 3.5, BAR_BG);
                mapRect(roomName, 1, 41, 48 * pct, 3.5, BAR_RCL);
            }

            if (room.storage || room.terminal) {
                const energy = (room.storage ? room.storage.store[RESOURCE_ENERGY] : 0) +
                    (room.terminal ? room.terminal.store[RESOURCE_ENERGY] : 0);
                const pct = Math.min(1, energy / 500000);
                mapRect(roomName, 1, 45, 48, 3.5, BAR_BG);
                mapRect(roomName, 1, 45, 48 * pct, 3.5, BAR_ENERGY);
            }

            if (room.controller.safeMode) {
                mapText('SM', 40, 9, roomName, SM_TEXT);
            }

            if (room.nukes && room.nukes.length > 0) {
                let eta = room.nukes[0].timeToLand;
                for (let n = 1; n < room.nukes.length; n++) {
                    if (room.nukes[n].timeToLand < eta) eta = room.nukes[n].timeToLand;
                }
                const label = room.nukes.length > 1
                    ? 'NK' + room.nukes.length + ' ' + compactTicks(eta)
                    : 'NK ' + compactTicks(eta);
                mapText(label, 25, 6, roomName, NUKE_TEXT);
            }
        }
    }

    renderScoutDots(nearbySet, nearbyList, farList, now) {
        const notable = new Set();
        for (let i = 0; i < nearbyList.length; i++) notable.add(nearbyList[i].roomName);
        if (farList) {
            for (let i = 0; i < farList.length; i++) notable.add(farList[i].roomName);
        }
        const owned = this._ownedSet;
        const intelAll = global.INTEL;
        if (!intelAll) return;
        let drawn = 0;
        forEachName(nearbySet, (roomName) => {
            if (drawn >= SCOUT_DOT_CAP || !underBudget()) return;
            if (owned.has(roomName) || notable.has(roomName)) return;
            const intel = intelAll[roomName];
            if (!intel || !intel.lastObservation) return;
            if (now - intel.lastObservation > SCOUT_MAX_AGE) return;
            this.renderAgeDot(roomName, intel, now);
            drawn++;
        });
    }

    renderOpsLive(currentTime) {
        if (Memory.claimTarget && Memory.claimTarget.room && VALID_ROOM_NAME.test(Memory.claimTarget.room)) {
            const roomName = Memory.claimTarget.room;
            mapCircle(25, 25, roomName, EXPAND_CIRCLE);
            mapText('EXPAND', 25, 11, roomName, EXPAND_TEXT);
        }

        if (Memory.targetRooms) {
            for (const roomName in Memory.targetRooms) {
                const target = Memory.targetRooms[roomName];
                if (!target || !VALID_ROOM_NAME.test(roomName)) continue;
                const a = mapPos(15, 25, roomName);
                const b = mapPos(35, 25, roomName);
                const c = mapPos(25, 15, roomName);
                const d = mapPos(25, 35, roomName);
                const mid = centerPos(roomName);
                if (a && b) Game.map.visual.line(a, b, OP_LINE);
                if (c && d) Game.map.visual.line(c, d, OP_LINE);
                if (mid) Game.map.visual.circle(mid, OP_CIRCLE);
                let tgtLabel = target.type ? 'OP ' + target.type.toUpperCase() : 'OP';
                let style = OP_TEXT;
                if (target.dDay) {
                    const eta = target.dDay - currentTime;
                    tgtLabel = 'NK ' + (eta > 0 ? compactTicks(eta) : 'NOW');
                    style = NUKE_TEXT;
                }
                mapText(tgtLabel, 25, 39, roomName, style);
            }
        }

        if (Memory.auxiliaryTargets) {
            for (const roomName in Memory.auxiliaryTargets) {
                const target = Memory.auxiliaryTargets[roomName];
                if (!target || !VALID_ROOM_NAME.test(roomName)) continue;
                mapCircle(25, 25, roomName, AUX_CIRCLE);
                mapText('AUX ' + (target.type ? target.type.toUpperCase() : ''), 25, 44, roomName, AUX_TEXT);
            }
        }
    }

    renderThreatsLive(currentTime) {
        if (currentTime - activeIntelCache.tick >= 10) {
            activeIntelCache.rooms = [];
            const owned = this._ownedSet;
            const idx = global.getIntelIndexes ? global.getIntelIndexes(currentTime) : null;
            const add = (roomName) => {
                if (!roomName || owned.has(roomName) || !VALID_ROOM_NAME.test(roomName)) return;
                const intel = global.INTEL && global.INTEL[roomName];
                if (intel && (intel.threatLevel > 0 || intel.loot || intel.invaderCore || intel.armedHostile)) {
                    activeIntelCache.rooms.push(roomName);
                }
            };
            if (idx) {
                const seen = new Set();
                const pushIdx = (src) => {
                    forEachName(src, (roomName) => {
                        if (seen.has(roomName)) return;
                        seen.add(roomName);
                        add(roomName);
                    });
                };
                pushIdx(idx.threats);
                pushIdx(idx.invaderCores);
                if (staticIntelCache.rooms) {
                    for (let i = 0; i < staticIntelCache.rooms.length; i++) {
                        const roomName = staticIntelCache.rooms[i];
                        if (seen.has(roomName)) continue;
                        seen.add(roomName);
                        const intel = global.INTEL && global.INTEL[roomName];
                        if (intel && (intel.loot || intel.armedHostile)) add(roomName);
                    }
                }
            } else if (global.INTEL) {
                for (const roomName in global.INTEL) add(roomName);
            }
            activeIntelCache.tick = currentTime;
        }

        const threatColors = ['', '#ffcc00', '#ff9900', '#ff5500', '#ff2200', '#ff0044'];
        const rooms = activeIntelCache.rooms;
        const limit = Math.min(rooms.length, THREAT_CAP);
        for (let i = 0; i < limit; i++) {
            if (!underBudget()) break;
            const roomName = rooms[i];
            const intel = global.INTEL && global.INTEL[roomName];
            if (!intel) continue;

            if (intel.threatLevel > 0) {
                const isStronghold = !!(intel.invaderCore && intel.invaderCore > currentTime);
                const baseColor = threatColors[intel.threatLevel] || '#ff0044';
                const color = isStronghold ? '#cc44ff' : baseColor;
                const isActive = intel.armedHostile && currentTime - intel.armedHostile < 200;

                mapCircle(25, 25, roomName, {
                    radius: 11 + intel.threatLevel * 1.2,
                    fill: color,
                    opacity: isActive ? 0.22 : 0.10,
                    stroke: color, strokeWidth: isActive ? 1.6 : 0.6
                });

                const threatLabels = ['', 'UNARMED', 'INVADER', 'PLAYER', 'MULTI', 'BOOSTED'];
                const label = isStronghold && intel.threatLevel <= 2 ? 'STRONGHOLD' : (threatLabels[intel.threatLevel] || 'THREAT');
                mapText(label, 25, 18, roomName, {
                    color, fontSize: 4.8, align: 'center', backgroundColor: '#000000'
                });

                if (intel.threatLevel >= 3 && intel.hostileOwners && intel.hostileOwners.length) {
                    const display = intel.hostileOwners.length > 1
                        ? intel.hostileOwners[0] + ' +' + (intel.hostileOwners.length - 1)
                        : intel.hostileOwners[0];
                    mapText(display, 25, 25, roomName, {
                        color: '#ffffff', fontSize: 4.5, align: 'center', backgroundColor: '#220000'
                    });
                }
                if (isActive) {
                    mapText('ACTIVE', 25, 32, roomName, {
                        color: '#ffffff', fontSize: 3.8, align: 'center', backgroundColor: '#330000'
                    });
                }

                if (intel.roomHeat) {
                    const heatPct = Math.min(1, intel.roomHeat / 1000);
                    mapRect(roomName, 1, 1, 48, 1.8, {fill: '#111111', opacity: 0.5});
                    mapRect(roomName, 1, 1, 48 * heatPct, 1.8, {fill: color, opacity: 0.75});
                }
            }

            if (intel.loot) mapCircle(8, 40, roomName, LOOT_CIRCLE);
        }
    }

    renderPowerLive(currentTime) {
        const idx = global.getIntelIndexes ? global.getIntelIndexes(currentTime) : null;
        if (!idx) return;
        if (idx.power) {
            forEachName(idx.power, (roomName) => {
                if (!underBudget()) return;
                const intel = global.INTEL && global.INTEL[roomName];
                if (!intel || !intel.power || intel.power <= currentTime) return;
                const ttl = intel.power - currentTime;
                let text = 'P';
                if (intel.powerAmount) text += this.formatCompactEnergy(intel.powerAmount);
                text += ' ' + compactTicks(ttl);
                if (intel.powerMined) text += ' !';
                mapText(text, 25, 12, roomName, POWER_TEXT);
            });
        }
        if (idx.commodity) {
            forEachName(idx.commodity, (roomName) => {
                if (!underBudget()) return;
                const intel = global.INTEL && global.INTEL[roomName];
                if (!intel || !intel.commodity) return;
                let text = String(intel.commodity);
                if (intel.commodityCooldown) text += ' ' + intel.commodityCooldown;
                mapText(text, 25, 12, roomName, {
                    color: '#88ddff',
                    fontSize: 4.5,
                    align: 'center',
                    backgroundColor: '#001122'
                });
            });
        }
    }

    renderRemoteLinks(myRooms) {
        if (!global.ROOM_REMOTE_TARGETS) return;
        const now = Game.time;
        for (let i = 0; i < myRooms.length; i++) {
            const colonyName = myRooms[i];
            const targets = ROOM_REMOTE_TARGETS[colonyName];
            if (!targets) continue;
            const from = centerPos(colonyName);
            if (!from) continue;
            for (let t = 0; t < targets.length; t++) {
                const target = targets[t];
                if (!target || !target.room) continue;
                const intel = (global.INTEL && global.INTEL[target.room]) || {};
                const isActive = intel.activeRemote && now - intel.activeRemote < 500;
                if (!isActive) continue;
                const to = centerPos(target.room);
                if (!to) continue;
                const color = intel.sk ? '#ff9900' : '#00ff88';
                Game.map.visual.line(from, to, {color, opacity: 0.35, width: 1.0});
                mapCircle(25, 25, target.room, {radius: 1.8, fill: color, opacity: 0.3});
            }
        }
    }

    renderCreepTrails() {
        if (Game.time % 5 === 0) {
            const dots = [];
            const segments = new Set();

            const routesByDest = {};
            if (global.CACHE && CACHE.ROUTE_CACHE) {
                for (const key in CACHE.ROUTE_CACHE) {
                    const entry = CACHE.ROUTE_CACHE[key];
                    if (!entry || entry.failed || !entry.route || entry.route.length < 2) continue;
                    const dest = entry.route[entry.route.length - 1];
                    (routesByDest[dest] = routesByDest[dest] || []).push(entry.route);
                }
            }

            const military = global.world && global.world.militaryCreeps;
            const acc = (creep) => {
                if (!creep.my || !creep.memory.destination || !creep.memory.operation) return;

                const dest = creep.memory.destination;
                const room = creep.pos.roomName;
                dots.push({x: creep.pos.x, y: creep.pos.y, room});
                if (room === dest) return;

                let route;
                const shibMove = getShibMove(creep);
                if (shibMove && Array.isArray(shibMove.route) && shibMove.route.includes(room) &&
                    shibMove.route[shibMove.route.length - 1] === dest) {
                    route = shibMove.route;
                } else if (routesByDest[dest]) {
                    const candidates = routesByDest[dest].filter(r => r.includes(room));
                    route = candidates.length
                        ? candidates.reduce((a, b) => a.length <= b.length ? a : b)
                        : routesByDest[dest][0];
                }

                if (route) {
                    const startIdx = route.indexOf(room);
                    if (startIdx >= 0) {
                        for (let i = startIdx; i < route.length - 1; i++) {
                            const a = route[i];
                            const b = route[i + 1];
                            segments.add(a < b ? a + '|' + b : b + '|' + a);
                        }
                        return;
                    }
                }
                segments.add(room < dest ? room + '|' + dest : dest + '|' + room);
            };
            if (military) {
                for (let i = 0; i < military.length; i++) acc(military[i]);
            } else {
                for (const name in Game.creeps) acc(Game.creeps[name]);
            }
            creepTrailCache = {dots, segments: Array.from(segments)};
        }

        const dots = creepTrailCache.dots;
        for (let i = 0; i < dots.length; i++) {
            const t = dots[i];
            mapCircle(t.x, t.y, t.room, {radius: 0.95, fill: '#ffff44', opacity: 0.75});
        }
        const segs = creepTrailCache.segments;
        for (let i = 0; i < segs.length; i++) {
            const parts = segs[i].split('|');
            const a = centerPos(parts[0]);
            const b = centerPos(parts[1]);
            if (a && b) Game.map.visual.line(a, b, TRAIL_STYLE);
        }
    }

    getIntelAge(intel, now) {
        if (!intel || !intel.lastObservation) return {text: '??', color: '#666666'};
        const ageTicks = now - intel.lastObservation;
        if (ageTicks <= 40) return {text: 'now', color: '#66BB6A'};
        const tickLen = (Memory.tickInfo && Memory.tickInfo.tickLength) || 3.5;
        const secs = ageTicks * tickLen;
        if (secs < 180) {
            return {text: '1m', color: '#a5d6a7'};
        } else if (secs < 600) {
            return {text: Math.floor(secs / 60) + 'm', color: '#a5d6a7'};
        } else if (secs < 3600) {
            return {text: Math.floor(secs / 60) + 'm', color: '#FFB347'};
        } else if (secs < 86400) {
            return {text: Math.floor(secs / 3600) + 'h', color: '#ff9966'};
        }
        return {text: Math.floor(secs / 86400) + 'd', color: '#888888'};
    }

    timeFormat(seconds) {
        if (seconds === Infinity || seconds < 0 || isNaN(seconds)) return 'Calculating...';
        const [h, m, s] = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), Math.floor(seconds % 60)];
        return `${h}h ${m}m ${s}s`.replace(/\b0\w+\s*/g, '');
    }
}

function logMapError(where, e) {
    if (_lastMapCapLog && Game.time - _lastMapCapLog < 50) return;
    _lastMapCapLog = Game.time;
    const msg = String((e && e.message) || e);
    let size = 0;
    try {
        size = Game.map.visual.getSize();
    } catch (err) { /* ignore */
    }
    if (typeof log !== 'undefined' && log.e) {
        log.e('MapVisual ' + where + ' (' + size + 'B): ' + msg);
        if (e && e.stack) log.e(e.stack);
    }
}

function asSet(v) {
    if (!v) return new Set();
    if (v instanceof Set) return v;
    if (Array.isArray(v)) return new Set(v);
    return new Set();
}

function forEachName(src, fn) {
    if (!src) return;
    if (typeof src.forEach === 'function') {
        src.forEach(fn);
        return;
    }
    if (typeof src === 'object') {
        for (const k in src) fn(typeof src[k] === 'string' ? src[k] : k);
    }
}

function underBudget() {
    try {
        return Game.map.visual.getSize() < MAP_BUDGET;
    } catch (e) {
        return false;
    }
}

function roomNameToXY(roomName) {
    const m = roomName.match(ROOM_NAME_PARSE);
    if (!m) return null;
    let x = parseInt(m[2], 10);
    let y = parseInt(m[4], 10);
    if (m[1] === 'W') x = -x - 1;
    if (m[3] === 'S') y = -y - 1;
    return [x, y];
}

function xyToRoomName(x, y) {
    return (x < 0 ? 'W' + (-x - 1) : 'E' + x) + (y < 0 ? 'S' + (-y - 1) : 'N' + y);
}

function minChebyshev(xy, ownedXY) {
    let min = 99;
    for (let i = 0; i < ownedXY.length; i++) {
        const d = Math.max(Math.abs(xy[0] - ownedXY[i][0]), Math.abs(xy[1] - ownedXY[i][1]));
        if (d < min) min = d;
    }
    return min;
}

function getOwnedXY(myRooms) {
    if (!myRooms || !myRooms.length) return [];
    const key = myRooms.join(',');
    if (_ownedXYCache.tick === Game.time && _ownedXYCache.roomsKey === key) return _ownedXYCache.xy;
    const xy = [];
    for (let i = 0; i < myRooms.length; i++) {
        const parsed = roomNameToXY(myRooms[i]);
        if (parsed) xy.push(parsed);
    }
    _ownedXYCache = {tick: Game.time, roomsKey: key, xy};
    return xy;
}

function buildNearbySet(ownedXY, range) {
    const set = new Set();
    for (let i = 0; i < ownedXY.length; i++) {
        const ox = ownedXY[i][0];
        const oy = ownedXY[i][1];
        for (let dx = -range; dx <= range; dx++) {
            for (let dy = -range; dy <= range; dy++) {
                set.add(xyToRoomName(ox + dx, oy + dy));
            }
        }
    }
    return set;
}

function collectOurRemotes() {
    const set = new Set();
    if (!global.ROOM_REMOTE_TARGETS) return set;
    for (const colonyName in ROOM_REMOTE_TARGETS) {
        const targets = ROOM_REMOTE_TARGETS[colonyName];
        if (!targets) continue;
        for (let i = 0; i < targets.length; i++) {
            if (targets[i] && targets[i].room) set.add(targets[i].room);
        }
    }
    return set;
}

function centerPos(roomName) {
    let p = _centerPosCache[roomName];
    if (p) return p;
    try {
        p = _centerPosCache[roomName] = new RoomPosition(25, 25, roomName);
    } catch (e) {
        return null;
    }
    return p;
}

function mapPos(x, y, roomName) {
    x = x | 0;
    y = y | 0;
    if (x < 0 || x > 49 || y < 0 || y > 49) return null;
    if (x === 25 && y === 25) return centerPos(roomName);
    try {
        return new RoomPosition(x, y, roomName);
    } catch (e) {
        return null;
    }
}

function mapText(text, x, y, roomName, style) {
    const pos = mapPos(x, y, roomName);
    if (pos) Game.map.visual.text(text, pos, style);
}

function mapRect(roomName, x, y, w, h, style) {
    const pos = mapPos(x, y, roomName);
    if (pos) Game.map.visual.rect(pos, w, h, style);
}

function mapCircle(x, y, roomName, style) {
    const pos = mapPos(x, y, roomName);
    if (pos) Game.map.visual.circle(pos, style);
}

function compactTicks(ticks) {
    if (ticks >= 1000) return Math.ceil(ticks / 1000) + 'k';
    return String(Math.max(0, Math.ceil(ticks)));
}

function portalDestLabel(raw) {
    try {
        const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const d = p && p.destination;
        if (!d) return null;
        if (d.shard) return d.shard;
        return d.room || d.roomName || null;
    } catch (e) {
        return null;
    }
}

profiler.registerClass(HUD, 'HUD');
module.exports = HUD;
