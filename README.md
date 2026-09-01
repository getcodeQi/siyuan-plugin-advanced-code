# Advanced Code for SiYuan

Advanced Code adds a CodeMirror 6 powered, multi-tab code block to SiYuan. It can convert a native SiYuan code block into an Advanced Code block and convert the first or all tabs back to native fenced code blocks.

## Features

- CodeMirror 6 editing with line numbers, history, folding, indentation, and language modes for common SiYuan code languages.
- Convert selected native code blocks to Advanced Code while preserving code and language.
- Convert Advanced Code blocks back to native code blocks. Multiple tabs are restored as adjacent native code blocks where the current SiYuan block tree allows insertion.
- Add, remove, switch, rename, and drag-sort tabs.
- Slash command, command palette commands, and block menu entries.
- Current document batch conversion for all native/Advanced Code blocks, including blocks not currently rendered on screen.
- Light/dark theme support, adaptive height, rounded border, and mobile layout.

## Known Limits

SiYuan documents currently mark `/api/transactions` as internal. This plugin uses the official kernel block update/insert endpoints and block-attribute endpoints. They reliably perform the conversion, but this version does not claim a single-undo guarantee; batch conversion is executed block by block and undo granularity depends on the current SiYuan kernel history implementation.

Code cloze deletion is intentionally not implemented. SiYuan `==mark==` is plain code text inside fenced code blocks, not native cloze content.
