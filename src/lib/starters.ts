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
  /** Module this folder stands in for, so the module toggles reflect the preset. */
  module?: string;
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
    { title: "Characters", module: "characters", pages: [CHARACTER_TEMPLATE] },
    { title: "Places", module: "places", pages: [PLACE_TEMPLATE] },
    {
      title: "Magic",
      module: "magic-and-technology",
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
      module: "cultures",
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
      module: "species",
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
      module: "timeline",
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
      module: "items",
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
    { title: "Characters", module: "characters", pages: [CHARACTER_TEMPLATE] },
    { title: "Places & Worlds", module: "places", pages: [PLACE_TEMPLATE] },
    {
      title: "Technology",
      module: "magic-and-technology",
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
      module: "organisations",
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
      module: "species",
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
      module: "timeline",
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
    { title: "Characters", module: "characters", pages: [CHARACTER_TEMPLATE] },
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
      module: "timeline",
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
    { title: "Characters", module: "characters", pages: [CHARACTER_TEMPLATE] },
    { title: "Places", module: "places", pages: [PLACE_TEMPLATE] },
    {
      title: "Period Research",
      module: "research",
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
      module: "timeline",
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
    { title: "Characters", module: "characters", pages: [CHARACTER_TEMPLATE] },
    {
      title: "Relationships",
      module: "relationships",
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
    { title: "Places", module: "places", pages: [PLACE_TEMPLATE] },
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
      module: "research",
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
      module: "encyclopedia",
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
    { title: "Characters", module: "characters", pages: [CHARACTER_TEMPLATE] },
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
    { title: "Places", module: "places", pages: [PLACE_TEMPLATE] },
    {
      title: "Organisations",
      module: "organisations",
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
      module: "timeline",
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
      module: "research",
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

/** One wiki folder of ready-made template pages a user can add to any start. */
export type StarterModule = {
  id: string;
  label: string;
  description: string;
  folder: string;
  pages: { title: string; html: string }[];
};

function modulePage(page: TemplatePage): { title: string; html: string } {
  return { title: page.title, html: page.content };
}

export const STARTER_MODULES: StarterModule[] = [
  {
    id: "characters",
    label: "Characters",
    description: "People of the story, with one guided sheet per character.",
    folder: "Characters",
    pages: [modulePage(CHARACTER_TEMPLATE)]
  },
  {
    id: "places",
    label: "Places",
    description: "Locations, from a single room to a whole world.",
    folder: "Places",
    pages: [modulePage(PLACE_TEMPLATE)]
  },
  {
    id: "items",
    label: "Items",
    description: "Objects, artefacts, and weapons that matter to the plot.",
    folder: "Items",
    pages: [
      modulePage(templatePage("Item template", [
        ["Description", "What it is, what it looks like, and what it is made of."],
        ["Origin", "Who made it, when, and for what purpose."],
        ["Powers", "What it does, and what it refuses to do."],
        ["Cost", "What using it takes from the bearer."],
        ["Where it is now", "Who holds it at the start of the story."]
      ])),
      modulePage(templatePage("Weapon notes", [
        ["Make", "Materials, balance, and how it is held."],
        ["Carrier", "Who carries it, and what carrying it says about them."],
        ["In a fight", "Reach, speed, and what it can and cannot cut through."],
        ["Upkeep", "How it is cleaned, repaired, and replaced."],
        ["Reputation", "What owning it means to other people."]
      ]))
    ]
  },
  {
    id: "species",
    label: "Species",
    description: "Creatures and peoples, from biology to their place in the story.",
    folder: "Species",
    pages: [
      modulePage(templatePage("Species template", [
        ["Biology", "Body, senses, lifespan, and what they need to survive."],
        ["Origins", "Where they come from and how far they have spread."],
        ["Society", "How they organise families, work, and decisions."],
        ["Relations", "How they treat other species, and what they expect back."],
        ["Story role", "Which individuals matter, and what they want."]
      ])),
      modulePage(templatePage("Creature template", [
        ["Appearance", "Size, shape, and the first detail a traveller would notice."],
        ["Habitat", "Where it lives, and what it eats there."],
        ["Behaviour", "What it does when undisturbed, hungry, or cornered."],
        ["Dangers", "How it hurts people, and what keeps people safe."],
        ["Story role", "What it means to the plot beyond being dangerous."]
      ]))
    ]
  },
  {
    id: "cultures",
    label: "Cultures",
    description: "Values, customs, and the friction between neighbouring peoples.",
    folder: "Cultures",
    pages: [
      modulePage(templatePage("Culture template", [
        ["Values", "What this culture prizes, and what it punishes."],
        ["Customs", "Greetings, meals, hospitality, and everyday manners."],
        ["Dress and status", "What people wear, and how rank shows."],
        ["Power", "Who leads, who follows, and how disputes are settled."],
        ["Friction", "What this culture disagrees with its neighbours about."]
      ])),
      modulePage(templatePage("Customs checklist", [
        ["Rites of passage", "Birth, adulthood, marriage, and death."],
        ["Food and drink", "What is eaten daily, and what is saved for guests."],
        ["Music and stories", "What people sing, tell, and teach their children."],
        ["Gifts and debts", "What is owed, and how a favour is repaid."],
        ["Taboos", "What is never said or done, and what happens if it is."]
      ]))
    ]
  },
  {
    id: "religions",
    label: "Religions",
    description: "Beliefs, rituals, and the powers people pray to.",
    folder: "Religions",
    pages: [
      modulePage(templatePage("Religion template", [
        ["Beliefs", "What is true about the world, according to this faith."],
        ["Pantheon", "Which gods, spirits, or forces are worshipped, and what each governs."],
        ["Rituals", "What believers do daily, weekly, and at the turning points of life."],
        ["Institutions", "Who leads the faith, and how they keep it."],
        ["Doubt", "What believers argue about, and who loses faith."]
      ])),
      modulePage(templatePage("Holidays and rites", [
        ["High holy days", "Which days stop work, and what happens on them."],
        ["Rites of passage", "Who leads each rite, and what the community owes."],
        ["Offerings", "What is given, to whom, and what the giver expects."],
        ["Forbidden acts", "What is taboo, and how it is punished."],
        ["Signs and omens", "How believers read luck, disaster, and the will of the divine."]
      ]))
    ]
  },
  {
    id: "languages",
    label: "Languages",
    description: "Naming conventions, phrases, and the way people speak.",
    folder: "Languages",
    pages: [
      modulePage(templatePage("Language notes", [
        ["Sounds", "Which sounds it uses, and which it avoids."],
        ["Grammar", "Word order, endings, and the one rule that shapes sentences."],
        ["Loanwords", "What it borrowed from neighbours, and what it gave them."],
        ["Registers", "How people speak to elders, strangers, and children."],
        ["Script", "Whether it is written, and what the writing looks like."]
      ])),
      modulePage(templatePage("Naming conventions", [
        ["Given names", "What parents choose, and what the name is meant to bring."],
        ["Family names", "How lineage shows in a name, and who may change it."],
        ["Titles", "What titles exist, and when a stranger must use one."],
        ["Naming taboos", "Names that are avoided, and why."],
        ["Place names", "What endings and roots mark a place as belonging here."]
      ])),
      modulePage(templatePage("Phrases", [
        ["Greetings", "Hello, farewell, and the polite way to interrupt."],
        ["Common phrases", "The words a traveller learns first."],
        ["Oaths and insults", "What people swear by, and what starts a fight."],
        ["Untranslatable", "A word with no honest equivalent, and what it means."],
        ["Gestures", "What the hands and eyes say that words do not."]
      ]))
    ]
  },
  {
    id: "magic-and-technology",
    label: "Magic & technology",
    description: "How power works: rules, costs, and hard limits.",
    folder: "Magic & Technology",
    pages: [
      modulePage(templatePage("Magic system", [
        ["Source", "Where magic comes from, and who can reach it."],
        ["Rules", "What it can do, and what it can never do."],
        ["Cost", "What every use takes from the caster, and what a late payment looks like."],
        ["Limits", "The hard edges: range, duration, materials, or numbers."],
        ["Practitioners", "Who uses magic, how they learn it, and how it shows up in ordinary work."],
        ["Failure", "What happens when magic fails, spreads, or is misused."]
      ])),
      modulePage(templatePage("Technology template", [
        ["What it does", "The job it performs in daily life."],
        ["How it works", "The principle in one or two sentences."],
        ["Limits", "Range, cost, failure modes, and who can repair it."],
        ["Control", "Who owns it, licenses it, or restricts it."],
        ["Consequences", "What it changed, and what it broke."]
      ]))
    ]
  },
  {
    id: "organisations",
    label: "Organisations",
    description: "Factions, governments, and guilds with goals and secrets.",
    folder: "Organisations",
    pages: [
      modulePage(templatePage("Organisation template", [
        ["Purpose", "What it officially does, and what it really does."],
        ["Structure", "Who gives orders, who follows them, and who knows what."],
        ["Reach", "Where it operates, and who it can pressure."],
        ["Resources", "Money, people, access, and favours it can call on."],
        ["Secrets", "What it must keep hidden."],
        ["Weakness", "What could split it or bring it down."]
      ])),
      modulePage(templatePage("Power and politics", [
        ["Who holds power", "The offices, families, or councils that decide things."],
        ["How power is taken", "Election, inheritance, purchase, or force."],
        ["Alliances", "Who it needs, and what it trades away to keep them."],
        ["Rivals", "Who wants what it has, and how far they will go."],
        ["Public face", "How it presents itself to people outside."]
      ]))
    ]
  },
  {
    id: "maps",
    label: "Maps & travel",
    description: "Map notes: regions, routes, distances, and travel times.",
    folder: "Maps",
    pages: [
      modulePage(templatePage("Map notes", [
        ["Regions", "The large areas, and what separates them."],
        ["Borders", "Rivers, ridges, walls, and the places people cross."],
        ["Landmarks", "What a traveller uses to find the way."],
        ["Unmapped", "What nobody has surveyed, and why."],
        ["Map sources", "Who drew the map, and what they got wrong."]
      ])),
      modulePage(templatePage("Routes and travel times", [
        ["Routes", "The roads, passes, and sea lanes people actually use."],
        ["Distances", "How far each leg is, in the units people here use."],
        ["Travel times", "How long it takes on foot, on horseback, or by ship."],
        ["Season and weather", "Which routes close, and when."],
        ["Dangers", "Bandits, tolls, wild country, and forced detours."]
      ]))
    ]
  },
  {
    id: "calendar",
    label: "Calendar & holidays",
    description: "Months, seasons, eras, and the dates that shape the year.",
    folder: "Calendar",
    pages: [
      modulePage(templatePage("Calendar", [
        ["Months", "Names, lengths, and what each month is known for."],
        ["Seasons", "When they turn, and how people mark the change."],
        ["Eras", "How years are counted, and from which event."],
        ["Week and rest days", "How the working week is divided."],
        ["Keeping time", "Clocks, bells, and how ordinary people know the hour."]
      ])),
      modulePage(templatePage("Holidays and dates", [
        ["Holidays", "What is celebrated, when, and by whom."],
        ["Founding dates", "Events a whole nation remembers."],
        ["Mourning days", "What is marked in silence or grief."],
        ["Local festivals", "Small celebrations that differ from town to town."],
        ["Dates the plot needs", "Deadlines, anniversaries, and the day something must happen."]
      ]))
    ]
  },
  {
    id: "timeline",
    label: "Timeline",
    description: "Events by era, from deep history to the opening scene.",
    folder: "Timeline",
    pages: [
      modulePage(templatePage("Timeline by era", [
        ["Deep past", "The old events everyone still refers to."],
        ["Founding era", "How the current order began, and who paid for it."],
        ["Recent decades", "What changed in the last few years, and why."],
        ["Present day", "Where things stand when the story opens."],
        ["Planned future", "What the story is moving toward."]
      ])),
      modulePage(templatePage("Dated events", [
        ["Event", "What happened, in one line."],
        ["Date", "When, in the calendar people use."],
        ["Cause", "What made it happen."],
        ["Consequence", "What changed afterwards, and who paid for it."],
        ["Who remembers", "Which characters know it, and how they tell it."]
      ]))
    ]
  },
  {
    id: "relationships",
    label: "Relationships",
    description: "Who knows whom, how they feel, and what goes unsaid.",
    folder: "Relationships",
    pages: [
      modulePage(templatePage("Relationship web", [
        ["Who and to whom", "Two people, and how they are connected."],
        ["Type", "Family, ally, rival, lover, employer, or something harder to name."],
        ["History", "What happened between them that still counts."],
        ["Tension", "What they want from each other that they cannot say."],
        ["Change", "How the relationship shifts over the story."]
      ])),
      modulePage(templatePage("Relationship template", [
        ["First meeting", "Where they met, and what each made of the other."],
        ["What each wants", "The need behind the way they treat each other."],
        ["Trust", "What it would take to earn it, and what would break it."],
        ["Conflict", "What they fight about, and what the fight is really about."],
        ["Turning point", "The scene where the relationship changes direction."]
      ]))
    ]
  },
  {
    id: "encyclopedia",
    label: "Encyclopedia",
    description: "Lore entries and a glossary of invented terms.",
    folder: "Encyclopedia",
    pages: [
      modulePage(templatePage("Lore entry", [
        ["Term", "The name readers will meet."],
        ["Definition", "What it means in one sentence."],
        ["Origin", "Where the word or idea came from."],
        ["First mention", "Where the story explains it, and how much is assumed."],
        ["Related entries", "What else to read alongside this."]
      ])),
      modulePage(templatePage("Glossary", [
        ["Terms", "Every invented word that needs a definition."],
        ["Spelling", "How each term is spelled, and the variants to avoid."],
        ["Capitalisation", "Which words are names, and which are common nouns."],
        ["In-world source", "Who in the world would define it this way."],
        ["Reader confusion", "Terms too close to each other, and how to tell them apart."]
      ]))
    ]
  },
  {
    id: "plot",
    label: "Plot & structure",
    description: "Premise, act structure, subplots, and open threads.",
    folder: "Plot",
    pages: [
      modulePage(templatePage("Premise", [
        ["One line", "The story in a sentence, without names."],
        ["Situation", "What is wrong with the world when the story opens."],
        ["Protagonist wants", "What they pursue, and why now."],
        ["Obstacle", "What stands in the way, and why it cannot be avoided."],
        ["Stakes", "What is lost if they fail."]
      ])),
      modulePage(templatePage("Act structure", [
        ["Act one", "The setup, the inciting event, and the door closing behind them."],
        ["Act two", "Escalations, reversals, and the point of no return."],
        ["Midpoint", "The discovery that changes what the story is about."],
        ["Act three", "The confrontation, and what it costs."],
        ["Ending", "What the last page leaves the reader with."]
      ])),
      modulePage(templatePage("Subplots and threads", [
        ["Subplots", "Each secondary story, and how it touches the main one."],
        ["Open threads", "Questions raised and still waiting for an answer."],
        ["Callbacks", "Details planted early that pay off late."],
        ["Foreshadowing", "What the reader should suspect before the character does."],
        ["Cut", "Ideas you dropped, and where they went."]
      ]))
    ]
  },
  {
    id: "research",
    label: "Research",
    description: "Sources, facts, and the things you still have to check.",
    folder: "Research",
    pages: [
      modulePage(templatePage("Sources", [
        ["Books", "Secondary works, with author and year."],
        ["Articles and archives", "Documents, registers, letters, and where to find them."],
        ["People to ask", "Experts, locals, and the questions worth putting to them."],
        ["Sites and objects", "Places to visit, and museum pieces worth seeing."],
        ["Reliability", "Where sources disagree, and which you trust."]
      ])),
      modulePage(templatePage("Facts to verify", [
        ["Claim", "The fact the story depends on."],
        ["Where found", "Where you found it, with page or link."],
        ["Confidence", "How sure you are, and what would raise it."],
        ["Where it appears", "The scene or chapter that uses it."],
        ["Check by", "When to settle it, and who can help."]
      ]))
    ]
  }
];

export type BlueprintPage = { key: string; title: string; html: string };
export type BlueprintFolder = { key: string; name: string; pages: BlueprintPage[] };
/** Editable description of the wiki a project starts with; keys are unique within one blueprint. */
export type StarterBlueprint = { folders: BlueprintFolder[] };

/** The preset as an editable blueprint.
 *
 * Folders that stand in for a world-building module keep the preset's own
 * name and pages but use the module's key, so the module toggles reflect the
 * template: toggling one off removes that folder, and toggling it on cannot
 * append a duplicate. Unknown module names fall back to preset keys. */
export function starterBlueprint(id: StarterId): StarterBlueprint {
  return {
    folders: STARTER_CONTENT[id].map((folder, folderIndex) => {
      const moduleId = folder.module && STARTER_MODULES.some((module) => module.id === folder.module)
        ? folder.module
        : null;
      const folderKey = moduleId ? moduleFolderKey(moduleId) : `folder:${folderIndex}`;
      return {
        key: folderKey,
        name: folder.title,
        pages: folder.pages.map((page, pageIndex) => ({
          key: moduleId ? `${folderKey}/${pageIndex}` : `page:${folderIndex}.${pageIndex}`,
          title: page.title,
          html: page.content
        }))
      };
    })
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

const MODULE_KEY_PREFIX = "module:";

/** Key of the blueprint folder a module contributes. */
export function moduleFolderKey(id: string): string {
  return `${MODULE_KEY_PREFIX}${id}`;
}

export function blueprintHasModule(blueprint: StarterBlueprint, id: string): boolean {
  return blueprint.folders.some((folder) => folder.key === moduleFolderKey(id));
}

/** Appends the module's folder with its template pages; no-op when present or unknown. */
export function addModule(blueprint: StarterBlueprint, id: string): StarterBlueprint {
  const module = STARTER_MODULES.find((entry) => entry.id === id);
  if (!module || blueprintHasModule(blueprint, id)) return blueprint;
  const key = moduleFolderKey(module.id);
  const folder: BlueprintFolder = {
    key,
    name: module.folder,
    pages: module.pages.map((page, index) => ({ key: `${key}/${index}`, title: page.title, html: page.html }))
  };
  return { folders: [...blueprint.folders, folder] };
}

export function removeModule(blueprint: StarterBlueprint, id: string): StarterBlueprint {
  const key = moduleFolderKey(id);
  return { folders: blueprint.folders.filter((folder) => folder.key !== key) };
}

/** Ids of the known modules present in the blueprint, in folder order. */
export function modulesOf(blueprint: StarterBlueprint): string[] {
  return blueprint.folders
    .map((folder) => folder.key)
    .filter((key) => key.startsWith(MODULE_KEY_PREFIX))
    .map((key) => key.slice(MODULE_KEY_PREFIX.length))
    .filter((id) => STARTER_MODULES.some((module) => module.id === id));
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

/** The module id in a stored folder key, when it still names a known module. */
function storedModuleId(key: unknown): string | null {
  if (typeof key !== "string" || !key.startsWith(MODULE_KEY_PREFIX)) return null;
  const id = key.slice(MODULE_KEY_PREFIX.length);
  return STARTER_MODULES.some((module) => module.id === id) ? id : null;
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
      /* Module folders keep their key, so a saved template still reads as the same module. */
      const moduleId = storedModuleId((rawFolder as { key?: unknown }).key);
      const moduleKey = moduleId && !folders.some((folder) => folder.key === moduleFolderKey(moduleId))
        ? moduleFolderKey(moduleId)
        : null;
      const rawPages = Array.isArray((rawFolder as { pages?: unknown }).pages)
        ? (rawFolder as { pages: unknown[] }).pages
        : [];
      const pages: BlueprintPage[] = [];
      for (const rawPage of rawPages) {
        if (pageCount >= MAX_CUSTOM_PAGES) break;
        if (!rawPage || typeof rawPage !== "object") continue;
        const page = rawPage as Record<string, unknown>;
        const html = typeof page.html === "string" ? sanitizeHtml(page.html.slice(0, MAX_HTML_LENGTH)) : "";
        const key = moduleKey ? `${moduleKey}/${pages.length}` : `page:${folderIndex}.${pages.length}`;
        pages.push({ key, title: text(page.title, "Untitled"), html });
        pageCount += 1;
      }
      folders.push({ key: moduleKey ?? `folder:${folderIndex}`, name: text((rawFolder as { name?: unknown }).name, "Untitled"), pages });
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
