/**
 * Declarative citation style metadata, locale terms, and formatting templates
 * for the eight built-in styles.
 *
 * All templates are authored directly in TypeScript from standard style-guide
 * conventions without external CSL XML or runtime engines.
 */

export type CitationStyleId =
  | "apa7"
  | "chicago-author-date"
  | "chicago-notes"
  | "mla9"
  | "harvard"
  | "ieee"
  | "vancouver"
  | "din1505";

export type CitationStyleKind = "author-date" | "numeric" | "note";

export type CitationLocale = "en" | "de";

export type CitationStyleMeta = {
  id: CitationStyleId;
  label: string;
  kind: CitationStyleKind;
};

export const STYLES: readonly CitationStyleMeta[] = [
  { id: "apa7", label: "APA 7th Edition", kind: "author-date" },
  { id: "chicago-author-date", label: "Chicago (Author-Date)", kind: "author-date" },
  { id: "chicago-notes", label: "Chicago (Notes & Bibliography)", kind: "note" },
  { id: "mla9", label: "MLA 9th Edition", kind: "author-date" },
  { id: "harvard", label: "Harvard", kind: "author-date" },
  { id: "ieee", label: "IEEE", kind: "numeric" },
  { id: "vancouver", label: "Vancouver", kind: "numeric" },
  { id: "din1505", label: "DIN 1505-2", kind: "author-date" }
] as const;

export type NameFormatMode =
  | "family-given"
  | "given-family"
  | "family-initials-dots"
  | "initials-family"
  | "family-initials-compact";

export type InTextMode = "author-year" | "author-page" | "numeric" | "note";

export type InTextTemplate = {
  mode: InTextMode;
  openDelimiter: string;
  closeDelimiter: string;
  itemSeparator: string;
  authorYearSeparator: string;
  locatorPrefix: string;
  omitPageLabel: boolean;
  etAlThreshold: number;
  useAmpersand: boolean;
  italicizeStandaloneTitle: boolean;
  disambiguateYear: boolean;
};

export type BibliographyNameTemplate = {
  firstAuthor: NameFormatMode;
  otherAuthors: NameFormatMode;
  separator: string;
  lastSeparator: "ampersand" | "and" | "comma" | "semicolon";
  oxfordComma: boolean;
  etAlThreshold: number;
  etAlKeep: number;
  /** When true (APA 7 for 21+ authors), insert ", ... " before the final author. */
  etAlEllipsisBeforeLast?: boolean;
  /** Whether to insert a comma before "et al." in bibliography author lists. */
  commaBeforeEtAl?: boolean;
  editorFormat: NameFormatMode;
  primaryEditorSuffix: "paren-cap" | "paren-lower" | "comma-ed" | "comma-editor";
  containerEditorMode:
    | "initials-ed-paren"
    | "edited-by"
    | "ed-abbrev"
    | "family-initials-ed-paren"
    | "initials-ed-cap"
    | "compact-editor"
    | "family-given-hrsg-paren";
};

export type BibEntryLayout =
  | "apa"
  | "chicago-ad"
  | "chicago-nb"
  | "mla"
  | "harvard"
  | "ieee"
  | "vancouver"
  | "din1505";

export type BibliographyTemplate = {
  sort: "author" | "citation-order";
  numberPrefix: "none" | "bracket" | "dot";
  names: BibliographyNameTemplate;
  layout: BibEntryLayout;
};

export type StyleTemplate = {
  meta: CitationStyleMeta;
  inText: InTextTemplate;
  bibliography: BibliographyTemplate;
};

export type LocaleTerms = {
  and: string;
  etAl: string;
  noDate: string;
  pageSingle: string;
  pagePlural: string;
  chapter: string;
  section: string;
  inWord: string;
  editionSuffix: string;
  editionSuffixHarvard: string;
  volumeWord: string;
  volumeCap: string;
  issueWord: string;
  issueCap: string;
  editorParenSingular: string;
  editorParenPlural: string;
  editorParenLowerSingular: string;
  editorParenLowerPlural: string;
  editorAbbrevSingular: string;
  editorAbbrevPlural: string;
  editorFullSingular: string;
  editorFullPlural: string;
  editedBy: string;
  noteEdAbbrev: string;
  availableAt: string;
  availableFrom: string;
  onlineAvailable: string;
  thesisPhd: string;
  thesisPhdShort: string;
  thesisPhdHarvard: string;
  thesisPhdIeee: string;
  thesisVancouver: string;
  thesisDin: string;
  reportWord: string;
  quotePunctuationInside: boolean;
};

export const LOCALE_TERMS: Record<CitationLocale, LocaleTerms> = {
  en: {
    and: "and",
    etAl: "et al.",
    noDate: "n.d.",
    pageSingle: "p.",
    pagePlural: "pp.",
    chapter: "ch.",
    section: "sec.",
    inWord: "In",
    editionSuffix: "ed.",
    editionSuffixHarvard: "edn.",
    volumeWord: "vol.",
    volumeCap: "Vol.",
    issueWord: "no.",
    issueCap: "No.",
    editorParenSingular: "(Ed.)",
    editorParenPlural: "(Eds.)",
    editorParenLowerSingular: "(ed.)",
    editorParenLowerPlural: "(eds.)",
    editorAbbrevSingular: "ed.",
    editorAbbrevPlural: "eds.",
    editorFullSingular: "editor",
    editorFullPlural: "editors",
    editedBy: "edited by",
    noteEdAbbrev: "ed.",
    availableAt: "Available at:",
    availableFrom: "Available from:",
    onlineAvailable: "[Online]. Available:",
    thesisPhd: "Doctoral dissertation",
    thesisPhdShort: "PhD diss.",
    thesisPhdHarvard: "PhD thesis",
    thesisPhdIeee: "Ph.D. dissertation",
    thesisVancouver: "[dissertation]",
    thesisDin: "Diss.",
    reportWord: "Report",
    quotePunctuationInside: true
  },
  de: {
    and: "und",
    etAl: "et al.",
    noDate: "o. J.",
    pageSingle: "S.",
    pagePlural: "S.",
    chapter: "Kap.",
    section: "Abschn.",
    inWord: "In",
    editionSuffix: "Aufl.",
    editionSuffixHarvard: "Aufl.",
    volumeWord: "Bd.",
    volumeCap: "Bd.",
    issueWord: "Nr.",
    issueCap: "Nr.",
    editorParenSingular: "(Hrsg.)",
    editorParenPlural: "(Hrsg.)",
    editorParenLowerSingular: "(Hrsg.)",
    editorParenLowerPlural: "(Hrsg.)",
    editorAbbrevSingular: "Hrsg.",
    editorAbbrevPlural: "Hrsg.",
    editorFullSingular: "Hrsg.",
    editorFullPlural: "Hrsg.",
    editedBy: "herausgegeben von",
    noteEdAbbrev: "hg. von",
    availableAt: "Verfügbar unter:",
    availableFrom: "Verfügbar unter:",
    onlineAvailable: "[Online]. Verfügbar unter:",
    thesisPhd: "Dissertation",
    thesisPhdShort: "Diss.",
    thesisPhdHarvard: "Dissertation",
    thesisPhdIeee: "Dissertation",
    thesisVancouver: "[Dissertation]",
    thesisDin: "Diss.",
    reportWord: "Bericht",
    quotePunctuationInside: false
  }
};

function metaOf(id: CitationStyleId): CitationStyleMeta {
  const found = STYLES.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`Unknown citation style: ${id}`);
  }
  return found;
}

export const STYLE_TEMPLATES: Record<CitationStyleId, StyleTemplate> = {
  apa7: {
    meta: metaOf("apa7"),
    inText: {
      mode: "author-year",
      openDelimiter: "(",
      closeDelimiter: ")",
      itemSeparator: "; ",
      authorYearSeparator: ", ",
      locatorPrefix: ", ",
      omitPageLabel: false,
      etAlThreshold: 3,
      useAmpersand: true,
      italicizeStandaloneTitle: true,
      disambiguateYear: true
    },
    bibliography: {
      sort: "author",
      numberPrefix: "none",
      names: {
        firstAuthor: "family-initials-dots",
        otherAuthors: "family-initials-dots",
        separator: ", ",
        lastSeparator: "ampersand",
        oxfordComma: true,
        etAlThreshold: 21,
        etAlKeep: 19,
        etAlEllipsisBeforeLast: true,
        editorFormat: "initials-family",
        primaryEditorSuffix: "paren-cap",
        containerEditorMode: "initials-ed-paren"
      },
      layout: "apa"
    }
  },

  "chicago-author-date": {
    meta: metaOf("chicago-author-date"),
    inText: {
      mode: "author-year",
      openDelimiter: "(",
      closeDelimiter: ")",
      itemSeparator: "; ",
      authorYearSeparator: " ",
      locatorPrefix: ", ",
      omitPageLabel: true,
      etAlThreshold: 4,
      useAmpersand: false,
      italicizeStandaloneTitle: true,
      disambiguateYear: true
    },
    bibliography: {
      sort: "author",
      numberPrefix: "none",
      names: {
        firstAuthor: "family-given",
        otherAuthors: "given-family",
        separator: ", ",
        lastSeparator: "and",
        oxfordComma: true,
        etAlThreshold: 11,
        etAlKeep: 7,
        commaBeforeEtAl: true,
        editorFormat: "given-family",
        primaryEditorSuffix: "comma-ed",
        containerEditorMode: "edited-by"
      },
      layout: "chicago-ad"
    }
  },

  "chicago-notes": {
    meta: metaOf("chicago-notes"),
    inText: {
      mode: "note",
      openDelimiter: "",
      closeDelimiter: ".",
      itemSeparator: "; ",
      authorYearSeparator: " ",
      locatorPrefix: ", ",
      omitPageLabel: true,
      etAlThreshold: 4,
      useAmpersand: false,
      italicizeStandaloneTitle: true,
      disambiguateYear: false
    },
    bibliography: {
      sort: "author",
      numberPrefix: "none",
      names: {
        firstAuthor: "family-given",
        otherAuthors: "given-family",
        separator: ", ",
        lastSeparator: "and",
        oxfordComma: true,
        etAlThreshold: 11,
        etAlKeep: 7,
        commaBeforeEtAl: true,
        editorFormat: "given-family",
        primaryEditorSuffix: "comma-ed",
        containerEditorMode: "edited-by"
      },
      layout: "chicago-nb"
    }
  },

  mla9: {
    meta: metaOf("mla9"),
    inText: {
      mode: "author-page",
      openDelimiter: "(",
      closeDelimiter: ")",
      itemSeparator: "; ",
      authorYearSeparator: " ",
      locatorPrefix: " ",
      omitPageLabel: true,
      etAlThreshold: 3,
      useAmpersand: false,
      italicizeStandaloneTitle: true,
      disambiguateYear: false
    },
    bibliography: {
      sort: "author",
      numberPrefix: "none",
      names: {
        firstAuthor: "family-given",
        otherAuthors: "given-family",
        separator: ", ",
        lastSeparator: "and",
        oxfordComma: true,
        etAlThreshold: 3,
        etAlKeep: 1,
        commaBeforeEtAl: true,
        editorFormat: "given-family",
        primaryEditorSuffix: "comma-editor",
        containerEditorMode: "edited-by"
      },
      layout: "mla"
    }
  },

  harvard: {
    meta: metaOf("harvard"),
    inText: {
      mode: "author-year",
      openDelimiter: "(",
      closeDelimiter: ")",
      itemSeparator: "; ",
      authorYearSeparator: ", ",
      locatorPrefix: ", ",
      omitPageLabel: false,
      etAlThreshold: 4,
      useAmpersand: false,
      italicizeStandaloneTitle: true,
      disambiguateYear: true
    },
    bibliography: {
      sort: "author",
      numberPrefix: "none",
      names: {
        firstAuthor: "family-initials-dots",
        otherAuthors: "family-initials-dots",
        separator: ", ",
        lastSeparator: "and",
        oxfordComma: false,
        etAlThreshold: 4,
        etAlKeep: 1,
        editorFormat: "family-initials-dots",
        primaryEditorSuffix: "paren-lower",
        containerEditorMode: "family-initials-ed-paren"
      },
      layout: "harvard"
    }
  },

  ieee: {
    meta: metaOf("ieee"),
    inText: {
      mode: "numeric",
      openDelimiter: "[",
      closeDelimiter: "]",
      itemSeparator: "], [",
      authorYearSeparator: " ",
      locatorPrefix: ", ",
      omitPageLabel: false,
      etAlThreshold: 7,
      useAmpersand: false,
      italicizeStandaloneTitle: true,
      disambiguateYear: false
    },
    bibliography: {
      sort: "citation-order",
      numberPrefix: "bracket",
      names: {
        firstAuthor: "initials-family",
        otherAuthors: "initials-family",
        separator: ", ",
        lastSeparator: "and",
        oxfordComma: true,
        etAlThreshold: 7,
        etAlKeep: 1,
        editorFormat: "initials-family",
        primaryEditorSuffix: "comma-ed",
        containerEditorMode: "initials-ed-cap"
      },
      layout: "ieee"
    }
  },

  vancouver: {
    meta: metaOf("vancouver"),
    inText: {
      mode: "numeric",
      openDelimiter: "(",
      closeDelimiter: ")",
      itemSeparator: ", ",
      authorYearSeparator: " ",
      locatorPrefix: ", ",
      omitPageLabel: false,
      etAlThreshold: 7,
      useAmpersand: false,
      italicizeStandaloneTitle: false,
      disambiguateYear: false
    },
    bibliography: {
      sort: "citation-order",
      numberPrefix: "dot",
      names: {
        firstAuthor: "family-initials-compact",
        otherAuthors: "family-initials-compact",
        separator: ", ",
        lastSeparator: "comma",
        oxfordComma: false,
        etAlThreshold: 7,
        etAlKeep: 6,
        commaBeforeEtAl: true,
        editorFormat: "family-initials-compact",
        primaryEditorSuffix: "comma-editor",
        containerEditorMode: "compact-editor"
      },
      layout: "vancouver"
    }
  },

  /**
   * DIN 1505-2 (author-date bibliography style):
   * Uses semicolon-separated "Family, Given" authors followed by a colon,
   * "Place : Publisher, Year" with spaces around the colon, and German/English
   * locale labels ("Bd.", "Nr.", "S.", "Hrsg.", "Aufl.", "o. J.").
   * Note: DIN 1505-2 allows several minor variants in practice (e.g. all-caps
   * surnames or listing up to 3 authors before "et al."); here we use
   * normal-case surnames and "et al." at 4+ authors.
   */
  din1505: {
    meta: metaOf("din1505"),
    inText: {
      mode: "author-year",
      openDelimiter: "(",
      closeDelimiter: ")",
      itemSeparator: "; ",
      authorYearSeparator: " ",
      locatorPrefix: ", ",
      omitPageLabel: false,
      etAlThreshold: 3,
      useAmpersand: false,
      italicizeStandaloneTitle: true,
      disambiguateYear: true
    },
    bibliography: {
      sort: "author",
      numberPrefix: "none",
      names: {
        firstAuthor: "family-given",
        otherAuthors: "family-given",
        separator: " ; ",
        lastSeparator: "semicolon",
        oxfordComma: false,
        etAlThreshold: 4,
        etAlKeep: 1,
        editorFormat: "family-given",
        primaryEditorSuffix: "paren-cap",
        containerEditorMode: "family-given-hrsg-paren"
      },
      layout: "din1505"
    }
  }
};

const VALID_STYLE_IDS = new Set<string>(STYLES.map((style) => style.id));

/** Type guard checking whether a string is one of the 8 built-in `CitationStyleId`s. */
export function isValidStyleId(value: string): value is CitationStyleId {
  return VALID_STYLE_IDS.has(value);
}

/** Returns metadata (`id`, `label`, `kind`) for a built-in citation style. */
export function getStyleMeta(style: CitationStyleId): CitationStyleMeta {
  return STYLE_TEMPLATES[style].meta;
}

/** Returns the full declarative template for a built-in citation style. */
export function getStyleTemplate(style: CitationStyleId): StyleTemplate {
  return STYLE_TEMPLATES[style];
}
