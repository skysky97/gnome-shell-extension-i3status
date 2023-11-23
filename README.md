# README

This extension integrates i3status into gnome top bar.

Currently only cpu, memory and disk status is supported and any other status are ignored event if
configured in i3status config.

As i3status supports kinds of output format, only 'i3bar' format is acceptable.

The appearance is similar to system monitor. In order to show the label and unit, you shall define 
the content of status in the format of "label: value unit". Otherwise all the text are treated as
value.

For example:
```
cpu_usage {
        format = "cpu:%usage"
}
```

Install:

- Using gnome-extension tool to install the package: `gnome-extension install i3status@skysky97.github.com-gnone-shell.gzip`.
- The extension will be installed to '$HOME/.local/share/gnome-shell/extension/'.
- Restarting gnone-shell: press 'Alt + F2` open command diag and run 'restart'.
- Enable i3status extension via tweak tool or extension tool.
- Path of i3status is hard coded to '/usr/bin/i3status', you can install i3status via package manager.
- If not work, see sys log for details. In ubuntu, run `journalctl -b`.

