"""Shared CSV-export helpers.

Spreadsheet applications (Excel, LibreOffice Calc) treat a cell whose first
character is one of ``= + - @`` (or a leading tab / carriage return) as a
formula. When an export mixes user-controlled text with a higher-privileged
reader — e.g. a teacher/admin opening a class report that contains
student-supplied names — that becomes a stored CSV / formula-injection vector.
``csv_safe`` neutralises a cell by prefixing it with a single quote, the
standard mitigation (field quoting alone does not stop formula execution).

``UTF8_BOM`` is prepended to an export so Excel auto-detects UTF-8 and renders
non-ASCII names (e.g. Chinese) correctly instead of mojibake; Excel ignores the
HTTP ``charset`` for a downloaded ``.csv`` and falls back to the system ANSI
code page without it.
"""
from __future__ import annotations

CSV_INJECTION_TRIGGERS = ("=", "+", "-", "@", "\t", "\r")

# Byte-order mark; prepend to a CSV body so Excel detects UTF-8 on download.
UTF8_BOM = "﻿"


def csv_safe(val: str) -> str:
    """Prefix val with ' if it starts with a spreadsheet formula-trigger character."""
    if val and val[0] in CSV_INJECTION_TRIGGERS:
        return "'" + val
    return val
