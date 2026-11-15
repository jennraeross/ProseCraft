# ProseCraft MCP (local-only, stdio, read/write)

Exposes ProseCraft **open-folder sync directories** (`prosecraft-folder.json`,
`projects/*/project.json`, `documents/*.md`, `chapters/*.json`) as MCP tools.
No network, no encryption handling — use an **open-folder** sync location, not
the encrypted vault.

## Tools

- `list_projects` — projects in the folder
- `list_chapters` / `create_chapter` / `update_chapter`
- `list_scenes` / `read_scene` / `write_scene` / `trash_scene`
- `search_documents` — title/body search across scenes and Wiki pages
- `list_wiki_pages` / `read_wiki_page` / `list_wiki_folders` — Wiki pages and their folder tree
- `create_wiki_page` / `update_wiki_page` — new Wiki pages, or edits that keep every other field
- `set_label` — set or clear the label of a document or chapter
- `add_comment` / `resolve_comment` — comments anchored to a passage of text
- `list_labels` — project labels with document and chapter counts
- `list_comments` — comments on passages of text
- `list_snapshots` / `read_snapshot` — saved copies of document text

Writes bump `updatedAt`/`revision`, set `updatedBy: "mcp"`, and recompute file
and header hashes, so the app picks them up as external changes on next sync.
`trash_scene` tombstones the entity and removes the file, matching the app.

Every write goes to a sibling temp file that is renamed over its target, so a
crash leaves the previous file intact, and writes are serialized by a
`.prosecraft-mcp.lock` file in the open root (stale after 30 s) that makes a
second concurrent call fail instead of interleaving. `trash_scene` writes the
tombstone header first and removes the document afterwards, the order the app
uses, so a missing file only ever belongs to an already tombstoned id.

`write_scene`, `trash_scene`, `update_chapter` and `update_wiki_page` accept an
optional `expectedRevision`, and every write result carries the new `revision`. Chain
calls by passing the revision you just read: if another client wrote in the
meantime, the call fails with the current revision and writes nothing.

Overwriting an existing document with `write_scene` first stores its old text
as a snapshot in `project.json` `snapshots` — the same shape the app uses, with
reason `manual` and note `Before MCP write` — and reports the new `snapshotId`
in the result. Snapshots of one document are capped at ten, dropping the
oldest, like `addSnapshot` in `src/lib/snapshots.ts`. Pass `snapshot: false` to
overwrite without one; a new scene never snapshots. `update_wiki_page`
snapshots the previous text the same way and also reports its `snapshotId`.

`create_wiki_page` and `update_wiki_page` write documents with `space: "Wiki"`.
A `folderId` must be an existing `researchFolders` id and a `labelId` an
existing project label, otherwise the call fails before writing. Updates start
from the stored frontmatter, so title, folder, label, character/place profiles
and unknown keys survive unless the call changes them, and a document outside
the Wiki space is refused. `set_label` sets or clears (`labelId: null`) the
label of one document or one chapter and rejects unknown label ids.

`add_comment` stores a `TextComment` in `project.json` `comments`, anchored by
the quoted passage plus 24 characters of prefix and suffix like the app's
`buildAnchor`; the quote must occur exactly once in the document, else the call
fails and writes nothing. `resolve_comment` marks one comment resolved. All
write tools take the same advisory lock and write through a temp file rename.

`write_scene` keeps every frontmatter field it does not own (`space`, `folderId`,
`labelId`, character/place profiles, Trash markers) intact, so editing a Wiki
page through MCP does not drop it out of its folder. An unknown `sceneId` fails
unless the call sets `create: true`. `read_scene` reads that one file directly,
returns every frontmatter field as `fields`, and fails for trashed scenes unless
`includeTrashed` is set; `list_scenes` skips a malformed document instead of
failing the whole project. Both listings take optional `labelId` and `trashed`
filters and return `space`, `folderId` and `labelId` for every item; `trashed`
selects the trashed items only, omitting it lists live ones.

`search_documents` uses the app's matching rules (`src/lib/search.ts`): the
query is taken literally, diacritics are folded unless `caseSensitive` is set,
and `wholeWord` skips partial words. Narrow results with `space` (`scene` or
`wiki`), `chapterId`, `folderId` or `labelId`; trashed documents and documents
in trashed chapters are skipped unless `includeTrashed` is set. Each hit
carries the chapter title, label id, match count and a plain-text snippet of
about 80 characters around the first match, taken from the document body
(Markdown or HTML) with markup removed. `limit` defaults to 30 and is clamped
to 100.

Wiki pages are documents with `space: "Wiki"`, so they also show up in the scene
tools. The Wiki read tools add the folder context and never return a body except
in `read_wiki_page`: `list_wiki_pages` reports title, folder id, folder path
(one title per level) and a derived `kind` (`character` or `place` when the page
carries that profile, `page` otherwise). `list_labels` counts live documents and
chapters; trashed ones are not counted. `list_comments` hides resolved comments
unless `includeResolved` is set, and `list_snapshots` returns metadata only —
newest first — while `read_snapshot` returns the stored text.

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
