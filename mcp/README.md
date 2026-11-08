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

Every write goes to a sibling temp file that is renamed over its target, so a
crash leaves the previous file intact, and writes are serialized by a
`.prosecraft-mcp.lock` file in the open root (stale after 30 s) that makes a
second concurrent call fail instead of interleaving. `trash_scene` writes the
tombstone header first and removes the document afterwards, the order the app
uses, so a missing file only ever belongs to an already tombstoned id.

`write_scene`, `trash_scene` and `update_chapter` accept an optional
`expectedRevision`, and every write result carries the new `revision`. Chain
calls by passing the revision you just read: if another client wrote in the
meantime, the call fails with the current revision and writes nothing.

`write_scene` keeps every frontmatter field it does not own (`space`, `folderId`,
`labelId`, character/place profiles, Trash markers) intact, so editing a Wiki
page through MCP does not drop it out of its folder. An unknown `sceneId` fails
unless the call sets `create: true`. `read_scene` reads that one file directly
and fails for trashed scenes unless `includeTrashed` is set; `list_scenes`
skips a malformed document instead of failing the whole project.

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
