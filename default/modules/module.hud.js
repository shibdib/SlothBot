/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

let creepTrailCache = [];
let harvesterCountCache = {};

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
        if (!arr) return 0;
        return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    }

    renderDashboard(room) {
        let y = 0.75;
        const x = 0.5;
        const width = 8.5;

        let rows = 1; // GCL
        if (room.level < 8) rows++; // RCL
        rows++; // Energy/Status

        // Draw semi-transparent background for readability
        room.visual.rect(x - 0.25, y - 0.5, width + 0.5, (rows * 1.1) + 0.2, {
            fill: '#111111',
            opacity: 0.75,
            stroke: '#333333',
            strokeWidth: 0.05
        });

        const gclInfo = this.getGCLInfo();
        this.drawBar(room, x, y, width, gclInfo.progress, '#00B7EB', `GCL ${gclInfo.level}`, gclInfo.time);
        y += 1.1;

        if (room.level < 8) {
            const rclInfo = this.getRCLInfo(room);
            this.drawBar(room, x, y, width, rclInfo.progress, '#7D3C98', `RCL ${rclInfo.level}`, rclInfo.time);
            y += 1.1;
        }

        this.renderStatusRow(room, x, y, width);
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
            time: this.timeFormat(remaining),
            cpu: this.average(ROOM_CPU_ARRAY[room.name]).toFixed(2)
        };
    }

    drawBar(room, x, y, width, progress, color, textLeft, textRight) {
        // Background track
        room.visual.rect(x, y - 0.4, width, 0.8, {fill: '#222222', opacity: 0.8});
        // Progress fill
        const fillWidth = Math.max(0, Math.min(width, width * (progress / 100)));
        if (fillWidth > 0) {
            room.visual.rect(x, y - 0.4, fillWidth, 0.8, {fill: color, opacity: 0.6});
        }
        // Labels
        room.visual.text(textLeft, x + 0.2, y + 0.15, {color: '#ffffff', align: 'left', font: 'bold 0.45 Tahoma'});
        room.visual.text(`${progress.toFixed(2)}% | ${textRight}`, x + width - 0.2, y + 0.15, {
            color: '#dddddd',
            align: 'right',
            font: '0.45 Tahoma'
        });
    }

    renderStatusRow(room, x, y, width) {
        const storage = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
        const terminal = room.terminal ? room.terminal.store[RESOURCE_ENERGY] : 0;
        const totalEnergy = storage + terminal;

        // Format energy nicely (e.g., 150k, 1.2m)
        let displayEnergy = totalEnergy;
        if (totalEnergy >= 1000000) displayEnergy = (totalEnergy / 1000000).toFixed(2) + 'm';
        else if (totalEnergy >= 1000) displayEnergy = (totalEnergy / 1000).toFixed(1) + 'k';

        room.visual.text(`⚡ ${displayEnergy}`, x + 0.2, y + 0.15, {
            color: '#FFD700',
            align: 'left',
            font: 'bold 0.5 Tahoma'
        });

        let statusText = '';
        let statusColor = '#ffffff';
        if (room.controller.safeMode) {
            statusText = `🛡️ Safe ${this.timeFormat(room.controller.safeMode * Memory.tickInfo.tickLength)}`;
            statusColor = '#4CAF50'; // Greenish
        } else if (INTEL[room.name] && INTEL[room.name].threatLevel) {
            statusText = `⚔️ Threat Lvl ${INTEL[room.name].threatLevel}`;
            statusColor = '#FF4500'; // Orange/Red
        } else {
            statusText = `✓ Secure`;
            statusColor = '#888888'; // Grey
        }
        room.visual.text(statusText, x + width - 0.2, y + 0.15, {
            color: statusColor,
            align: 'right',
            font: '0.5 Tahoma'
        });
    }

    renderMapHUD() {
        if (!Game.map || !Game.map.visual) return;

        const myRooms = this.getOwnedRooms();

        // Colony → remote connections drawn first (behind room fills)
        this.renderRemoteLinks(myRooms);

        // Owned room overlays
        for (const roomName of myRooms) {
            const room = Game.rooms[roomName];
            if (!room) continue;

            Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, {
                fill: '#00B7EB', opacity: 0.12,
                stroke: '#00B7EB', strokeWidth: 2
            });

            // RCL progress bar
            if (room.controller.progressTotal) {
                const pct = room.controller.progress / room.controller.progressTotal;
                Game.map.visual.rect(new RoomPosition(1, 41, roomName), 48, 4, {fill: '#111', opacity: 0.7});
                Game.map.visual.rect(new RoomPosition(1, 41, roomName), 48 * pct, 4, {fill: '#9B59B6', opacity: 0.9});
            }

            // Energy bar
            const energy = (room.storage ? room.storage.store[RESOURCE_ENERGY] : 0) +
                (room.terminal ? room.terminal.store[RESOURCE_ENERGY] : 0);
            if (room.storage || room.terminal) {
                const pct = Math.min(1, energy / 500000);
                Game.map.visual.rect(new RoomPosition(1, 45, roomName), 48, 4, {fill: '#111', opacity: 0.7});
                Game.map.visual.rect(new RoomPosition(1, 45, roomName), 48 * pct, 4, {fill: '#FFD700', opacity: 0.9});
            }

            Game.map.visual.text('RCL ' + room.controller.level, new RoomPosition(25, 22, roomName), {
                color: '#ffffff', fontSize: 8, align: 'center', fontFamily: 'Tahoma'
            });

            if (room.controller.safeMode) {
                Game.map.visual.text('🛡️', new RoomPosition(40, 10, roomName), {fontSize: 10, align: 'center'});
            }
        }

        // Intel overlays
        if (global.INTEL) {
            const threatColors = ['', '#ffcc00', '#ff9900', '#ff5500', '#ff2200', '#ff0044'];
            const enemies = global.ENEMIES || [];
            const friendlies = global.FRIENDLIES || [];

            // Build set of our reserved remotes once to avoid repeated O(n) scans
            const ourRemotes = new Set();
            if (global.ROOM_REMOTE_TARGETS) {
                for (const targets of Object.values(ROOM_REMOTE_TARGETS)) {
                    for (const t of targets) ourRemotes.add(t.room);
                }
            }

            for (const roomName in global.INTEL) {
                const intel = global.INTEL[roomName];
                if (!intel || myRooms.includes(roomName)) continue;

                // Owned player rooms
                if (intel.owner && intel.level) {
                    const color = enemies.includes(intel.owner) ? '#ff3333' :
                        friendlies.includes(intel.owner) ? '#33ff88' : '#e0ce5c';
                    Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, {
                        fill: color, opacity: 0.1, stroke: color, strokeWidth: 1
                    });
                    Game.map.visual.text(intel.owner, new RoomPosition(25, 22, roomName), {
                        color: color, fontSize: 5, align: 'center', fontFamily: 'Tahoma'
                    });
                    Game.map.visual.text('RCL ' + intel.level, new RoomPosition(25, 30, roomName), {
                        color: color, fontSize: 5, align: 'center', fontFamily: 'Tahoma'
                    });
                }

                // Our own reservations
                if (intel.reservation && !intel.owner && ourRemotes.has(roomName)) {
                    Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, {
                        fill: '#00B7EB', opacity: 0.07, stroke: '#00B7EB', strokeWidth: 1, lineStyle: 'dashed'
                    });
                    Game.map.visual.text('RSV', new RoomPosition(25, 25, roomName), {
                        color: '#00B7EB', fontSize: 5, align: 'center', fontFamily: 'Tahoma'
                    });
                }

                // Other players' reservations
                if (intel.reservation && !intel.owner && !ourRemotes.has(roomName)) {
                    const color = enemies.includes(intel.reservation) ? '#ff6666' :
                        friendlies.includes(intel.reservation) ? '#66ffaa' : '#e1d889';
                    Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, {
                        fill: color, opacity: 0.07, stroke: color, strokeWidth: 1, lineStyle: 'dashed'
                    });
                    Game.map.visual.text(intel.reservation, new RoomPosition(25, 22, roomName), {
                        color: color, fontSize: 5, align: 'center', fontFamily: 'Tahoma'
                    });
                    Game.map.visual.text('RSV', new RoomPosition(25, 30, roomName), {
                        color: color, fontSize: 4, align: 'center', fontFamily: 'Tahoma'
                    });
                }

                // Invader core with no active threat — quiet structural indicator
                if (intel.invaderCore && !intel.threatLevel) {
                    Game.map.visual.circle(new RoomPosition(25, 25, roomName), {
                        radius: 9, fill: '#800080', opacity: 0.22, stroke: '#aa44cc', strokeWidth: 0.7
                    });
                    Game.map.visual.text('CORE', new RoomPosition(25, 27, roomName), {
                        color: '#cc88ff', fontSize: 5, align: 'center', fontFamily: 'Tahoma'
                    });
                }

                // Threat level (merges invader core context when both are present)
                if (intel.threatLevel > 0) {
                    const isStronghold = !!intel.invaderCore;
                    const baseColor = threatColors[intel.threatLevel] || '#ff0044';
                    const color = isStronghold ? '#cc44ff' : baseColor;
                    const isPlayer = intel.threatLevel >= 3;
                    const isActive = intel.armedHostile && Game.time - intel.armedHostile < 200;

                    // Outer glow
                    Game.map.visual.circle(new RoomPosition(25, 25, roomName), {
                        radius: 19 + intel.threatLevel,
                        fill: color, opacity: 0.05, strokeWidth: 0
                    });

                    // Inner core with border — brighter when actively hostile
                    Game.map.visual.circle(new RoomPosition(25, 25, roomName), {
                        radius: 12 + intel.threatLevel,
                        fill: color,
                        opacity: isActive ? 0.2 + intel.threatLevel * 0.04 : 0.10 + intel.threatLevel * 0.03,
                        stroke: color,
                        strokeWidth: isActive ? 1.5 : 0.7
                    });

                    // Extra inner ring for major threats
                    if (intel.threatLevel >= 4) {
                        Game.map.visual.circle(new RoomPosition(25, 25, roomName), {
                            radius: 6, fill: color, opacity: 0.22, strokeWidth: 0
                        });
                    }

                    // Label: stronghold overrides the default invader label
                    const threatLabels = ['', 'UNARMED', 'INVADER', 'PLAYER', 'MULTI', 'BOOSTED'];
                    const label = isStronghold && intel.threatLevel <= 2
                        ? 'STRONGHOLD'
                        : (threatLabels[intel.threatLevel] || 'THREAT');
                    Game.map.visual.text(label, new RoomPosition(25, 19, roomName), {
                        color: color, fontSize: 5, align: 'center', fontFamily: 'Tahoma'
                    });

                    // Player name(s) — most valuable info for player-level threats
                    if (isPlayer && intel.hostileOwners && intel.hostileOwners.length) {
                        const display = intel.hostileOwners.length > 1
                            ? intel.hostileOwners[0] + ' +' + (intel.hostileOwners.length - 1)
                            : intel.hostileOwners[0];
                        Game.map.visual.text(display, new RoomPosition(25, 26, roomName), {
                            color: '#ffffff', fontSize: 5, align: 'center', fontFamily: 'Tahoma'
                        });
                    }

                    // Active status indicator
                    if (isActive) {
                        Game.map.visual.text('ACTIVE', new RoomPosition(25, 33, roomName), {
                            color: '#ffffff', fontSize: 4, align: 'center', fontFamily: 'Tahoma'
                        });
                    }

                    // Room heat bar across top of tile
                    if (intel.roomHeat) {
                        const heatPct = Math.min(1, intel.roomHeat / 1000);
                        Game.map.visual.rect(new RoomPosition(1, 1, roomName), 48, 2, {fill: '#111', opacity: 0.5});
                        Game.map.visual.rect(new RoomPosition(1, 1, roomName), 48 * heatPct, 2, {
                            fill: color,
                            opacity: 0.8
                        });
                    }
                }

                if (intel.power) {
                    Game.map.visual.text('⚡', new RoomPosition(10, 10, roomName), {fontSize: 8, align: 'center'});
                }
                if (intel.commodity) {
                    Game.map.visual.text('💎', new RoomPosition(40, 10, roomName), {fontSize: 8, align: 'center'});
                }

                // Mineral type label (top-left)
                if (intel.mineral) {
                    Game.map.visual.text(intel.mineral, new RoomPosition(8, 8, roomName), {
                        color: '#aaffaa', fontSize: 5, align: 'center', fontFamily: 'Tahoma'
                    });
                }

                // Portal marker (bottom-center)
                if (intel.portal) {
                    Game.map.visual.circle(new RoomPosition(25, 40, roomName), {
                        radius: 3, fill: '#00ffff', opacity: 0.7, stroke: '#00ffff', strokeWidth: 0.5
                    });
                    Game.map.visual.text('P', new RoomPosition(25, 42, roomName), {
                        color: '#00ffff', fontSize: 4, align: 'center', fontFamily: 'Tahoma'
                    });
                }

                // Loot available (bottom-left dot)
                if (intel.loot) {
                    Game.map.visual.circle(new RoomPosition(8, 40, roomName), {
                        radius: 2.5, fill: '#FFD700', opacity: 0.8, strokeWidth: 0
                    });
                }

                // Staleness dimming — applied last so it sits on top of all other overlays
                const age = intel.lastObservation ? Game.time - intel.lastObservation : 99999;
                if (age > 3000) {
                    const dimOpacity = Math.min(0.55, (age - 3000) / 25000 * 0.55);
                    Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, {
                        fill: '#000000', opacity: dimOpacity, stroke: ''
                    });
                    if (age > 12000) {
                        Game.map.visual.text('?', new RoomPosition(44, 12, roomName), {
                            color: '#666666', fontSize: 7, align: 'center', fontFamily: 'Tahoma'
                        });
                    }
                }
            }
        }

        // Creep destination trails (throttled rebuild)
        this.renderCreepTrails();

        // Target rooms
        if (Memory.targetRooms) {
            for (const roomName in Memory.targetRooms) {
                const target = Memory.targetRooms[roomName];
                Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, {
                    fill: '#ff0000', opacity: 0.1, stroke: '#ff0000', strokeWidth: 1
                });
                Game.map.visual.text('🎯 ' + (target && target.type ? target.type.toUpperCase() : 'TARGET'),
                    new RoomPosition(25, 40, roomName), {
                        color: '#ff4444', fontSize: 6, align: 'center', fontFamily: 'Tahoma'
                    });
            }
        }

        // Auxiliary targets
        if (Memory.auxiliaryTargets) {
            for (const roomName in Memory.auxiliaryTargets) {
                const target = Memory.auxiliaryTargets[roomName];
                if (!target) continue;
                Game.map.visual.text('🔍 ' + (target.type ? target.type.toUpperCase() : 'AUX'),
                    new RoomPosition(25, 45, roomName), {
                        color: '#ffff00', fontSize: 6, align: 'center', fontFamily: 'Tahoma'
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
                const opacity = isActive ? 0.3 : 0.18;
                const lineStyle = isActive ? 'solid' : 'dashed';

                Game.map.visual.line(
                    new RoomPosition(25, 25, colonyName),
                    new RoomPosition(25, 25, target.room),
                    {color: color, opacity: opacity, lineStyle: lineStyle, width: 0.7}
                );

                // Active harvest dot + harvester count on the remote
                if (isActive) {
                    Game.map.visual.circle(new RoomPosition(25, 25, target.room), {
                        radius: 2, fill: color, opacity: 0.35, strokeWidth: 0
                    });
                }
            }
        }
    }

    renderCreepTrails() {
        // Rebuild cache every 5 ticks to spread CPU cost
        if (Game.time % 5 === 0) {
            creepTrailCache = [];
            harvesterCountCache = {};
            for (const name in Game.creeps) {
                const creep = Game.creeps[name];
                if (!creep.my || !creep.memory.destination || !creep.memory.operation) continue;
                creepTrailCache.push({
                    x: creep.pos.x, y: creep.pos.y,
                    room: creep.pos.roomName,
                    dest: creep.memory.destination
                });
                harvesterCountCache[creep.memory.destination] = (harvesterCountCache[creep.memory.destination] || 0) + 1;
            }
        }

        for (const t of creepTrailCache) {
            Game.map.visual.circle(new RoomPosition(t.x, t.y, t.room), {
                radius: 1.1, fill: '#ffff44', opacity: 0.8, strokeWidth: 0
            });
            if (t.room !== t.dest) {
                Game.map.visual.line(
                    new RoomPosition(t.x, t.y, t.room),
                    new RoomPosition(25, 25, t.dest),
                    {color: '#ffff44', opacity: 0.25, width: 0.25}
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