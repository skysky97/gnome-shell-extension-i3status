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
