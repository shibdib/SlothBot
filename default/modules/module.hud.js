/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Version 2.3 - Map HUD: intel age badges (non-disruptive corner dots + age text for notable + recent scouted rooms) (2026)
 */

const profiler = require("tools.profiler");

const VALID_ROOM_NAME = /^[WE]\d+[NS]\d+$/;
let _MapVisuals;

let creepTrailCache = [];
let activeIntelCache = {tick: 0, rooms: []};
let staticIntelCache = {tick: 0, rooms: []};
let subtleIntelCache = {tick: 0, rooms: []};

class HUD {
    constructor() {
        if (!Memory.HUD) Memory.HUD = {};
        this.hudData = Memory.HUD;
        if (!this.hudData.GCL) this.hudData.GCL = {last: Game.gcl.progress, progress: []};
        if (!this.hudData.RCL) this.hudData.RCL = {};
    }

    run() {
        if (!Memory.tickInfo) return;

        Memory._mapVisuals = undefined;

        this.updateGCLData();

        for (const roomName of this.getOwnedRooms()) {
            const room = Game.rooms[roomName];
            if (!room) continue;
            this.updateRCLData(room);
            this.renderDashboard(room);
        }

        this.renderMapHUD();
    }

    getOwnedRooms() {
        return global.MY_ROOMS || [];
    }

    updateGCLData() {
        const currentProgress = Game.gcl.progress;
        if (currentProgress > this.hudData.GCL.last) {
            this.hudData.GCL.progress.push(currentProgress - this.hudData.GCL.last);
            if (this.hudData.GCL.progress.length > 25) this.hudData.GCL.progress.shift();
        }
        this.hudData.GCL.last = currentProgress;
    }

    updateRCLData(room) {
        if (!room.controller.progressTotal) return;
        const currentProgress = room.controller.progress;
        this.hudData.RCL[room.name] = this.hudData.RCL[room.name] || {last: currentProgress, progress: []};
        if (currentProgress > this.hudData.RCL[room.name].last) {
            this.hudData.RCL[room.name].progress.push(currentProgress - this.hudData.RCL[room.name].last);
            if (this.hudData.RCL[room.name].progress.length > 25) this.hudData.RCL[room.name].progress.shift();
        }
        this.hudData.RCL[room.name].last = currentProgress;
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

    renderDashboard(room) {
        let y = 0.75;
        const x = 0.5;
        const width = 9.0;
        const hasAudit = room.memory.energyDiag && room.memory.energyInfo;

        let rows = 1 + (room.level < 8 ? 1 : 0) + 1 + (hasAudit ? 3 : 1);

        room.visual.rect(x - 0.25, y - 0.5, width + 0.5, (rows * 1.05) + 0.15, {
            fill: '#0a0a0a',
            opacity: 0.82,
            stroke: '#222222',
            strokeWidth: 0.04
        });

        const gclInfo = this.getGCLInfo();
        this.drawBar(room, x, y, width, gclInfo.progress, '#00B7EB', `GCL ${gclInfo.level}`, gclInfo.time);
        y += 1.05;

        if (room.level < 8) {
            const rclInfo = this.getRCLInfo(room);
            this.drawBar(room, x, y, width, rclInfo.progress, '#9B59B6', `RCL ${rclInfo.level}`, rclInfo.time);
            y += 1.05;
        }

        this.renderStatusAndDefense(room, x, y, width);
        y += 1.05;

        this.renderEnergyAudit(room, x, y, width, hasAudit);
    }

    renderStatusAndDefense(room, x, y, width) {
        const divider = x + 3.2;
        const opCount = this.countMilitaryOps();

        const storage = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
        const terminal = room.terminal ? room.terminal.store[RESOURCE_ENERGY] : 0;
        const totalEnergy = storage + terminal;
        let displayEnergy = totalEnergy >= 1000000 ? (totalEnergy / 1000000).toFixed(1) + 'm' :
            totalEnergy >= 1000 ? (totalEnergy / 1000).toFixed(0) + 'k' : totalEnergy;

        const bucket = Game.cpu.bucket;
        const cpuColor = bucket < 2000 ? '#ff5555' : bucket < 5000 ? '#ffaa00' : '#4fc3f7';
        const opsText = opCount > 0 ? ` | OPS ${opCount}` : '';

        room.visual.text(`⚡${displayEnergy}`, x + 0.15, y + 0.12, {
            color: '#FFD700', align: 'left', font: 'bold 0.48 Tahoma'
        });
        room.visual.text(`CPU ${Game.cpu.getUsed().toFixed(1)} | B ${bucket}${opsText}`, divider, y + 0.12, {
            color: cpuColor, align: 'left', font: '0.38 Tahoma'
        });

        let statusText = '✓ Secure';
        let statusColor = '#66BB6A';

        if (room.controller.safeMode) {
            statusText = `🛡️ Safe ${this.timeFormat(room.controller.safeMode * Memory.tickInfo.tickLength)}`;
            statusColor = '#4CAF50';
        } else if (INTEL[room.name] && INTEL[room.name].threatLevel) {
            const threat = INTEL[room.name].threatLevel;
            statusText = `⚔️ Threat L${threat}`;
            statusColor = threat >= 4 ? '#ff2222' : threat >= 3 ? '#ff8800' : '#ffaa00';
        } else if (room.hostileCreeps.length) {
            statusText = `⚠️ ${room.hostileCreeps.length} Hostile`;
            statusColor = '#ffaa00';
        }

        const towers = room.towers.filter(t => t.isActive() && t.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST).length;
        const towerText = towers > 0 ? ` ${towers}T` : '';

        room.visual.text(`${statusText}${towerText}`, x + width - 0.15, y + 0.12, {
            color: statusColor, align: 'right', font: 'bold 0.42 Tahoma'
        });
    }

    renderEnergyAudit(room, x, y, width, hasAudit) {
        if (!hasAudit) {
            room.visual.text('Energy audit pending…', x + 0.15, y + 0.12, {
                color: '#888888', align: 'left', font: '0.36 Tahoma'
            });
            return;
        }

        const diag = room.memory.energyDiag;
        const info = room.memory.energyInfo;
        const divider = x + 2.6;

        room.visual.line(x - 0.1, y - 0.45, x + width + 0.1, y - 0.45, {color: '#333333', opacity: 0.7, width: 0.03});

        room.visual.text('IN', x + 0.15, y + 0.12, {color: '#4fc3f7', align: 'left', font: 'bold 0.38 Tahoma'});
        room.visual.text(`+${info.income}/t`, divider, y + 0.12, {
            color: '#4fc3f7',
            align: 'right',
            font: 'bold 0.38 Tahoma'
        });
        room.visual.text(`stat:${diag.statHarv} rem:${diag.remoteHarv}`, x + width - 0.15, y + 0.12, {
            color: '#7a9ab0', align: 'right', font: '0.32 Tahoma'
        });
        y += 0.95;

        room.visual.text('OUT', x + 0.15, y + 0.12, {color: '#ef9a9a', align: 'left', font: 'bold 0.38 Tahoma'});
        room.visual.text(`-${info.expense}/t`, divider, y + 0.12, {
            color: '#ef9a9a',
            align: 'right',
            font: 'bold 0.38 Tahoma'
        });
        room.visual.text(`upg:${diag.upgradeExpense} drn:${diag.maintenanceExpense || diag.droneExpense || 0} spn:${diag.spawnExpense}`, x + width - 0.15, y + 0.12, {
            color: '#8a7070', align: 'right', font: '0.32 Tahoma'
        });
        y += 0.95;

        const measured = room.energyIncome || 0;
        const netSign = measured >= 0 ? '+' : '';
        const netColor = measured >= 0 ? '#a5d6a7' : '#ef5350';
        const stateLabels = ['CRIT', 'LOW', 'OK', 'SURPLUS'];
        const stateColors = ['#ef5350', '#FFB347', '#66BB6A', '#4fc3f7'];
        const state = Math.min(3, Math.max(0, room.energyState || 0));

        room.visual.text('NET', x + 0.15, y + 0.12, {color: netColor, align: 'left', font: 'bold 0.38 Tahoma'});
        room.visual.text(`${netSign}${measured}/t`, divider, y + 0.12, {
            color: netColor,
            align: 'right',
            font: 'bold 0.38 Tahoma'
        });
        const trend = info.trend != null ? ` tr:${Math.floor(info.trend)}` : '';
        room.visual.text(`[${state}] ${stateLabels[state] || 'OK'}${trend}`, x + width - 0.15, y + 0.12, {
            color: stateColors[state] || '#66BB6A', align: 'right', font: 'bold 0.36 Tahoma'
        });
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
        room.visual.rect(x, y - 0.38, width, 0.76, {fill: '#1a1a1a', opacity: 0.85});
        const fillWidth = Math.max(0, Math.min(width, width * (pct / 100)));
        if (fillWidth > 0) {
            room.visual.rect(x, y - 0.38, fillWidth, 0.76, {fill: color, opacity: 0.65});
        }
        room.visual.text(textLeft, x + 0.15, y + 0.12, {color: '#ffffff', align: 'left', font: 'bold 0.42 Tahoma'});
        room.visual.text(`${pct.toFixed(1)}% | ${textRight}`, x + width - 0.15, y + 0.12, {
            color: '#cccccc', align: 'right', font: '0.38 Tahoma'
        });
    }

    buildStaticIntelRoomList(myRooms) {
        const list = [];
        if (!global.INTEL) return list;
        const owned = new Set(myRooms);
        for (const roomName in global.INTEL) {
            if (!VALID_ROOM_NAME.test(roomName)) continue;
            const intel = global.INTEL[roomName];
            if (!intel || owned.has(roomName)) continue;
            if ((intel.owner && intel.level) ||
                (intel.reservation && !intel.owner) ||
                intel.invaderCore ||
                intel.power ||
                intel.commodity ||
                intel.portal) {
                list.push(roomName);
            }
        }
        return list;
    }

    buildSubtleIntelRoomList(myRooms, staticSet) {
        const list = [];
        if (!global.INTEL) return list;
        const owned = new Set(myRooms);
        const statSet = staticSet || new Set();
        const now = Game.time;
        const maxAgeTicks = 18000; // only show reasonably recent scouted rooms (non-disruptive)
        for (const roomName in global.INTEL) {
            if (!VALID_ROOM_NAME.test(roomName)) continue;
            if (owned.has(roomName) || statSet.has(roomName)) continue;
            const intel = global.INTEL[roomName];
            if (!intel || !intel.lastObservation) continue;
            if (now - intel.lastObservation > maxAgeTicks) continue;
            // Only rooms with scouting / remote value
            if ((intel.sources || 0) > 0 || intel.sk || intel.mineral || intel.activeRemote || intel.loot) {
                list.push(roomName);
            }
        }
        return list;
    }

    renderStaticIntelRoom(roomName, enemies, friendlies, ourRemotes) {
        const intel = global.INTEL[roomName];
        if (!intel) return;

        if (intel.owner && intel.level) {
            const color = enemies.includes(intel.owner) ? '#ff3333' :
                friendlies.includes(intel.owner) ? '#33ff88' : '#e0ce5c';
            Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, {
                fill: color, opacity: 0.08, stroke: color, strokeWidth: 0.8
            });
            Game.map.visual.text(intel.owner, new RoomPosition(25, 19, roomName), {
                color: color, fontSize: 4.5, align: 'center', fontFamily: 'Tahoma',
                backgroundColor: '#111111', backgroundPadding: 0.3
            });
            Game.map.visual.text('RCL ' + intel.level, new RoomPosition(25, 26, roomName), {
                color: color, fontSize: 4.5, align: 'center', fontFamily: 'Tahoma',
                backgroundColor: '#111111', backgroundPadding: 0.25
            });
            if (intel.towers) {
                Game.map.visual.text('T' + intel.towers, new RoomPosition(42, 26, roomName), {
                    color: '#ffaa66', fontSize: 3.8, align: 'center', fontFamily: 'Tahoma'
                });
            }
        }

        if (intel.reservation && !intel.owner) {
            const isOurs = ourRemotes.has(roomName);
            const color = isOurs ? '#00B7EB' : (enemies.includes(intel.reservation) ? '#ff6666' : '#66ffaa');
            Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, {
                fill: color, opacity: 0.06, stroke: color, strokeWidth: 0.6, lineStyle: 'dashed'
            });
            Game.map.visual.text(isOurs ? 'RSV' : intel.reservation, new RoomPosition(25, 19, roomName), {
                color: color, fontSize: 4.5, align: 'center', fontFamily: 'Tahoma',
                backgroundColor: '#111111', backgroundPadding: 0.3
            });
        }

        if (intel.invaderCore) {
            Game.map.visual.circle(new RoomPosition(25, 25, roomName), {
                radius: 8, fill: '#800080', opacity: 0.18, stroke: '#aa44cc', strokeWidth: 0.6
            });
            Game.map.visual.text('CORE', new RoomPosition(25, 26, roomName), {
                color: '#cc88ff', fontSize: 4.5, align: 'center', fontFamily: 'Tahoma'
            });
        }

        // Resource icons (power shows approx remaining for UX)
        if (intel.power) {
            let pText = '⚡';
            const remaining = intel.power - Game.time;
            if (remaining > 0) {
                pText += remaining > 2000 ? Math.ceil(remaining / 1000) + 'k' : Math.ceil(remaining / 100);
            }
            Game.map.visual.text(pText, new RoomPosition(10, 9, roomName), {
                fontSize: 6.5, align: 'center', color: '#ffdd66'
            });
        }
        if (intel.commodity) {
            Game.map.visual.text('💎', new RoomPosition(40, 9, roomName), {
                fontSize: 7, align: 'center'
            });
        }
        if (intel.portal) {
            Game.map.visual.circle(new RoomPosition(25, 40, roomName), {
                radius: 2.5, fill: '#00ffff', opacity: 0.65
            });
        }

        // Sources + mineral at bottom sides (useful scouting / remote intel)
        if (Number.isFinite(intel.sources) && intel.sources > 0) {
            Game.map.visual.text(intel.sources + 'S', new RoomPosition(8, 37, roomName), {
                color: '#88aaff', fontSize: 3.8, align: 'center', fontFamily: 'Tahoma'
            });
        }
        if (intel.mineral) {
            Game.map.visual.text(intel.mineral, new RoomPosition(42, 37, roomName), {
                color: '#88ffaa', fontSize: 3.8, align: 'center', fontFamily: 'Tahoma'
            });
        }

        // Non-disruptive intel age in bottom-right corner (baked into static visual)
        this.renderIntelAgeBadge(roomName, intel, Game.time, false);
    }

    renderMapHUD() {
        if (!Game.map || !Game.map.visual) return;

        // On global reset, many visual caches are empty and other systems (highCommand, spawning,
        // pathing rebuilds, etc.) are already using lots of CPU. Skip the map HUD (which does
        // full static rebuild + lots of Game.map.visual calls + export) for the first tick or two.
        const since = global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99;
        if (since < 2) return;

        const currentTime = Game.time;
        const myRooms = this.getOwnedRooms();

        const refreshStatic = !_MapVisuals || currentTime % 50 === 0;
        if (refreshStatic) {
            for (const roomName of myRooms) {
                const room = Game.rooms[roomName];
                if (!room) continue;
                Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, {
                    fill: '#00B7EB', opacity: 0.10,
                    stroke: '#00B7EB', strokeWidth: 1.8
                });
                Game.map.visual.text('RCL ' + room.controller.level, new RoomPosition(25, 22, roomName), {
                    color: '#ffffff', fontSize: 7.5, align: 'center', fontFamily: 'Tahoma',
                    backgroundColor: '#003344', backgroundPadding: 0.4
                });
                if (room.mineral && room.mineral.mineralType) {
                    Game.map.visual.text(room.mineral.mineralType, new RoomPosition(5, 8, roomName), {
                        color: '#aaffff', fontSize: 5.5, align: 'center', fontFamily: 'Tahoma'
                    });
                }
            }

            this.renderRemoteLinks(myRooms);

            if (global.INTEL) {
                const enemies = global.ENEMIES || [];
                const friendlies = global.FRIENDLIES || [];
                const ourRemotes = new Set();
                if (global.ROOM_REMOTE_TARGETS) {
                    for (const targets of Object.values(ROOM_REMOTE_TARGETS)) {
                        for (const t of targets) ourRemotes.add(t.room);
                    }
                }

                staticIntelCache.rooms = this.buildStaticIntelRoomList(myRooms);
                staticIntelCache.tick = currentTime;
                const staticSet = new Set(staticIntelCache.rooms);
                subtleIntelCache.rooms = this.buildSubtleIntelRoomList(myRooms, staticSet);
                subtleIntelCache.tick = currentTime;
                for (const roomName of staticIntelCache.rooms) {
                    this.renderStaticIntelRoom(roomName, enemies, friendlies, ourRemotes);
                }

                // Subtle badges for recently scouted rooms (baked into the static export; age updates every 50t)
                for (const roomName of subtleIntelCache.rooms) {
                    const intel = global.INTEL[roomName];
                    if (intel) this.renderIntelAgeBadge(roomName, intel, currentTime, true);
                }
            }

            _MapVisuals = Game.map.visual.export();
        } else {
            Game.map.visual.import(_MapVisuals);
        }

        // Fresh time-sensitive overlays for cached static intel (power ETA always current, cheap text redraw)
        if (global.INTEL && staticIntelCache.rooms && staticIntelCache.rooms.length) {
            for (const roomName of staticIntelCache.rooms) {
                const intel = global.INTEL[roomName];
                if (!intel) continue;
                if (intel.power) {
                    let pText = '⚡';
                    const remaining = intel.power - currentTime;
                    if (remaining > 0) {
                        pText += remaining > 2000 ? Math.ceil(remaining / 1000) + 'k' : Math.ceil(remaining / 100);
                    }
                    Game.map.visual.text(pText, new RoomPosition(10, 9, roomName), {
                        fontSize: 6.5, align: 'center', color: '#ffdd66'
                    });
                }
                // Fresh accurate age for notable intel rooms
                this.renderIntelAgeBadge(roomName, intel, currentTime, false);
            }
        }

        if (currentTime - activeIntelCache.tick >= 10) {
            activeIntelCache.rooms = [];
            if (global.INTEL) {
                for (const roomName in global.INTEL) {
                    if (!VALID_ROOM_NAME.test(roomName)) continue;
                    const intel = global.INTEL[roomName];
                    if (intel && !myRooms.includes(roomName) &&
                        (intel.threatLevel > 0 || intel.loot || intel.invaderCore || intel.armedHostile)) {
                        activeIntelCache.rooms.push(roomName);
                    }
                }
            }
            activeIntelCache.tick = currentTime;
        }

        for (const roomName of myRooms) {
            const room = Game.rooms[roomName];
            if (!room) continue;

            if (room.controller.progressTotal) {
                const pct = room.controller.progress / room.controller.progressTotal;
                Game.map.visual.rect(new RoomPosition(1, 41, roomName), 48, 3.5, {fill: '#111111', opacity: 0.65});
                Game.map.visual.rect(new RoomPosition(1, 41, roomName), 48 * pct, 3.5, {
                    fill: '#9B59B6',
                    opacity: 0.85
                });
            }

            const energy = (room.storage ? room.storage.store[RESOURCE_ENERGY] : 0) +
                (room.terminal ? room.terminal.store[RESOURCE_ENERGY] : 0);
            if (room.storage || room.terminal) {
                const pct = Math.min(1, energy / 500000);
                Game.map.visual.rect(new RoomPosition(1, 45, roomName), 48, 3.5, {fill: '#111111', opacity: 0.65});
                Game.map.visual.rect(new RoomPosition(1, 45, roomName), 48 * pct, 3.5, {
                    fill: '#FFD700',
                    opacity: 0.85
                });
            }

            if (room.controller.safeMode) {
                Game.map.visual.text('🛡️', new RoomPosition(40, 9, roomName), {fontSize: 9, align: 'center'});
            }

            // Nuke inbound indicator (very useful situational awareness on map)
            if (room.nukes && room.nukes.length > 0) {
                Game.map.visual.text('☢' + (room.nukes.length > 1 ? room.nukes.length : ''), new RoomPosition(44, 4, roomName), {
                    color: '#ff4444', fontSize: 7.5, align: 'center', fontFamily: 'Tahoma'
                });
            }
        }

        const threatColors = ['', '#ffcc00', '#ff9900', '#ff5500', '#ff2200', '#ff0044'];
        for (const roomName of activeIntelCache.rooms) {
            const intel = global.INTEL[roomName];
            if (!intel) continue;

            if (intel.threatLevel > 0) {
                const isStronghold = !!intel.invaderCore;
                const baseColor = threatColors[intel.threatLevel] || '#ff0044';
                const color = isStronghold ? '#cc44ff' : baseColor;
                const isActive = intel.armedHostile && currentTime - intel.armedHostile < 200;

                Game.map.visual.circle(new RoomPosition(25, 25, roomName), {
                    radius: 11 + intel.threatLevel * 1.2,
                    fill: color,
                    opacity: isActive ? 0.22 : 0.10,
                    stroke: color, strokeWidth: isActive ? 1.6 : 0.6
                });

                const threatLabels = ['', 'UNARMED', 'INVADER', 'PLAYER', 'MULTI', 'BOOSTED'];
                const label = isStronghold && intel.threatLevel <= 2 ? 'STRONGHOLD' : (threatLabels[intel.threatLevel] || 'THREAT');
                Game.map.visual.text(label, new RoomPosition(25, 18, roomName), {
                    color: color, fontSize: 4.8, align: 'center', fontFamily: 'Tahoma',
                    backgroundColor: '#000000', backgroundPadding: 0.35
                });

                if (intel.threatLevel >= 3 && intel.hostileOwners && intel.hostileOwners.length) {
                    const display = intel.hostileOwners.length > 1
                        ? intel.hostileOwners[0] + ' +' + (intel.hostileOwners.length - 1)
                        : intel.hostileOwners[0];
                    Game.map.visual.text(display, new RoomPosition(25, 25, roomName), {
                        color: '#ffffff', fontSize: 4.5, align: 'center', fontFamily: 'Tahoma',
                        backgroundColor: '#220000', backgroundPadding: 0.3
                    });
                }
                if (isActive) Game.map.visual.text('ACTIVE', new RoomPosition(25, 32, roomName), {
                    color: '#ffffff', fontSize: 3.8, align: 'center', fontFamily: 'Tahoma',
                    backgroundColor: '#330000', backgroundPadding: 0.25
                });

                if (intel.roomHeat) {
                    const heatPct = Math.min(1, intel.roomHeat / 1000);
                    Game.map.visual.rect(new RoomPosition(1, 1, roomName), 48, 1.8, {fill: '#111111', opacity: 0.5});
                    Game.map.visual.rect(new RoomPosition(1, 1, roomName), 48 * heatPct, 1.8, {
                        fill: color,
                        opacity: 0.75
                    });
                }
            }

            if (intel.loot) {
                Game.map.visual.circle(new RoomPosition(8, 40, roomName), {
                    radius: 2.2, fill: '#FFD700', opacity: 0.75
                });
            }
        }

        if (Memory.claimTarget && Memory.claimTarget.room) {
            const roomName = Memory.claimTarget.room;
            Game.map.visual.circle(new RoomPosition(25, 25, roomName), {
                radius: 16, stroke: '#00ff00', strokeWidth: 1.8, fill: '#00ff00', opacity: 0.12, lineStyle: 'dashed'
            });
            Game.map.visual.text('🚀 EXPANSION', new RoomPosition(25, 11, roomName), {
                color: '#aaffaa', fontSize: 5.5, align: 'center', fontFamily: 'Tahoma',
                backgroundColor: '#003300', backgroundPadding: 0.4
            });
        }

        this.renderCreepTrails();

        if (Memory.targetRooms) {
            for (const roomName in Memory.targetRooms) {
                const target = Memory.targetRooms[roomName];
                if (!target || !VALID_ROOM_NAME.test(roomName)) continue;
                Game.map.visual.line(new RoomPosition(15, 25, roomName), new RoomPosition(35, 25, roomName), {
                    color: '#ff2222', width: 1.8, opacity: 0.85
                });
                Game.map.visual.line(new RoomPosition(25, 15, roomName), new RoomPosition(25, 35, roomName), {
                    color: '#ff2222', width: 1.8, opacity: 0.85
                });
                Game.map.visual.circle(new RoomPosition(25, 25, roomName), {
                    radius: 11, stroke: '#ff2222', strokeWidth: 1.8, fill: 'transparent', opacity: 0.75
                });
                let tgtLabel = target.type ? target.type.toUpperCase() : 'OP';
                let tgtColor = '#ffcccc';
                let tgtBg = '#440000';
                if (target.dDay) {
                    const eta = target.dDay - currentTime;
                    tgtLabel = '☢' + (eta > 0 ? Math.ceil(eta / 1000) + 'k' : 'NUKE');
                    tgtColor = '#ffaaaa';
                    tgtBg = '#660000';
                }
                Game.map.visual.text('🎯 ' + tgtLabel,
                    new RoomPosition(25, 39, roomName), {
                        color: tgtColor, fontSize: 5.2, align: 'center', fontFamily: 'Tahoma',
                        backgroundColor: tgtBg, backgroundPadding: 0.4
                    });
            }
        }

        if (Memory.auxiliaryTargets) {
            for (const roomName in Memory.auxiliaryTargets) {
                const target = Memory.auxiliaryTargets[roomName];
                if (!target || !VALID_ROOM_NAME.test(roomName)) continue;
                Game.map.visual.circle(new RoomPosition(25, 25, roomName), {
                    radius: 13,
                    stroke: '#ffff00',
                    strokeWidth: 1.3,
                    lineStyle: 'dashed',
                    fill: 'transparent',
                    opacity: 0.7
                });
                Game.map.visual.text('🔍 ' + (target.type ? target.type.toUpperCase() : 'AUX'),
                    new RoomPosition(25, 44, roomName), {
                        color: '#ffffaa', fontSize: 5.2, align: 'center', fontFamily: 'Tahoma',
                        backgroundColor: '#444400', backgroundPadding: 0.4
                    });
            }
        }
    }

    renderRemoteLinks(myRooms) {
        if (!global.ROOM_REMOTE_TARGETS) return;
        for (const colonyName of myRooms) {
            const targets = ROOM_REMOTE_TARGETS[colonyName];
            if (!targets) continue;
            for (const target of targets) {
                const intel = (global.INTEL && global.INTEL[target.room]) || {};
                const isActive = intel.activeRemote && Game.time - intel.activeRemote < 500;
                const isSK = !!intel.sk;
                const color = isSK ? '#ff9900' : isActive ? '#00ff88' : '#336633';
                const opacity = isActive ? 0.28 : 0.16;
                const lineStyle = isActive ? 'solid' : 'dashed';

                Game.map.visual.line(
                    new RoomPosition(25, 25, colonyName),
                    new RoomPosition(25, 25, target.room),
                    {color: color, opacity: opacity, lineStyle: lineStyle, width: 0.65}
                );

                if (isActive) {
                    Game.map.visual.circle(new RoomPosition(25, 25, target.room), {
                        radius: 1.8, fill: color, opacity: 0.3
                    });
                }
            }
        }
    }

    renderCreepTrails() {
        if (Game.time % 5 === 0) {
            creepTrailCache = [];

            const routesByDest = {};
            if (global.CACHE && CACHE.ROUTE_CACHE) {
                for (const key in CACHE.ROUTE_CACHE) {
                    const entry = CACHE.ROUTE_CACHE[key];
                    if (!entry || entry.failed || !entry.route || entry.route.length < 2) continue;
                    const dest = entry.route[entry.route.length - 1];
                    (routesByDest[dest] = routesByDest[dest] || []).push(entry.route);
                }
            }

            for (const name in Game.creeps) {
                const creep = Game.creeps[name];
                if (!creep.my || !creep.memory.destination || !creep.memory.operation) continue;

                const dest = creep.memory.destination;
                const room = creep.pos.roomName;
                let route;

                const shibMove = creep.memory._shibMove;
                if (shibMove && Array.isArray(shibMove.route) && shibMove.route.includes(room) &&
                    shibMove.route[shibMove.route.length - 1] === dest) {
                    route = shibMove.route;
                } else if (routesByDest[dest]) {
                    const candidates = routesByDest[dest].filter(r => r.includes(room));
                    route = candidates.length
                        ? candidates.reduce((a, b) => a.length <= b.length ? a : b)
                        : routesByDest[dest][0];
                }

                creepTrailCache.push({
                    x: creep.pos.x, y: creep.pos.y,
                    room: room,
                    dest: dest,
                    route: route
                });
            }
        }

        const lineStyle = {color: '#ffff44', opacity: 0.28, width: 0.3};
        for (const t of creepTrailCache) {
            Game.map.visual.circle(new RoomPosition(t.x, t.y, t.room), {
                radius: 0.95, fill: '#ffff44', opacity: 0.75
            });
            if (t.room === t.dest) continue;

            const startIdx = t.route ? t.route.indexOf(t.room) : -1;
            if (startIdx >= 0 && startIdx < t.route.length - 1) {
                let prev = new RoomPosition(t.x, t.y, t.room);
                for (let i = startIdx + 1; i < t.route.length; i++) {
                    const next = new RoomPosition(25, 25, t.route[i]);
                    Game.map.visual.line(prev, next, lineStyle);
                    prev = next;
                }
            } else {
                Game.map.visual.line(
                    new RoomPosition(t.x, t.y, t.room),
                    new RoomPosition(25, 25, t.dest),
                    lineStyle
                );
            }
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
        } else {
            return {text: Math.floor(secs / 86400) + 'd', color: '#888888'};
        }
    }

    renderIntelAgeBadge(roomName, intel, now, subtle = false) {
        if (!intel) return;
        const age = this.getIntelAge(intel, now);
        if (subtle) {
            Game.map.visual.circle(new RoomPosition(44.5, 44.5, roomName), {
                radius: 0.85, fill: age.color, opacity: 0.22
            });
        }
        Game.map.visual.text(age.text, new RoomPosition(43, 43, roomName), {
            color: age.color,
            fontSize: subtle ? 2.8 : 3.3,
            align: 'center',
            fontFamily: 'Tahoma',
            backgroundColor: subtle ? '#0a0a0a' : '#000000',
            backgroundPadding: subtle ? 0.12 : 0.2,
            opacity: subtle ? 0.65 : 0.9
        });
    }

    timeFormat(seconds) {
        if (seconds === Infinity || seconds < 0 || isNaN(seconds)) return 'Calculating...';
        const [h, m, s] = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), Math.floor(seconds % 60)];
        return `${h}h ${m}m ${s}s`.replace(/\b0\w+\s*/g, '');
    }
}

profiler.registerClass(HUD, 'HUD');
module.exports = HUD;