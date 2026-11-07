import { CHARACTER_SECTIONS, PLACE_SECTIONS, sheetToHtml, type SheetSection } from "./publish/sheets";
import type { BinderFolder, DocumentData } from "./publish/types";
import { sanitizeHtml } from "./sanitize";

export type StarterId =
  | "blank"
  | "fantasy"
  | "scifi"
  | "crime"
  | "historical"
  | "romance"
  | "nonfiction"
  | "thriller";

export type Starter = {
  id: StarterId;
  label: string;
  description: string;
};

export const STARTERS: Starter[] = [
  { id: "blank", label: "Blank", description: "Start with an empty wiki." },
  { id: "fantasy", label: "Fantasy", description: "Characters, places, magic, cultures, creatures, history, and items." },
  { id: "scifi", label: "Science fiction", description: "Characters, worlds, technology, factions, species, and a timeline." },
  { id: "crime", label: "Crime", description: "Characters, suspects, crime scenes, clues, and a case timeline." },
  { id: "historical", label: "Historical novel", description: "Characters, places, period research, events, and sources." },
  { id: "romance", label: "Romance", description: "Characters, relationships, places, and story beats." },
  { id: "nonfiction", label: "Non-fiction", description: "A chapter outline, sources, key terms, and quotes." },
  { id: "thriller", label: "Thriller", description: "Characters, antagonist, places, organisations, timeline, clues, and research." }
];

type TemplatePage = {
  title: string;
  content: string;
};

type StarterFolder = {
  title: string;
  pages: TemplatePage[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Uses each field's placeholder as the prompt on the template page. */
function promptsFor(section: SheetSection): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of section.fields) {
    values[field.key] = field.placeholder;
  }
  return values;
}

/** One heading per sheet section, with the field placeholders as prompts. */
function sheetTemplatePage(title: string, sections: SheetSection[]): TemplatePage {
  const content = sections
    .map((section) => sheetToHtml([section], promptsFor(section), section.title))
    .join("\n");
  return { title, content };
}

function templatePage(title: string, prompts: Array<[string, string]>): TemplatePage {
  const body = prompts
    .map(([heading, prompt]) => `<h2>${escapeHtml(heading)}</h2>\n<p>${escapeHtml(prompt)}</p>`)
    .join("\n");
  return { title, content: body };
}

const CHARACTER_TEMPLATE = sheetTemplatePage("Character template", CHARACTER_SECTIONS);
const PLACE_TEMPLATE = sheetTemplatePage("Place template", PLACE_SECTIONS);

const STARTER_CONTENT: Record<StarterId, StarterFolder[]> = {
  blank: [],
  fantasy: [
    { title: "Characters", pages: [CHARACTER_TEMPLATE] },
    { title: "Places", pages: [PLACE_TEMPLATE] },
    {
      title: "Magic",
      pages: [
        templatePage("Magic system", [
          ["Source", "Where does magic come from, and who can reach it?"],
          ["Rules and limits", "What it can do, what it can never do, and what it costs."],
          ["Practitioners", "Who uses magic, how they learn it, and how others see them."],
          ["Everyday use", "How magic shows up in ordinary work, travel, and trade."],
          ["Story pressure", "What happens when magic fails, spreads, or is misused."]
        ])
      ]
    },
    {
      title: "Cultures",
      pages: [
        templatePage("Culture template", [
          ["Values", "What this culture prizes, and what it punishes."],
          ["Customs", "Greetings, meals, festivals, and everyday manners."],
          ["Language", "Words, accents, and phrases that mark someone as an insider."],
          ["Power", "Who leads, who follows, and how disputes are settled."],
          ["Friction", "What this culture disagrees with its neighbours about."]
        ])
      ]
    },
    {
      title: "Creatures",
      pages: [
        templatePage("Creature template", [
          ["Appearance", "Size, shape, and the details people notice first."],
          ["Habitat", "Where it lives and how it survives there."],
          ["Behaviour", "What it does when undisturbed, hungry, or threatened."],
          ["Dangers", "How it hurts people, and how people defend themselves."],
          ["Story role", "What it means in the story beyond being a threat."]
        ])
      ]
    },
    {
      title: "History & Timeline",
      pages: [
        templatePage("Timeline", [
          ["Before the story", "The old events everyone still refers to."],
          ["Recent past", "What changed in the last few years, and why."],
          ["Present day", "Where things stand when the story opens."],
          ["Open questions", "Dates and causes you still need to settle."]
        ])
      ]
    },
    {
      title: "Items",
      pages: [
        templatePage("Item template", [
          ["Description", "What it is, what it looks like, and what it is made of."],
          ["Origin", "Who made it, when, and for what purpose."],
          ["Powers", "What it does, and what it refuses to do."],
          ["Cost", "What using it takes from the bearer."],
          ["Where it is now", "Who holds it at the start of the story."]
        ])
      ]
    }
  ],
  scifi: [
    { title: "Characters", pages: [CHARACTER_TEMPLATE] },
    { title: "Places & Worlds", pages: [PLACE_TEMPLATE] },
    {
      title: "Technology",
      pages: [
        templatePage("Technology template", [
          ["What it does", "The job it performs in daily life."],
          ["How it works", "The principle in one or two sentences."],
          ["Limits", "Range, cost, failure modes, and who can repair it."],
          ["Control", "Who owns it, licenses it, or restricts it."],
          ["Consequences", "What it changed, and what it broke."]
        ])
      ]
    },
    {
      title: "Factions",
      pages: [
        templatePage("Faction template", [
          ["Goal", "What the faction wants, stated plainly."],
          ["Resources", "Money, people, ships, information, and favours."],
          ["Methods", "How it gets what it wants, and how far it will go."],
          ["Allies and rivals", "Who works with it, and who stands in its way."],
          ["Weakness", "What could split it or bring it down."]
        ])
      ]
    },
    {
      title: "Species",
      pages: [
        templatePage("Species template", [
          ["Biology", "Body, senses, lifespan, and what they need to live."],
          ["Homeworld", "Where they evolved and what that place demands."],
          ["Culture", "Shared habits, values, and taboos."],
          ["Relations", "How they deal with other species, and why."],
          ["Story role", "Which individuals matter, and what they want."]
        ])
      ]
    },
    {
      title: "Timeline",
      pages: [
        templatePage("Timeline", [
          ["Before the story", "The events that set the current situation up."],
          ["Recent events", "What changed in the months before chapter one."],
          ["Present day", "Where the characters stand when the story opens."],
          ["Planned future", "What the story is moving toward."]
        ])
      ]
    }
  ],
  crime: [
    { title: "Characters", pages: [CHARACTER_TEMPLATE] },
    {
      title: "Suspects",
      pages: [
        templatePage("Suspect template", [
          ["Connection", "How they know the victim or the scene."],
          ["Motive", "What they stood to gain or lose."],
          ["Opportunity", "Where they were and what they can prove."],
          ["Alibi", "Their account, and who supports it."],
          ["Secret", "The thing they are hiding that is not the crime."]
        ])
      ]
    },
    {
      title: "Crime Scenes",
      pages: [
        templatePage("Crime scene template", [
          ["Location", "Where it is and how to get in."],
          ["What happened", "The sequence of events, as far as anyone knows."],
          ["Evidence", "What was left behind, and what is missing."],
          ["Witnesses", "Who saw or heard something, and what they claim."],
          ["Questions", "What the scene does not explain."]
        ])
      ]
    },
    {
      title: "Clues",
      pages: [
        templatePage("Clue template", [
          ["What it is", "The object, trace, or statement."],
          ["Where it was found", "Place, time, and who handled it."],
          ["What it suggests", "The reading the investigator takes from it."],
          ["Red herring", "Why it might mislead, and who benefits."],
          ["Who knows", "Characters who have seen it or know it exists."]
        ])
      ]
    },
    {
      title: "Timeline of the Case",
      pages: [
        templatePage("Case timeline", [
          ["Before the crime", "The relationships and plans that led here."],
          ["The crime", "What happened, in order, with times where possible."],
          ["Investigation", "Steps taken, leads followed, and dead ends."],
          ["Breakthrough", "The discovery that changes the case."],
          ["Resolution", "How it ends, and what remains open."]
        ])
      ]
    }
  ],
  historical: [
    { title: "Characters", pages: [CHARACTER_TEMPLATE] },
    { title: "Places", pages: [PLACE_TEMPLATE] },
    {
      title: "Period Research",
      pages: [
        templatePage("Period research", [
          ["Daily life", "Housing, food, hygiene, and the shape of an ordinary day."],
          ["Work and money", "Jobs, wages, prices, and who employed whom."],
          ["Dress and manners", "What people wore and how they addressed each other."],
          ["Law and power", "Who held authority and how it was enforced."],
          ["Beliefs and rituals", "What people believed and how that shaped their choices."]
        ])
      ]
    },
    {
      title: "Events & Timeline",
      pages: [
        templatePage("Timeline", [
          ["Before the story", "The longer history a reader needs."],
          ["The story begins", "The moment the novel enters recorded events."],
          ["Turning points", "Real events the plot hangs on."],
          ["Aftermath", "What follows, and where invention takes over."]
        ])
      ]
    },
    {
      title: "Sources",
      pages: [
        templatePage("Sources", [
          ["Books", "Secondary works, with author and year."],
          ["Archives", "Documents, registers, letters, and where to find them."],
          ["Images and objects", "Paintings, photographs, maps, and museum pieces."],
          ["People to ask", "Experts, locals, and questions worth putting to them."],
          ["Reliability notes", "Where sources disagree, and which you trust."]
        ])
      ]
    }
  ],
  romance: [
    { title: "Characters", pages: [CHARACTER_TEMPLATE] },
    {
      title: "Relationships",
      pages: [
        templatePage("Relationship template", [
          ["Who they are", "The two people, and what each wants at the start."],
          ["First impression", "What they notice, misread, or assume."],
          ["Attraction", "What draws them together despite themselves."],
          ["Conflict", "The fear, loyalty, or history that keeps them apart."],
          ["Change", "What each must give up or learn for the relationship to work."]
        ])
      ]
    },
    { title: "Places", pages: [PLACE_TEMPLATE] },
    {
      title: "Beats",
      pages: [
        templatePage("Romance beats", [
          ["Meeting", "The first encounter, and why it matters."],
          ["Growing closer", "The scenes where the bond forms."],
          ["Turning point", "The moment the relationship changes direction."],
          ["Crisis", "The break, the misunderstanding, or the choice."],
          ["Resolution", "How they find their way back, and what it costs."]
        ])
      ]
    }
  ],
  nonfiction: [
    {
      title: "Chapters Outline",
      pages: [
        templatePage("Book outline", [
          ["Promise", "What the book gives the reader by the end."],
          ["Reader", "Who it is for, and what they already know."],
          ["Chapters", "One line per chapter, in order."],
          ["Evidence", "The examples, cases, or data each chapter leans on."],
          ["Takeaway", "What the reader should remember."]
        ])
      ]
    },
    {
      title: "Sources",
      pages: [
        templatePage("Sources", [
          ["Books and articles", "Full references, with the edition you used."],
          ["Interviews", "Who you spoke to, when, and how it was recorded."],
          ["Data", "Datasets, dates, and how they were collected."],
          ["Primary documents", "Letters, reports, records, and their locations."],
          ["Reliability", "Where the sources disagree, and what you chose to trust."]
        ])
      ]
    },
    {
      title: "Key Terms",
      pages: [
        templatePage("Key terms", [
          ["Term", "The word or phrase as you use it."],
          ["Plain definition", "One sentence a new reader would understand."],
          ["First use", "Where it appears first, and how it is introduced."],
          ["Related terms", "Words that are close, and how they differ."]
        ])
      ]
    },
    {
      title: "Quotes",
      pages: [
        templatePage("Quote template", [
          ["Quote", "The exact words, checked against the source."],
          ["Source", "Author, title, page, and year."],
          ["Context", "What was being discussed, and why it matters here."],
          ["Permission", "Whether reuse is allowed, and what the terms are."]
        ])
      ]
    }
  ]  ,
  thriller: [
    { title: "Characters", pages: [CHARACTER_TEMPLATE] },
    {
      title: "Antagonist",
      pages: [
        templatePage("Antagonist template", [
          ["Goal", "What do they want, and what will they do to get it?"],
          ["Method", "How do they work, and what is their signature?"],
          ["Resources", "Money, people, access, and skills they can call on."],
          ["Weak point", "What could expose or stop them?"],
          ["Cover", "How they appear to everyone else."]
        ])
      ]
    },
    { title: "Places", pages: [PLACE_TEMPLATE] },
    {
      title: "Organisations",
      pages: [
        templatePage("Organisation template", [
          ["Purpose", "What it officially does, and what it really does."],
          ["Structure", "Who gives orders, who follows them, who knows what."],
          ["Reach", "Where it operates and who it can pressure."],
          ["Secrets", "What it must keep hidden."]
        ])
      ]
    },
    {
      title: "Timeline of events",
      pages: [
        templatePage("Timeline", [
          ["Before the story", "What already happened that the characters do not know yet."],
          ["Act one", "The inciting event and the first stakes."],
          ["Act two", "Escalations, reversals, and the point of no return."],
          ["Act three", "The confrontation and its aftermath."]
        ])
      ]
    },
    {
      title: "Clues and red herrings",
      pages: [
        templatePage("Clue tracker", [
          ["Clue", "What is found, and where."],
          ["What it seems to mean", "The conclusion the reader is nudged towards."],
          ["What it really means", "The truth behind it."],
          ["Revealed in", "Chapter or scene where it pays off."]
        ])
      ]
    },
    {
      title: "Research",
      pages: [
        templatePage("Research notes", [
          ["Procedures", "How investigations, operations, or institutions really work."],
          ["Terminology", "Words and jargon to get right."],
          ["Sources", "Books, articles, and people to check facts with."]
        ])
      ]
    }
  ]
};

export type BlueprintPage = { key: string; title: string; html: string };
export type BlueprintFolder = { key: string; name: string; pages: BlueprintPage[] };
/** Editable description of the wiki a project starts with; keys are unique within one blueprint. */
export type StarterBlueprint = { folders: BlueprintFolder[] };

/** The preset as an editable blueprint with stable keys ("folder:0", "page:0.1"). */
export function starterBlueprint(id: StarterId): StarterBlueprint {
  return {
    folders: STARTER_CONTENT[id].map((folder, folderIndex) => ({
      key: `folder:${folderIndex}`,
      name: folder.title,
      pages: folder.pages.map((page, pageIndex) => ({
        key: `page:${folderIndex}.${pageIndex}`,
        title: page.title,
        html: page.content
      }))
    }))
  };
}

export function allBlueprintKeys(blueprint: StarterBlueprint): Set<string> {
  const keys = new Set<string>();
  for (const folder of blueprint.folders) {
    keys.add(folder.key);
    for (const page of folder.pages) keys.add(page.key);
  }
  return keys;
}

/** Keeps the selected pages; a folder stays when it or any of its pages is selected. */
export function filterBlueprint(blueprint: StarterBlueprint, selected: ReadonlySet<string>): StarterBlueprint {
  const folders: BlueprintFolder[] = [];
  for (const folder of blueprint.folders) {
    const pages = folder.pages.filter((page) => selected.has(page.key));
    if (pages.length > 0 || selected.has(folder.key)) folders.push({ ...folder, pages });
  }
  return { folders };
}

/**
 * Builds wiki folders and template pages from a blueprint. `createId` is
 * called once per folder and page, in a stable order, so callers can supply
 * UUIDs in the app and counters in tests.
 */
export function buildFromBlueprint(
  blueprint: StarterBlueprint,
  createId: () => string
): { folders: BinderFolder[]; documents: DocumentData[] } {
  const folders: BinderFolder[] = [];
  const documents: DocumentData[] = [];
  for (const spec of blueprint.folders) {
    const folder: BinderFolder = { id: createId(), title: spec.name, parentId: null };
    folders.push(folder);
    for (const page of spec.pages) {
      documents.push({
        id: createId(),
        title: page.title,
        content: page.html,
        space: "Wiki",
        folderId: folder.id
      });
    }
  }
  return { folders, documents };
}

export function buildStarter(
  id: StarterId,
  createId: () => string
): { folders: BinderFolder[]; documents: DocumentData[] } {
  return buildFromBlueprint(starterBlueprint(id), createId);
}

function freshKey(blueprint: StarterBlueprint, prefix: "folder" | "page"): string {
  const used = allBlueprintKeys(blueprint);
  let n = 0;
  while (used.has(`${prefix}:c${n}`)) n += 1;
  return `${prefix}:c${n}`;
}

export function addCustomFolder(blueprint: StarterBlueprint, name: string): StarterBlueprint {
  const folder: BlueprintFolder = { key: freshKey(blueprint, "folder"), name: name.trim() || "New folder", pages: [] };
  return { folders: [...blueprint.folders, folder] };
}

export function addCustomPage(blueprint: StarterBlueprint, folderKey: string, title: string, html = ""): StarterBlueprint {
  const page: BlueprintPage = { key: freshKey(blueprint, "page"), title: title.trim() || "New page", html };
  return {
    folders: blueprint.folders.map((folder) =>
      folder.key === folderKey ? { ...folder, pages: [...folder.pages, page] } : folder
    )
  };
}

export function removeCustomFolder(blueprint: StarterBlueprint, folderKey: string): StarterBlueprint {
  return { folders: blueprint.folders.filter((folder) => folder.key !== folderKey) };
}

export function removeCustomPage(blueprint: StarterBlueprint, pageKey: string): StarterBlueprint {
  return {
    folders: blueprint.folders.map((folder) => ({ ...folder, pages: folder.pages.filter((page) => page.key !== pageKey) }))
  };
}

export function renameCustomFolder(blueprint: StarterBlueprint, folderKey: string, name: string): StarterBlueprint {
  return {
    folders: blueprint.folders.map((folder) => folder.key === folderKey ? { ...folder, name: name.trim() || folder.name } : folder)
  };
}

export function renameCustomPage(blueprint: StarterBlueprint, pageKey: string, title: string): StarterBlueprint {
  return {
    folders: blueprint.folders.map((folder) => ({
      ...folder,
      pages: folder.pages.map((page) => page.key === pageKey ? { ...page, title: title.trim() || page.title } : page)
    }))
  };
}

/** A wiki template the user composed and saved. */
export type CustomStarter = { id: string; name: string; blueprint: StarterBlueprint };

export const CUSTOM_STARTERS_KEY = "prosecraft-custom-starters";
const MAX_CUSTOM_STARTERS = 20;
const MAX_CUSTOM_FOLDERS = 40;
const MAX_CUSTOM_PAGES = 200;
const MAX_NAME_LENGTH = 120;
const MAX_HTML_LENGTH = 50_000;

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_NAME_LENGTH) : fallback;
}

/** Validates stored data of unknown shape; keeps good entries, drops bad ones, regenerates keys. */
export function normalizeCustomStarters(value: unknown): CustomStarter[] {
  if (!Array.isArray(value)) return [];
  const result: CustomStarter[] = [];
  const ids = new Set<string>();
  for (const entry of value) {
    if (result.length >= MAX_CUSTOM_STARTERS) break;
    if (!entry || typeof entry !== "object") continue;
    const { id, name, blueprint } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !id || ids.has(id)) continue;
    const rawFolders = (blueprint as { folders?: unknown } | undefined)?.folders;
    if (!Array.isArray(rawFolders)) continue;
    let pageCount = 0;
    const folders: BlueprintFolder[] = [];
    for (const rawFolder of rawFolders.slice(0, MAX_CUSTOM_FOLDERS)) {
      if (!rawFolder || typeof rawFolder !== "object") continue;
      const folderIndex = folders.length;
      const rawPages = Array.isArray((rawFolder as { pages?: unknown }).pages)
        ? (rawFolder as { pages: unknown[] }).pages
        : [];
      const pages: BlueprintPage[] = [];
      for (const rawPage of rawPages) {
        if (pageCount >= MAX_CUSTOM_PAGES) break;
        if (!rawPage || typeof rawPage !== "object") continue;
        const page = rawPage as Record<string, unknown>;
        const html = typeof page.html === "string" ? sanitizeHtml(page.html.slice(0, MAX_HTML_LENGTH)) : "";
        pages.push({ key: `page:${folderIndex}.${pages.length}`, title: text(page.title, "Untitled"), html });
        pageCount += 1;
      }
      folders.push({ key: `folder:${folderIndex}`, name: text((rawFolder as { name?: unknown }).name, "Untitled"), pages });
    }
    ids.add(id);
    result.push({ id, name: text(name, "My template"), blueprint: { folders } });
  }
  return result;
}

export function loadCustomStarters(storage: Pick<Storage, "getItem">): CustomStarter[] {
  try {
    const raw = storage.getItem(CUSTOM_STARTERS_KEY);
    return raw ? normalizeCustomStarters(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveCustomStarters(storage: Pick<Storage, "setItem">, starters: CustomStarter[]): void {
  storage.setItem(CUSTOM_STARTERS_KEY, JSON.stringify(normalizeCustomStarters(starters)));
}
