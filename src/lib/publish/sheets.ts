/**
 * Field definitions for the structured character and place profiles that
 * earlier ProseCraft versions stored on documents. They are kept here so the
 * one-time Wiki migration can turn those profiles into readable page content.
 */

export type SheetField = {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
};

export type SheetSection = {
  title: string;
  fields: SheetField[];
};

export const CHARACTER_SECTIONS: SheetSection[] = [
  {
    title: "Basics",
    fields: [
      { key: "role", label: "Role", placeholder: "Protagonist, antagonist, supporting…" },
      { key: "age", label: "Age", placeholder: "e.g. 34, or early 40s" },
      { key: "gender", label: "Gender", placeholder: "e.g. woman, man, non-binary" },
      { key: "pronouns", label: "Pronouns", placeholder: "she/her, they/them…" },
      { key: "ethnicity", label: "Ethnicity / heritage", placeholder: "e.g. Irish-American" },
      { key: "occupation", label: "Occupation", placeholder: "What do they do?" }
    ]
  },
  {
    title: "Appearance & voice",
    fields: [
      { key: "appearance", label: "Appearance", placeholder: "Build, features, clothing, distinguishing marks…", multiline: true },
      { key: "voice", label: "Voice & mannerisms", placeholder: "How they speak and carry themselves…", multiline: true }
    ]
  },
  {
    title: "Personality & background",
    fields: [
      { key: "personality", label: "Personality", placeholder: "Temperament, habits, the way they treat people…", multiline: true },
      { key: "background", label: "Background", placeholder: "Where they come from and what shaped them…", multiline: true },
      { key: "motivations", label: "Motivations & goals", placeholder: "What do they want, and why now?", multiline: true },
      { key: "flaws", label: "Flaws & fears", placeholder: "What holds them back or trips them up?", multiline: true }
    ]
  },
  {
    title: "Life & relationships",
    fields: [
      { key: "hobbies", label: "Hobbies & interests", placeholder: "What do they love doing off the page?", multiline: true },
      { key: "relationships", label: "Relationships", placeholder: "Family, friends, rivals, and entanglements…", multiline: true }
    ]
  }
];

export const PLACE_SECTIONS: SheetSection[] = [
  {
    title: "Overview",
    fields: [
      { key: "type", label: "Type", placeholder: "City, village, forest, ship, planet…" },
      { key: "region", label: "Region", placeholder: "Where is it? Coast, mountains, borderlands…" },
      { key: "climate", label: "Climate & weather", placeholder: "Seasons, light, what the air feels like…" },
      { key: "population", label: "Population", placeholder: "How many people, or how busy is it?" },
      { key: "government", label: "Government", placeholder: "Who rules, and how?" },
      { key: "economy", label: "Economy", placeholder: "What keeps it running?" }
    ]
  },
  {
    title: "Look & atmosphere",
    fields: [
      { key: "appearance", label: "Appearance", placeholder: "Layout, architecture, sights, sounds, smells…", multiline: true },
      { key: "atmosphere", label: "Atmosphere", placeholder: "What it feels like to arrive and stay…", multiline: true },
      { key: "landmarks", label: "Landmarks", placeholder: "Places within the place that matter…", multiline: true }
    ]
  },
  {
    title: "History & culture",
    fields: [
      { key: "history", label: "History", placeholder: "Founding, turning points, old wounds…", multiline: true },
      { key: "culture", label: "Culture & customs", placeholder: "Beliefs, food, language, festivals, taboos…", multiline: true },
      { key: "inhabitants", label: "Notable inhabitants", placeholder: "Who lives here, and who is worth knowing?", multiline: true }
    ]
  },
  {
    title: "Story",
    fields: [
      { key: "significance", label: "Role in the story", placeholder: "Why this place matters to the plot or characters…", multiline: true },
      { key: "dangers", label: "Dangers & secrets", placeholder: "Threats, hidden places, what can go wrong here…", multiline: true }
    ]
  }
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Renders filled sheet fields as simple HTML. Returns an empty string when the
 * profile has no content, so migration does not add empty headings to pages.
 */
export function sheetToHtml(
  sections: SheetSection[],
  values: Record<string, string>,
  heading: string
): string {
  const lines: string[] = [];
  for (const section of sections) {
    for (const field of section.fields) {
      const value = (values[field.key] ?? "").trim();
      if (!value) continue;
      const escaped = escapeHtml(value).replace(/\r?\n/g, "<br>");
      lines.push(`<p><strong>${escapeHtml(field.label)}:</strong> ${escaped}</p>`);
    }
  }
  if (lines.length === 0) return "";
  return `<h2>${escapeHtml(heading)}</h2>\n${lines.join("\n")}`;
}
