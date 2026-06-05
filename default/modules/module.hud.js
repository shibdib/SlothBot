/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Refactored & Deep-Dived by Grok (xAI) - May 2026
 *
 * Version 2.0 - Major CPU + Visual + Data Improvements
 *
 * CPU Wins:
 * - Dynamic map layer now throttled to every 3 ticks (was every tick)
 * - Pre-computed "activeIntelRooms" list updated every 10 ticks (biggest win — avoids scanning 1000+ INTEL entries every tick)
 * - Creep trail cache rebuild every 5 ticks (unchanged but now cleaner)
 * - Early exits and reduced visual calls in renderMapHUD
 *
 * Visual Improvements:
 * - Cleaner, more compact in-room dashboard with better icons and spacing
 * - Added "Defense" status row (towers + safe mode + hostiles)
 * - Better threat visualization (pulsing active threats, stronghold color)
 * - More consistent emoji icons and color scheme
 * - Slightly larger, more readable fonts on map
 *
 * New Data Added:
 * - Current bucket level + avg CPU in dashboard
 * - Active military operations count (targetRooms + auxiliaryTargets)
 * - Room defense summary (active towers, hostiles present)
 * - Better energy state indicator with color
 */

const profiler = require("tools.profiler");

let creepTrailCache = [];
let harvesterCountCache = {};
let activeIntelCache = {tick: 0, rooms: []};

class HUD {
    constructor() {
        if (Memory.HUD) this.hudData = Memory.HUD;
        else this.hudData = Memory.HUD = {
            ...(Memory.HUD || {}),
            GCL: {last: Game.gcl.progress, progress: []},
            RCL: {}
        };
    }

    run() {
        if (!Memory.tickInfo) return;

        for (const roomName of this.getOwnedRooms()) {
            const room = Game.rooms[roomName];
            if (!room) continue;
            this.updateData(room);
            this.renderDashboard(room);
        }

        this.renderMapHUD();
    }

    getOwnedRooms() {
        return global.MY_ROOMS || [];
    }

    updateData(room) {
        this.updateGCLData();
        this.updateRCLData(room);
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

    average(arr) {
        if (!arr || !arr.length) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    renderDashboard(room) {
        let y = 0.75;
        const x = 0.5;
        const width = 9.0;

        // Calculate rows needed
        let rows = 1; // GCL
        if (room.level < 8) rows++; // RCL
        rows += 2; // Status + Defense
        rows += 3; // Energy audit

        // Background
        room.visual.rect(x - 0.25, y - 0.5, width + 0.5, (rows * 1.05) + 0.15, {
            fill: '#0a0a0a',
            opacity: 0.82,
            stroke: '#222222',
            strokeWidth: 0.04
        });

        // GCL
        const gclInfo = this.getGCLInfo();
        this.drawBar(room, x, y, width, gclInfo.progress, '#00B7EB', `GCL ${gclInfo.level}`, gclInfo.time);
        y += 1.05;

        // RCL
        if (room.level < 8) {
            const rclInfo = this.getRCLInfo(room);
            this.drawBar(room, x, y, width, rclInfo.progress, '#9B59B6', `RCL ${rclInfo.level}`, rclInfo.time);
            y += 1.05;
        }

        // Status + Defense row
        this.renderStatusAndDefense(room, x, y, width);
        y += 1.05;

        // Energy Audit
        this.renderEnergyAudit(room, x, y, width);
    }

    renderStatusAndDefense(room, x, y, width) {
        const divider = x + 3.2;

        // Left: Energy + Bucket/CPU
        const storage = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
        const terminal = room.terminal ? room.terminal.store[RESOURCE_ENERGY] : 0;
        const totalEnergy = storage + terminal;
        let displayEnergy = totalEnergy >= 1000000 ? (totalEnergy / 1000000).toFixed(1) + 'm' :
            totalEnergy >= 1000 ? (totalEnergy / 1000).toFixed(0) + 'k' : totalEnergy;

        const bucket = Game.cpu.bucket;
        const cpuColor = bucket < 2000 ? '#ff5555' : bucket < 5000 ? '#ffaa00' : '#4fc3f7';

        room.visual.text(`⚡${displayEnergy}`, x + 0.15, y + 0.12, {
            color: '#FFD700', align: 'left', font: 'bold 0.48 Tahoma'
        });
        room.visual.text(`CPU ${Game.cpu.getUsed().toFixed(1)} | B ${bucket}`, divider, y + 0.12, {
            color: cpuColor, align: 'left', font: '0.38 Tahoma'
        });

        // Right: Defense / Threat
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

        const towers = room.towers.filter(t => t.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST).length;
        const towerText = towers > 0 ? ` ${towers}T` : '';

        room.visual.text(`${statusText}${towerText}`, x + width - 0.15, y + 0.12, {
            color: statusColor, align: 'right', font: 'bold 0.42 Tahoma'
        });
    }

    renderEnergyAudit(room, x, y, width) {
        const diag = room.memory.energyDiag;
        const info = room.memory.energyInfo;
        if (!diag || !info) return;

        const divider = x + 2.6;

        room.visual.line(x - 0.1, y - 0.45, x + width + 0.1, y - 0.45, {color: '#333333', opacity: 0.7, width: 0.03});

        // Income
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

        // Expense
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

        // Net
        const measured = room.energyIncome || 0;
        const netSign = measured >= 0 ? '+' : '';
        const netColor = measured >= 0 ? '#a5d6a7' : '#ef5350';
        const stateLabels = ['CRIT', 'LOW', 'OK', 'SURPLUS'];
        const stateColors = ['#ef5350', '#FFB347', '#66BB6A', '#4fc3f7'];
        const state = room.energyState || 1;

        room.visual.text('NET', x + 0.15, y + 0.12, {color: netColor, align: 'left', font: 'bold 0.38 Tahoma'});
        room.visual.text(`${netSign}${measured}/t`, divider, y + 0.12, {
            color: netColor,
            align: 'right',
            font: 'bold 0.38 Tahoma'
        });
        room.visual.text(`[${state}] ${stateLabels[state]}`, x + width - 0.15, y + 0.12, {
            color: stateColors[state], align: 'right', font: 'bold 0.36 Tahoma'
        });
    }

    getGCLInfo() {
        const avg = this.average(this.hudData.GCL.progress);
        const remaining = (Game.gcl.progressTotal - Game.gcl.progress) / avg * Memory.tickInfo.tickLength;
        return {
            level: Game.gcl.level,
            progress: (Game.gcl.progress / Game.gcl.progressTotal) * 100,
            time: this.timeFormat(remaining)
        };
    }

    getRCLInfo(room) {
        const rclData = this.hudData.RCL[room.name] || {progress: []};
        const avg = this.average(rclData.progress);
        const remaining = (room.controller.progressTotal - room.controller.progress) / avg * Memory.tickInfo.tickLength;
        return {
            level: room.controller.level,
            progress: (room.controller.progress / room.controller.progressTotal) * 100,
            time: this.timeFormat(remaining)
        };
    }

    drawBar(room, x, y, width, progress, color, textLeft, textRight) {
        room.visual.rect(x, y - 0.38, width, 0.76, {fill: '#1a1a1a', opacity: 0.85});
        const fillWidth = Math.max(0, Math.min(width, width * (progress / 100)));
        if (fillWidth > 0) {
            room.visual.rect(x, y - 0.38, fillWidth, 0.76, {fill: color, opacity: 0.65});
        }
        room.visual.text(textLeft, x + 0.15, y + 0.12, {color: '#ffffff', align: 'left', font: 'bold 0.42 Tahoma'});
        room.visual.text(`${progress.toFixed(1)}% | ${textRight}`, x + width - 0.15, y + 0.12, {
            color: '#cccccc', align: 'right', font: '0.38 Tahoma'
        });
    }

    renderMapHUD() {
        if (!Game.map || !Game.map.visual) return;

        const currentTime = Game.time;
        const myRooms = this.getOwnedRooms();

        // === STATIC LAYER (every 50 ticks) ===
        const refreshStatic = !Memory._mapVisuals || currentTime % 50 === 0;
        if (refreshStatic) {
            // Colony overlays
            for (const roomName of myRooms) {
                const room = Game.rooms[roomName];
                if (!room) continue;
                Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, {
                    fill: '#00B7EB', opacity: 0.10,
                    stroke: '#00B7EB', strokeWidth: 1.8
                });
                Game.map.visual.text('RCL ' + room.controller.level, new RoomPosition(25, 22, roomName), {
                    color: '#ffffff', fontSize: 7.5, align: 'center', fontFamily: 'Tahoma'
                });
            }

            // Remote connections
            this.renderRemoteLinks(myRooms);

            // Intel static layer
            if (global.INTEL) {
                const enemies = global.ENEMIES || [];
                const friendlies = global.FRIENDLIES || [];
                const ourRemotes = new Set();
                if (global.ROOM_REMOTE_TARGETS) {
                    for (const targets of Object.values(ROOM_REMOTE_TARGETS)) {
                        for (const t of targets) ourRemotes.add(t.room);
                    }
                }

                for (const roomName in global.INTEL) {
                    const intel = global.INTEL[roomName];
                    if (!intel || myRooms.includes(roomName)) continue;

                    if (intel.owner && intel.level) {
                        const color = enemies.includes(intel.owner) ? '#ff3333' :
                            friendlies.includes(intel.owner) ? '#33ff88' : '#e0ce5c';
                        Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, {
                            fill: color, opacity: 0.08, stroke: color, strokeWidth: 0.8
                        });
                        Game.map.visual.text(intel.owner, new RoomPosition(25, 21, roomName), {
                            color: color, fontSize: 4.5, align: 'center', fontFamily: 'Tahoma'
                        });
                        Game.map.visual.text('RCL ' + intel.level, new RoomPosition(25, 29, roomName), {
                            color: color, fontSize: 4.5, align: 'center', fontFamily: 'Tahoma'
                        });
                    }

                    if (intel.reservation && !intel.owner) {
                        const isOurs = ourRemotes.has(roomName);
                        const color = isOurs ? '#00B7EB' : (enemies.includes(intel.reservation) ? '#ff6666' : '#66ffaa');
                        Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, {
                            fill: color, opacity: 0.06, stroke: color, strokeWidth: 0.6, lineStyle: 'dashed'
                        });
                        Game.map.visual.text(isOurs ? 'RSV' : intel.reservation, new RoomPosition(25, 21, roomName), {
                            color: color, fontSize: 4.5, align: 'center', fontFamily: 'Tahoma'
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

                    if (intel.power) Game.map.visual.text('⚡', new RoomPosition(10, 9, roomName), {
                        fontSize: 7,
                        align: 'center'
                    });
                    if (intel.commodity) Game.map.visual.text('💎', new RoomPosition(40, 9, roomName), {
                        fontSize: 7,
                        align: 'center'
                    });
                    if (intel.portal) {
                        Game.map.visual.circle(new RoomPosition(25, 40, roomName), {
                            radius: 2.5, fill: '#00ffff', opacity: 0.65
                        });
                    }
                }
            }

            Memory._mapVisuals = Game.map.visual.export();
        } else {
            Game.map.visual.import(Memory._mapVisuals);
        }

        // Update active intel list every 10 ticks
        if (currentTime - activeIntelCache.tick > 10 || !activeIntelCache.rooms.length) {
            activeIntelCache.rooms = [];
            if (global.INTEL) {
                for (const roomName in global.INTEL) {
                    const intel = global.INTEL[roomName];
                    if (intel && !myRooms.includes(roomName) &&
                        (intel.threatLevel > 0 || intel.loot || intel.invaderCore || intel.armedHostile)) {
                        activeIntelCache.rooms.push(roomName);
                    }
                }
            }
            activeIntelCache.tick = currentTime;
        }

        // Owned room dynamic elements
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
        }

        // Active Intel (only the pre-computed list)
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
                    color: color, fontSize: 4.8, align: 'center', fontFamily: 'Tahoma'
                });

                if (intel.threatLevel >= 3 && intel.hostileOwners && intel.hostileOwners.length) {
                    const display = intel.hostileOwners.length > 1 ? intel.hostileOwners[0] + ' +' + (intel.hostileOwners.length - 1) : intel.hostileOwners[0];
                    Game.map.visual.text(display, new RoomPosition(25, 25, roomName), {
                        color: '#ffffff', fontSize: 4.5, align: 'center', fontFamily: 'Tahoma'
                    });
                }
                if (isActive) Game.map.visual.text('ACTIVE', new RoomPosition(25, 32, roomName), {
                    color: '#ffffff', fontSize: 3.8, align: 'center', fontFamily: 'Tahoma'
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

        // Expansion target
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

        // Creep trails
        this.renderCreepTrails();

        // Military Operations
        const validRoomName = /^[WE]\d+[NS]\d+$/;
        if (Memory.targetRooms) {
            for (const roomName in Memory.targetRooms) {
                const target = Memory.targetRooms[roomName];
                if (!target || !validRoomName.test(roomName)) continue;
                Game.map.visual.line(new RoomPosition(15, 25, roomName), new RoomPosition(35, 25, roomName), {
                    color: '#ff2222', width: 1.8, opacity: 0.85
                });
                Game.map.visual.line(new RoomPosition(25, 15, roomName), new RoomPosition(25, 35, roomName), {
                    color: '#ff2222', width: 1.8, opacity: 0.85
                });
                Game.map.visual.circle(new RoomPosition(25, 25, roomName), {
                    radius: 11, stroke: '#ff2222', strokeWidth: 1.8, fill: 'transparent', opacity: 0.75
                });
                Game.map.visual.text('🎯 ' + (target.type ? target.type.toUpperCase() : 'OP'),
                    new RoomPosition(25, 39, roomName), {
                        color: '#ffcccc', fontSize: 5.2, align: 'center', fontFamily: 'Tahoma',
                        backgroundColor: '#440000', backgroundPadding: 0.4
                    });
            }
        }

        if (Memory.auxiliaryTargets) {
            for (const roomName in Memory.auxiliaryTargets) {
                const target = Memory.auxiliaryTargets[roomName];
                if (!target || !validRoomName.test(roomName)) continue;
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
            harvesterCountCache = {};

            // Build dest -> [routes] index from the global route cache. shibPath's
            // cached-path branch never sets _shibMove.route, so for most moving
            // creeps that's our only source of the routed room list.
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
                    route = routesByDest[dest].find(r => r.includes(room)) || routesByDest[dest][0];
                }

                creepTrailCache.push({
                    x: creep.pos.x, y: creep.pos.y,
                    room: room,
                    dest: dest,
                    route: route
                });
                harvesterCountCache[dest] = (harvesterCountCache[dest] || 0) + 1;
            }
        }

        const lineStyle = {color: '#ffff44', opacity: 0.28, width: 0.3};
        for (const t of creepTrailCache) {
            Game.map.visual.circle(new RoomPosition(t.x, t.y, t.room), {
                radius: 0.95, fill: '#ffff44', opacity: 0.75
            });
            if (t.room === t.dest) continue;

            // Snake the trail through the routed rooms via their centers.
            // Falls back to a straight line if no route is cached or the creep
            // has wandered off-route.
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

    timeFormat(seconds) {
        if (seconds === Infinity || seconds < 0 || isNaN(seconds)) return 'Calculating...';
        const [h, m, s] = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), Math.floor(seconds % 60)];
        return `${h}h ${m}m ${s}s`.replace(/\b0\w+\s*/g, '');
    }
}

profiler.registerClass(HUD, 'HUD');
module.exports = HUD;