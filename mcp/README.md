# ProseCraft MCP (local-only, stdio, read/write)

Exposes ProseCraft **open-folder sync directories** (`prosecraft-folder.json`,
`projects/*/project.json`, `documents/*.md`, `chapters/*.json`) as MCP tools.
No network, no encryption handling — use an **open-folder** sync location, not
the encrypted vault.

## Tools

- `list_projects` — projects in the folder
- `list_chapters` / `create_chapter` / `update_chapter`
- `list_scenes` / `read_scene` / `write_scene` / `trash_scene`

Writes bump `updatedAt`/`revision`, set `updatedBy: "mcp"`, and recompute file
and header hashes, so the app picks them up as external changes on next sync.
`trash_scene` tombstones the entity and removes the file, matching the app.

## Setup

```sh
cd mcp
npm install
npm run build
export PROSECRAFT_OPEN_DIR="/path/to/open sync folder"
npm start
```

In ProseCraft web/desktop: Settings → Device sync → open-folder method, choose
the same folder, Sync now before and after MCP edits.

## Client config (stdio)

```json
{
  "mcpServers": {
    "prosecraft": {
      "command": "node",
      "args": ["/absolute/path/to/ProseCraft/mcp/dist/index.js"],
      "env": { "PROSECRAFT_OPEN_DIR": "/path/to/open sync folder" }
    }
  }
}
```

## Safety

- Local stdin/stdout only; the server never listens on a port.
- Start with a test project or backup; `write_scene`/`trash_scene` modify files.
- Encrypted layouts are out of scope for v1.
