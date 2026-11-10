import { ICONS } from "./icons";

interface Format {
  name: string;
  description: string;
  /** Clicking one puts it in the text box, to try. */
  examples?: string[];
}

interface Section {
  title: string;
  note?: string;
  formats: Format[];
}

/** What "Add data" understands, and the small print. Kept here, apart from the dialog's workings. */
const SECTIONS: Section[] = [
  {
    title: "Geometries",
    formats: [
      {
        name: "GeoJSON",
        description:
          "A geometry, a Feature or a FeatureCollection. Properties are kept.",
        examples: ['{"type":"Point","coordinates":[-3.7038,40.4168]}'],
      },
      {
        name: "WKT",
        description: "Any geometry type, GeometryCollection included.",
        examples: [
          "POLYGON ((-3.8 40.3, -3.5 40.3, -3.5 40.6, -3.8 40.6, -3.8 40.3))",
        ],
      },
      {
        name: "Esri JSON",
        description:
          "Geometries, features or a whole ArcGIS REST query response (f=json), in WGS84 or Web Mercator.",
        examples: ['{"x":-3.7038,"y":40.4168}'],
      },
    ],
  },
  {
    title: "Boxes and points",
    note: "One per line, and they can be mixed.",
    formats: [
      {
        name: "Bounding box",
        description:
          "xmin ymin xmax ymax, split by spaces or commas, as GDAL's -te or -spat, and -projwin's corners. Also ogrinfo's Extent line and [xmin, ymin, xmax, ymax].",
        examples: [
          "-3.8 40.3 -3.5 40.6",
          "Extent: (-3.8, 40.3) - (-3.5, 40.6)",
        ],
      },
      {
        name: "Lat, lng",
        description: "A point: latitude first, then a comma and longitude.",
        examples: ["40.4168, -3.7038"],
      },
    ],
  },
  {
    title: "Cell IDs",
    note: "Alone or in lists, split by commas, spaces or lines, as the side panel copies them.",
    formats: [
      {
        name: "H3",
        description: "The hex index, or the same as an integer.",
        examples: ["8939031a8b3ffff", "617996116838055935"],
      },
      {
        name: "S2",
        description:
          "The token, or the cell ID as an integer, signed too (as BigQuery stores them).",
        examples: ["0d4283d"],
      },
      {
        name: "A5",
        description: "The hex ID, or the same as an integer, signed too.",
        examples: ["51ad118000000000"],
      },
      {
        name: "XYZ",
        description:
          "The tile as Z/X/Y, numbered as web maps do, or its quadkey: digits 0 to 3.",
        examples: ["12/2005/1544", "0313"],
      },
      {
        name: "Prefixes",
        description:
          "Some IDs are valid in more than one grid. Start one with h3:, s2:, a5: or xyz: to say which.",
        examples: ["a5:4c5a2698a737e82c"],
      },
    ],
  },
];

const CAVEATS = [
  "Coordinates are longitude and latitude in degrees (WGS84). Projected ones, in metres, aren't converted.",
  "Esri JSON in other spatial references is refused rather than drawn in the wrong place.",
  "An ID that fits several grids is read as the likeliest: S2 over A5 where nothing tells them apart. A list is read in the grid that fits all of it. A prefix settles it either way.",
  "A lone digit isn't taken for a quadkey (xyz:1 is), nor are TMS tile numbers, which count Y from the south.",
  "Bounding boxes can't cross the antimeridian.",
  "No need to open this dialog: pasting onto the map does the same.",
];

/**
 * A folded "What can I paste?" section listing every input format, its caveats and the grid
 * prefixes. Clicking an example hands it to onExample, to fill the text box.
 */
export function buildFormatsHelp(
  onExample: (example: string) => void,
): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = "formats-help";

  const summary = document.createElement("summary");
  summary.innerHTML = ICONS.info;
  summary.append("What can I paste?");
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "formats-body";

  for (const { title, note, formats } of SECTIONS) {
    const heading = document.createElement("h3");
    heading.textContent = title;
    body.appendChild(heading);
    if (note) {
      const noteEl = document.createElement("p");
      noteEl.className = "formats-note";
      noteEl.textContent = note;
      body.appendChild(noteEl);
    }

    const list = document.createElement("dl");
    for (const { name, description, examples = [] } of formats) {
      const term = document.createElement("dt");
      term.textContent = name;
      const definition = document.createElement("dd");
      definition.append(description);
      for (const example of examples) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "format-example";
        button.title = "Try it";
        button.textContent = example;
        button.addEventListener("click", () => onExample(example));
        definition.append(" ", button);
      }
      list.append(term, definition);
    }
    body.appendChild(list);
  }

  const caveatsHeading = document.createElement("h3");
  caveatsHeading.textContent = "Good to know";
  const caveats = document.createElement("ul");
  for (const caveat of CAVEATS) {
    const item = document.createElement("li");
    item.textContent = caveat;
    caveats.appendChild(item);
  }
  body.append(caveatsHeading, caveats);

  details.appendChild(body);
  return details;
}
