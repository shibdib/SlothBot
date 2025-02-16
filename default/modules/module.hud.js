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

        for (const room of this.getOwnedRooms()) {
            this.updateData(room);
            this.renderDashboard(room);
        }
    }

    getOwnedRooms() {
        return Object.values(Game.rooms).filter(r => r.controller && r.controller.my);
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
            this.hudData.GCL.last = currentProgress;
        }
    }

    updateRCLData(room) {
        if (!room.controller.progressTotal) return;
        const currentProgress = room.controller.progress;
        this.hudData.RCL[room.name] = this.hudData.RCL[room.name] || {last: currentProgress, progress: []};
        if (currentProgress > this.hudData.RCL[room.name].last) {
            this.hudData.RCL[room.name].progress.push(currentProgress - this.hudData.RCL[room.name].last);
            if (this.hudData.RCL[room.name].progress.length > 25) this.hudData.RCL[room.name].progress.shift();
            this.hudData.RCL[room.name].last = currentProgress;
        }
    }

    average(arr) {
        return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    }

    renderDashboard(room) {
        const x = 1;
        let y = 1;

        y = this.renderProgressDots(room, x, y, 'GCL', this.getGCLInfo(), '#00B7EB');
        if (room.level < 8) {
            y = this.renderProgressDots(room, x, y, 'RCL', this.getRCLInfo(room), '#7D3C98');
        }
        y = this.renderStatusIcon(room, x, y);
        y = this.renderEnergyInfo(room, x, y);
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

    renderProgressDots(room, x, y, label, info, color) {
        const dots = Math.round(info.progress / 10); // 10% per dot
        for (let i = 0; i < 10; i++) {
            room.visual.circle(x + i, y, {
                radius: 0.2,
                fill: i < dots ? color : '#333333',
                opacity: 1
            });
        }
        room.visual.text(`${label}: ${info.level} (${info.time})`, x + 10, y, {
            color: color,
            align: 'left',
            font: '0.5 Tahoma',
            opacity: 1
        });
        return y + 1;
    }

    renderStatusIcon(room, x, y) {
        if (room.controller.safeMode) {
            room.visual.text('⏳', x, y, {color: '#FF4500', align: 'left', font: '0.5 Tahoma'});
            room.visual.text(`${this.timeFormat(room.controller.safeMode * Memory.tickInfo.tickLength)}`, x + 1, y, {
                color: '#FF4500',
                align: 'left',
                font: '0.5 Tahoma'
            });
        } else if (INTEL[room.name] && INTEL[room.name].threatLevel) {
            room.visual.text('⚔️', x, y, {color: '#FF0000', align: 'left', font: '0.5 Tahoma'});
            room.visual.text(`Level ${INTEL[room.name].threatLevel}`, x + 1, y, {
                color: '#FF0000',
                align: 'left',
                font: '0.5 Tahoma'
            });
        }
        return y + 1;
    }

    renderEnergyInfo(room, x, y) {
        const storage = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
        const terminal = room.terminal ? room.terminal.store[RESOURCE_ENERGY] : 0;
        room.visual.text(`⚡ ${storage + terminal}`, x, y, {color: '#FFD700', align: 'left', font: '0.5 Tahoma'});
        return y + 1;
    }

    timeFormat(seconds) {
        if (seconds === Infinity || seconds < 0) return 'Calculating...';
        const [h, m, s] = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), Math.floor(seconds % 60)];
        return `${h}h ${m}m ${s}s`.replace(/\b0\w+\s*/g, '');
    }
}

profiler.registerClass(HUD, 'HUD');
module.exports = HUD;