import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createChapter,
  listChapters,
  listProjects,
  listScenes,
  readScene,
  resolveRoot,
  trashScene,
  updateChapter
} from "./openStore.js";
import {
  listComments,
  listLabels,
  listSnapshots,
  listWikiFolders,
  listWikiPages,
  readSnapshot,
  readWikiPage
} from "./readTools.js";
import { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT, searchDocuments } from "./searchTools.js";
import { addComment, createWikiPage, resolveComment, setLabel, updateWikiPage, writeScene } from "./safeWrites.js";

const server = new McpServer({ name: "prosecraft", version: "0.1.0" });

server.tool("list_projects", "List ProseCraft projects in the open sync folder.", {}, async () => {
  const root = resolveRoot();
  const projects = await listProjects(root);
  return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
});

server.tool(
  "list_chapters",
  "List chapters in a project, optionally filtered by label or Trash state.",
  {
    projectId: z.string().describe("Project id from list_projects"),
    labelId: z.string().optional().describe("Only chapters with this label"),
    trashed: z.boolean().optional().describe("true lists only trashed chapters; omit for live ones")
  },
  async ({ projectId, labelId, trashed }) => {
    const chapters = await listChapters(resolveRoot(), projectId, { labelId, trashed });
    return { content: [{ type: "text", text: JSON.stringify(chapters, null, 2) }] };
  }
);

server.tool(
  "list_scenes",
  "List scenes (documents) and Wiki pages in a project, optionally filtered by chapter, label or Trash state.",
  {
    projectId: z.string(),
    chapterId: z.string().optional().describe("Only scenes in this chapter"),
    labelId: z.string().optional().describe("Only scenes with this label"),
    trashed: z.boolean().optional().describe("true lists only trashed scenes; omit for live ones")
  },
  async ({ projectId, chapterId, labelId, trashed }) => {
    const scenes = await listScenes(resolveRoot(), projectId, { chapterId, labelId, trashed });
    const slim = scenes.map((s) => ({
      id: s.id,
      title: s.title,
      space: s.space,
      chapterId: s.chapterId,
      folderId: s.folderId,
      labelId: s.labelId,
      trashed: s.trashed,
      updatedAt: s.meta.updatedAt,
      revision: s.meta.revision,
      chars: s.markdown.length
    }));
    return { content: [{ type: "text", text: JSON.stringify(slim, null, 2) }] };
  }
);

server.tool(
  "search_documents",
  "Search scene and Wiki page titles and bodies with the app's matching rules: " +
    "literal query, diacritics folded unless caseSensitive, optional wholeWord. " +
    "Returns one result per document with a short plain-text snippet around the first match.",
  {
    projectId: z.string(),
    query: z.string().describe("Literal text to find"),
    space: z.enum(["scene", "wiki"]).optional().describe("Only scenes or only Wiki pages"),
    chapterId: z.string().optional().describe("Only scenes in this chapter"),
    folderId: z.string().optional().describe("Only Wiki pages in this folder"),
    labelId: z.string().optional().describe("Only documents with this label"),
    includeTrashed: z.boolean().optional().describe("Search the Trash too"),
    caseSensitive: z.boolean().optional().describe("Match case and diacritics exactly"),
    wholeWord: z.boolean().optional().describe("Match whole words only"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_SEARCH_LIMIT)
      .optional()
      .describe(`Maximum number of results (default ${DEFAULT_SEARCH_LIMIT})`)
  },
  async ({ projectId, query, space, chapterId, folderId, labelId, includeTrashed, caseSensitive, wholeWord, limit }) => {
    const hits = await searchDocuments(resolveRoot(), projectId, query, {
      space,
      chapterId,
      folderId,
      labelId,
      includeTrashed,
      caseSensitive,
      wholeWord,
      limit
    });
    return { content: [{ type: "text", text: JSON.stringify(hits, null, 2) }] };
  }
);

server.tool(
  "read_scene",
  "Read one scene as Markdown with metadata; fields carries every frontmatter field as stored. " +
    "Trashed scenes fail unless includeTrashed is set.",
  {
    projectId: z.string(),
    sceneId: z.string(),
    includeTrashed: z.boolean().optional().describe("Read the scene even if it is in the Trash")
  },
  async ({ projectId, sceneId, includeTrashed }) => {
    const scene = await readScene(resolveRoot(), projectId, sceneId, { includeTrashed });
    return { content: [{ type: "text", text: JSON.stringify(scene, null, 2) }] };
  }
);

server.tool(
  "list_wiki_pages",
  "List Wiki pages with title, folder path and kind; no bodies.",
  {
    projectId: z.string(),
    folderId: z.string().optional().describe("Only pages directly in this Wiki folder")
  },
  async ({ projectId, folderId }) => {
    const pages = await listWikiPages(resolveRoot(), projectId, folderId);
    return { content: [{ type: "text", text: JSON.stringify(pages, null, 2) }] };
  }
);

server.tool(
  "read_wiki_page",
  "Read one Wiki page: Markdown body plus every frontmatter field as fields.",
  { projectId: z.string(), pageId: z.string() },
  async ({ projectId, pageId }) => {
    const page = await readWikiPage(resolveRoot(), projectId, pageId);
    return { content: [{ type: "text", text: JSON.stringify(page, null, 2) }] };
  }
);

server.tool(
  "list_wiki_folders",
  "List the Wiki folder tree.",
  { projectId: z.string() },
  async ({ projectId }) => {
    const folders = await listWikiFolders(resolveRoot(), projectId);
    return { content: [{ type: "text", text: JSON.stringify(folders, null, 2) }] };
  }
);

server.tool(
  "write_scene",
  "Create or update a scene. Omit sceneId to create with a generated id. " +
    "Only title, chapterId and the body change; every other frontmatter field is preserved. " +
    "An unknown sceneId fails unless create is true. " +
    "Overwriting an existing scene first stores its previous text as a snapshot unless snapshot is false; " +
    "the result carries the snapshot id (null when none was taken). " +
    "Pass expectedRevision to fail instead of overwriting a newer edit; the result carries the new revision.",
  {
    projectId: z.string(),
    sceneId: z.string().optional(),
    chapterId: z.string().optional(),
    title: z.string().optional(),
    markdown: z.string().describe("Scene body in Markdown"),
    create: z.boolean().optional().describe("Create a new scene when sceneId is unknown"),
    snapshot: z.boolean().optional().describe("Set false to skip the snapshot before overwriting"),
    expectedRevision: z.number().int().nonnegative().optional().describe("Fail unless the stored scene revision equals this")
  },
  async ({ projectId, sceneId, chapterId, title, markdown, create, snapshot, expectedRevision }) => {
    const scene = await writeScene(resolveRoot(), projectId, {
      sceneId,
      chapterId,
      title,
      markdown,
      create,
      snapshot,
      expectedRevision
    });
    return { content: [{ type: "text", text: JSON.stringify(scene, null, 2) }] };
  }
);

server.tool(
  "trash_scene",
  "Move a scene to Trash (tombstone + remove file). " +
    "Pass expectedRevision to fail instead of trashing a newer edit; the result carries the new revision.",
  {
    projectId: z.string(),
    sceneId: z.string(),
    expectedRevision: z.number().int().nonnegative().optional().describe("Fail unless the stored scene revision equals this")
  },
  async ({ projectId, sceneId, expectedRevision }) => {
    const result = await trashScene(resolveRoot(), projectId, sceneId, { expectedRevision });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "create_chapter",
  "Create a chapter.",
  { projectId: z.string(), title: z.string(), summary: z.string().optional() },
  async ({ projectId, title, summary }) => {
    const chapter = await createChapter(resolveRoot(), projectId, title, summary);
    return { content: [{ type: "text", text: JSON.stringify(chapter, null, 2) }] };
  }
);

server.tool(
  "update_chapter",
  "Rename a chapter or update its summary. " +
    "Pass expectedRevision to fail instead of overwriting a newer edit; the result carries the new revision.",
  {
    projectId: z.string(),
    chapterId: z.string(),
    title: z.string().optional(),
    summary: z.string().optional(),
    expectedRevision: z.number().int().nonnegative().optional().describe("Fail unless the stored chapter revision equals this")
  },
  async ({ projectId, chapterId, title, summary, expectedRevision }) => {
    const chapter = await updateChapter(resolveRoot(), projectId, chapterId, { title, summary, expectedRevision });
    return { content: [{ type: "text", text: JSON.stringify(chapter, null, 2) }] };
  }
);

server.tool(
  "create_wiki_page",
  "Create a Wiki page (space: \"Wiki\"). folderId must be an existing Wiki folder, labelId an existing label. " +
    "The result carries the new revision.",
  {
    projectId: z.string(),
    title: z.string(),
    folderId: z.string().optional().describe("Wiki folder from list_wiki_folders"),
    content: z.string().optional().describe("Page body in Markdown"),
    labelId: z.string().optional().describe("Label from list_labels")
  },
  async ({ projectId, title, folderId, content, labelId }) => {
    const page = await createWikiPage(resolveRoot(), projectId, { title, folderId, content, labelId });
    return { content: [{ type: "text", text: JSON.stringify(page, null, 2) }] };
  }
);

server.tool(
  "update_wiki_page",
  "Update a Wiki page. Omitted fields keep their stored value and every other frontmatter field is preserved. " +
    "The previous text is stored as a snapshot first; the result carries the snapshot id and new revision. " +
    "Pass expectedRevision to fail instead of overwriting a newer edit.",
  {
    projectId: z.string(),
    pageId: z.string(),
    title: z.string().optional(),
    content: z.string().optional().describe("New page body in Markdown"),
    folderId: z.string().optional().describe("Move the page to this Wiki folder"),
    labelId: z.string().optional().describe("Label from list_labels"),
    expectedRevision: z.number().int().nonnegative().optional().describe("Fail unless the stored page revision equals this")
  },
  async ({ projectId, pageId, title, content, folderId, labelId, expectedRevision }) => {
    const page = await updateWikiPage(resolveRoot(), projectId, {
      pageId,
      title,
      content,
      folderId,
      labelId,
      expectedRevision
    });
    return { content: [{ type: "text", text: JSON.stringify(page, null, 2) }] };
  }
);

server.tool(
  "set_label",
  "Set or clear the label of a document or a chapter. labelId null clears it; " +
    "an unknown labelId fails without writing.",
  {
    projectId: z.string(),
    documentId: z.string().optional().describe("Scene or Wiki page id"),
    chapterId: z.string().optional().describe("Chapter id; pass either this or documentId"),
    labelId: z.string().nullable().describe("Label from list_labels, or null to clear")
  },
  async ({ projectId, documentId, chapterId, labelId }) => {
    if ((documentId === undefined) === (chapterId === undefined)) {
      throw new Error("Pass exactly one of documentId or chapterId.");
    }
    const result =
      documentId !== undefined
        ? await setLabel(resolveRoot(), projectId, { documentId, labelId })
        : await setLabel(resolveRoot(), projectId, { chapterId, labelId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "add_comment",
  "Add a comment anchored to a quote in a document. The quote must occur exactly once in the plain text; " +
    "prefix and suffix context are stored like the app does.",
  {
    projectId: z.string(),
    documentId: z.string(),
    quote: z.string().describe("Exact passage the comment is anchored to"),
    text: z.string().describe("Comment body"),
    author: z.string().optional().describe("Defaults to Me")
  },
  async ({ projectId, documentId, quote, text, author }) => {
    const comment = await addComment(resolveRoot(), projectId, { documentId, quote, text, author });
    return { content: [{ type: "text", text: JSON.stringify(comment, null, 2) }] };
  }
);

server.tool(
  "resolve_comment",
  "Mark a comment as resolved.",
  { projectId: z.string(), commentId: z.string() },
  async ({ projectId, commentId }) => {
    const result = await resolveComment(resolveRoot(), projectId, commentId);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "list_labels",
  "List project labels with the number of live documents and chapters using each.",
  { projectId: z.string() },
  async ({ projectId }) => {
    const labels = await listLabels(resolveRoot(), projectId);
    return { content: [{ type: "text", text: JSON.stringify(labels, null, 2) }] };
  }
);

server.tool(
  "list_comments",
  "List comments, optionally for one document. Resolved comments appear only with includeResolved.",
  {
    projectId: z.string(),
    documentId: z.string().optional().describe("Only comments on this document"),
    includeResolved: z.boolean().optional().describe("Include resolved comments")
  },
  async ({ projectId, documentId, includeResolved }) => {
    const comments = await listComments(resolveRoot(), projectId, { documentId, includeResolved });
    return { content: [{ type: "text", text: JSON.stringify(comments, null, 2) }] };
  }
);

server.tool(
  "list_snapshots",
  "List snapshot metadata, newest first; no text. Optionally only for one document.",
  {
    projectId: z.string(),
    documentId: z.string().optional().describe("Only snapshots of this document")
  },
  async ({ projectId, documentId }) => {
    const snapshots = await listSnapshots(resolveRoot(), projectId, documentId);
    return { content: [{ type: "text", text: JSON.stringify(snapshots, null, 2) }] };
  }
);

server.tool(
  "read_snapshot",
  "Read one snapshot, including its stored text.",
  { projectId: z.string(), snapshotId: z.string() },
  async ({ projectId, snapshotId }) => {
    const snapshot = await readSnapshot(resolveRoot(), projectId, snapshotId);
    return { content: [{ type: "text", text: JSON.stringify(snapshot, null, 2) }] };
  }
);

async function main(): Promise<void> {
  // Fail fast with a clear message instead of hanging the MCP client.
  resolveRoot();
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
