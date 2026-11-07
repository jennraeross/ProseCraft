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
  "Read one scene as Markdown with metadata.",
  { projectId: z.string(), sceneId: z.string() },
  async ({ projectId, sceneId }) => {
    const scene = await readScene(resolveRoot(), projectId, sceneId);
    return { content: [{ type: "text", text: JSON.stringify(scene, null, 2) }] };
  }
);

server.tool(
  "write_scene",
  "Create or update a scene. Omit sceneId to create; pass chapterId when creating.",
  {
    projectId: z.string(),
    sceneId: z.string().optional(),
    chapterId: z.string().optional(),
    title: z.string().optional(),
    markdown: z.string().describe("Scene body in Markdown")
  },
  async ({ projectId, sceneId, chapterId, title, markdown }) => {
    const scene = await writeScene(resolveRoot(), projectId, { sceneId, chapterId, title, markdown });
    return { content: [{ type: "text", text: JSON.stringify(scene, null, 2) }] };
  }
);

server.tool(
  "trash_scene",
  "Move a scene to Trash (tombstone + remove file).",
  { projectId: z.string(), sceneId: z.string() },
  async ({ projectId, sceneId }) => {
    await trashScene(resolveRoot(), projectId, sceneId);
    return { content: [{ type: "text", text: `Trashed scene ${sceneId}.` }] };
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
  "Rename a chapter or update its summary.",
  {
    projectId: z.string(),
    chapterId: z.string(),
    title: z.string().optional(),
    summary: z.string().optional()
  },
  async ({ projectId, chapterId, title, summary }) => {
    const chapter = await updateChapter(resolveRoot(), projectId, chapterId, { title, summary });
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
