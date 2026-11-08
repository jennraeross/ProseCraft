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
  updateChapter,
  writeScene
} from "./openStore.js";

const server = new McpServer({ name: "prosecraft", version: "0.1.0" });

server.tool("list_projects", "List ProseCraft projects in the open sync folder.", {}, async () => {
  const root = resolveRoot();
  const projects = await listProjects(root);
  return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
});

server.tool(
  "list_chapters",
  "List chapters in a project.",
  { projectId: z.string().describe("Project id from list_projects") },
  async ({ projectId }) => {
    const chapters = await listChapters(resolveRoot(), projectId);
    return { content: [{ type: "text", text: JSON.stringify(chapters, null, 2) }] };
  }
);

server.tool(
  "list_scenes",
  "List scenes (documents) in a project, optionally filtered by chapter.",
  {
    projectId: z.string(),
    chapterId: z.string().optional().describe("Only scenes in this chapter")
  },
  async ({ projectId, chapterId }) => {
    const scenes = await listScenes(resolveRoot(), projectId, chapterId);
    const slim = scenes.map((s) => ({
      id: s.id,
      title: s.title,
      chapterId: s.chapterId,
      updatedAt: s.meta.updatedAt,
      revision: s.meta.revision,
      chars: s.markdown.length
    }));
    return { content: [{ type: "text", text: JSON.stringify(slim, null, 2) }] };
  }
);

server.tool(
  "read_scene",
  "Read one scene as Markdown with metadata. Trashed scenes fail unless includeTrashed is set.",
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
  "write_scene",
  "Create or update a scene. Omit sceneId to create with a generated id. " +
    "Only title, chapterId and the body change; every other frontmatter field is preserved. " +
    "An unknown sceneId fails unless create is true. " +
    "Pass expectedRevision to fail instead of overwriting a newer edit; the result carries the new revision.",
  {
    projectId: z.string(),
    sceneId: z.string().optional(),
    chapterId: z.string().optional(),
    title: z.string().optional(),
    markdown: z.string().describe("Scene body in Markdown"),
    create: z.boolean().optional().describe("Create a new scene when sceneId is unknown"),
    expectedRevision: z.number().int().nonnegative().optional().describe("Fail unless the stored scene revision equals this")
  },
  async ({ projectId, sceneId, chapterId, title, markdown, create, expectedRevision }) => {
    const scene = await writeScene(resolveRoot(), projectId, { sceneId, chapterId, title, markdown, create, expectedRevision });
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

async function main(): Promise<void> {
  // Fail fast with a clear message instead of hanging the MCP client.
  resolveRoot();
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
