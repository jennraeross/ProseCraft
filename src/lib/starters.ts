import { CHARACTER_SECTIONS, PLACE_SECTIONS, sheetToHtml, type SheetSection } from "./publish/sheets";
import type { BinderFolder, DocumentData } from "./publish/types";

export type StarterId =
  | "blank"
  | "fantasy"
  | "scifi"
  | "crime"
  | "historical"
  | "romance"
  | "nonfiction";

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
  { id: "nonfiction", label: "Non-fiction", description: "A chapter outline, sources, key terms, and quotes." }
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
  ]
};

/**
 * Builds the wiki folders and template pages for a starter. `createId` is
 * called once per folder and page, in a stable order, so callers can supply
 * UUIDs in the app and counters in tests.
 */
export function buildStarter(
  id: StarterId,
  createId: () => string
): { folders: BinderFolder[]; documents: DocumentData[] } {
  const folders: BinderFolder[] = [];
  const documents: DocumentData[] = [];
  for (const spec of STARTER_CONTENT[id]) {
    const folder: BinderFolder = { id: createId(), title: spec.title, parentId: null };
    folders.push(folder);
    for (const page of spec.pages) {
      documents.push({
        id: createId(),
        title: page.title,
        content: page.content,
        space: "Wiki",
        folderId: folder.id
      });
    }
  }
  return { folders, documents };
}
