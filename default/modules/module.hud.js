/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

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
        // Only draw if we have map visual API available
        if (!Game.map || !Game.map.visual) return;

        // Overlay for Owned Rooms
        const myRooms = this.getOwnedRooms();
        for (const roomName of myRooms) {
            const room = Game.rooms[roomName];
            if (!room) continue;

            // Highlight owned rooms with a distinct blue outline and slight fill
            Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, {
                fill: '#00B7EB',
                opacity: 0.15,
                stroke: '#00B7EB',
                strokeWidth: 2
            });

            // RCL Text
            Game.map.visual.text(`RCL ${room.controller.level}`, new RoomPosition(25, 10, roomName), {
                color: '#ffffff',
                fontSize: 8,
                align: 'center',
                fontFamily: 'Tahoma'
            });

            // Safe Mode Icon
            if (room.controller.safeMode) {
                Game.map.visual.text('🛡️', new RoomPosition(40, 40, roomName), {
                    fontSize: 10,
                    align: 'center'
                });
            }
        }

        // Overlay Intel Information
        if (global.INTEL) {
            for (const roomName in global.INTEL) {
                const intel = global.INTEL[roomName];
                if (!intel) continue;

                // Hostile Threat Level
                if (intel.threatLevel > 0 && !myRooms.includes(roomName)) {
                    Game.map.visual.circle(new RoomPosition(25, 25, roomName), {
                        radius: 15,
                        fill: '#ff0000',
                        opacity: 0.2
                    });
                    Game.map.visual.text(`⚔️ ${intel.threatLevel}`, new RoomPosition(25, 28, roomName), {
                        color: '#ffaaaa',
                        fontSize: 10,
                        align: 'center'
                    });
                }

                // Invader Core / Stronghold
                if (intel.invaderCore) {
                    Game.map.visual.circle(new RoomPosition(25, 25, roomName), {
                        radius: 12,
                        fill: '#800080',
                        opacity: 0.3
                    });
                    Game.map.visual.text('👾', new RoomPosition(25, 20, roomName), {
                        fontSize: 10,
                        align: 'center'
                    });
                }

                // Power Bank
                if (intel.power) {
                    Game.map.visual.text('⚡', new RoomPosition(10, 10, roomName), {
                        fontSize: 8,
                        align: 'center'
                    });
                }

                // Commodity Deposit
                if (intel.commodity) {
                    Game.map.visual.text('💎', new RoomPosition(40, 10, roomName), {
                        fontSize: 8,
                        align: 'center'
                    });
                }
            }
        }

        // Target Rooms (Military/Operations)
        if (Memory.targetRooms) {
            for (const roomName in Memory.targetRooms) {
                const target = Memory.targetRooms[roomName];
                Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, {
                    fill: '#ff0000',
                    opacity: 0.1,
                    stroke: '#ff0000',
                    strokeWidth: 1
                });
                const typeText = target && target.type ? target.type.toUpperCase() : 'TARGET';
                Game.map.visual.text(`🎯 ${typeText}`, new RoomPosition(25, 40, roomName), {
                    color: '#ff4444',
                    fontSize: 6,
                    align: 'center',
                    fontFamily: 'Tahoma'
                });
            }
        }

        // Auxiliary Targets
        if (Memory.auxiliaryTargets) {
            for (const roomName in Memory.auxiliaryTargets) {
                const target = Memory.auxiliaryTargets[roomName];
                const typeText = target.type ? target.type.toUpperCase() : 'AUX';
                Game.map.visual.text(`🔍 ${typeText}`, new RoomPosition(25, 45, roomName), {
                    color: '#ffff00',
                    fontSize: 6,
                    align: 'center',
                    fontFamily: 'Tahoma'
                });
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