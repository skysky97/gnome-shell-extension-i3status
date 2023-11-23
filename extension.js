/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */
const Main = imports.ui.main;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Util = imports.misc.util; 
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const PanelMenu = imports.ui.panelMenu;

class Extension {
    constructor() {
        this._running = false;
        this._i3status = null;
        this._filter_status_names = ['disk_info', 'memory', 'cpu_usage'];
        this._status_items = [];
        this._display_box = null;
    }

    _split_status_text(text) {
        /*
         * We assume the text is in the format of "label: value unit".
         * First we lookup for label
         *   If not, the label is empty.
         * Then we lookup for unit, we assume the value contains only digits and dots, and the unit is the rest.
         *   If not, all the text is the value, and the unit is empty.
         */
        let label = '';
        let value = '';
        let unit = '';
        const label_regex = /([\w]+):(.*)/;
        const label_match = label_regex.exec(text);
        if (label_match) {
            label = label_match[1];
            value = label_match[2];
        } else {
            label = '';
            value = text;
        }
        const unit_regex = /([\d.]+)\s*(.*)/;
        const unit_match = unit_regex.exec(value);
        if (unit_match) {
            value = unit_match[1];
            unit = unit_match[2];
        }
        return [label, value, unit];
    }

    _parse_i3status_i3bar(text) {
        let status_infos = [];
        /* Ignore too short lines */
        if (text.length <= 1) {
            return status_infos;
        }
        /* if first char is a comma, remove it */
        if (text[0] == ',') {
            text = text.slice(1);
        }
        /*
         * Parse each line as JSON.
         * If it's an array, it's a status line. A status line may contain multiple status info.
         * If it's an object, it's maybe a version info, just ignore it.
         */
        try {
            const status = JSON.parse(text);
            if (Array.isArray(status)) {
                for (const item of status) {
                    if (item.full_text && this._filter_status_names.includes(item.name)) {
                        let [label, value, unit] = this._split_status_text(item.full_text);
                        status_infos.push({
                            "label": label,
                            "value": value,
                            "unit": unit});
                    }
                }
            }
        } catch (e) {
            global.log("i3status: " + e);
        }
        return status_infos;
    }

    _update_status(status_infos) {
        if (!status_infos) {
            return;
        }
        if (this._status_items.length < status_infos.length) {
            this._create_status_items(status_infos.length - this._status_items.length);
        }
        if (this._status_items.length > status_infos.length) {
            this._remove_status_items(this._status_items.length - status_infos.length);
        }
        for (let i = 0; i < status_infos.length; i++) {
            this._status_items[i][0].set_text(status_infos[i].label);
            this._status_items[i][1].set_text(status_infos[i].value);
            this._status_items[i][2].set_text(status_infos[i].unit);
        }

    }

    _read_i3status_async() {
        /*
         * Read lines from stdout asynchronously.
         */
	this._i3status.stdout.read_line_async(GLib.PRIORITY_DEFAULT, null, Lang.bind(this, function(stream, result) {
            /* In case i3status is closed, we need to stop reading from stdout. */
            if (!this._running || !this._i3status) {
                global.log("i3status closed by user");
                return;
            }

	    let [line, length] = stream.read_line_finish_utf8(result);
            if (length > 0) {
                /*
                 * Parse the text in the format of 'i3bar'.
                 * i3status supports many output formats, like 'i3bar', 'dzen2', 'xmobar' ...
                 * We only support 'i3bar' here.
                 */
                let status_infos = this._parse_i3status_i3bar(line);
                this._update_status(status_infos);
            } else {
                /* If the stream is closed, we need to restart i3status. */
                global.log("i3status closed for unknown reason, restarting");
                this._start_i3status();
            }
            /* Read next line */
            this._read_i3status_async();
        }));
    }

    _start_i3status() {
        /*
         * Start i3status and read from stdout.
         * - We need to use spawn_async_with_pipes to run i3status as a child process. 
         * - We need to close stdin and stderr.
         */
	let [succ, pid, stdin, stdout, stderr] =
               GLib.spawn_async_with_pipes(null, /* cwd */
                                          ["/usr/bin/i3status"],
                                          null, /* env */
                                          0, /* flags: .etc GLib.SpawnFlags.DO_NOT_REAP_CHILD */
                                          null /* child_setup */);
        global.log("i3status started: " + succ);

        if (succ) {
            this._i3status = {
                "pid": pid,
                "stdout": new Gio.DataInputStream({base_stream: new Gio.UnixInputStream({fd: stdout, close_fd: true})}),
            };

            new Gio.UnixOutputStream({fd: stdin, close_fd: true}).close(null);
            new Gio.UnixInputStream({fd: stderr, close_fd: true}).close(null);
        
            this._running = true;

            /* Read from stdout right after i3status started */
            this._read_i3status_async()
        }
    }

    _stop_i3status() {
        /* Set _running to false to stop asynchronously reading from stdout. */
        this._running = false;

        GLib.spawn_close_pid(this._i3status.pid);

        this._i3status = null;
    }

    _create_status_items(count) {
        for (let i = 0; i < count; i++) {
            let label_item = new St.Label({
                text: '',
                style_class: 'status-label',
                y_align: Clutter.ActorAlign.START});
            let text_item = new St.Label({
                text: '',
                style_class: 'status-value',
                y_align: Clutter.ActorAlign.CENTER});
            let unit_item = new St.Label({
                text: '',
                style_class: 'status-label',
                y_align: Clutter.ActorAlign.CENTER});
            this._display_box.add_actor(label_item);
            this._display_box.add_actor(text_item);
            this._display_box.add_actor(unit_item);
            this._status_items.push([label_item, text_item, unit_item]);
        }
    }

    _remove_status_items(count) {
        for (let i = 0; i < count; i++) {
            let item = this._status_items.pop();
            item[0].destroy();
            item[1].destroy();
            item[2].destroy();
        }
    }

    enable() {
        /*
         * Create layout:
         *
         * Button
         *   BoxLayout
         *      Label Label Label
         */
        this._status_panel = new PanelMenu.Button(0.0, "i3status");
        this._display_box = new St.BoxLayout();
        this._status_panel.add_actor(this._display_box);
        Main.panel.addToStatusArea('i3status', this._status_panel, 0, 'right');

        /* Start i3status and read its stdout asynchronously. */
        this._start_i3status();
    }

    disable() {
        this._stop_i3status();

        for (const item of this._status_items) {
            item[0].destroy(); /* label */
            item[1].destroy(); /* text */
            item[2].destroy(); /* unit */
        }
        this._status_items = [];
        this._display_box.destroy();
        this._display_box = null;
        this._status_panel.destroy();
        this._status_panel = null;
    }
}

function init() {
    return new Extension();
}
