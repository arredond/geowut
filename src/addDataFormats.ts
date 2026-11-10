import { MAX_FEATURES, MAX_VERTICES } from "./limits";
import { FILE_FORMATS } from "./files";
import { CSV_COLUMNS } from "./files/csvColumns";
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
          "A geometry, a Feature or a FeatureCollection, or one per line (GeoJSON lines, as GDAL's GeoJSONSeq writes). Properties are kept.",
        examples: ['{"type":"Point","coordinates":[-3.7038,40.4168]}'],
      },
      {
        name: "WKT",
        description:
          "Any geometry type, GeometryCollection included. PostGIS's EWKT too, its SRID first.",
        examples: [
          "POLYGON ((-3.8 40.3, -3.5 40.3, -3.5 40.6, -3.8 40.6, -3.8 40.3))",
          "SRID=4326;POINT(-3.7038 40.4168)",
        ],
      },
      {
        name: "WKB",
        description:
          "Hex-encoded, as databases print geometries: WKB or PostGIS's EWKB, also led by \\x or 0x. One or many.",
        examples: ["0101000020E6100000FE65F7E461A10DC0857CD0B359354440"],
      },
      {
        name: "Esri JSON",
        description:
          "Geometries, features or a whole ArcGIS REST query response (f=json), in WGS84 or Web Mercator.",
        examples: ['{"x":-3.7038,"y":40.4168}'],
      },
      {
        name: "Encoded polyline",
        description:
          "A route as Google's, OSRM's (precision 5) or Valhalla's (precision 6) APIs encode it.",
        examples: ["_p~iF~ps|U_ulLnnqC_mqNvxq`@"],
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
      {
        name: "Degrees, minutes, seconds",
        description:
          "Also degrees and decimal minutes, or decimal degrees with ° or N, S, E, W. With hemisphere letters, either order will do.",
        examples: [`40°25'0.6"N 3°42'13.7"W`, "40° 25.01' N, 3° 42.23' W"],
      },
      {
        name: "Map links",
        description:
          "Google Maps, OpenStreetMap, Bing, Apple Maps and most web maps' #zoom/lat/lng links, or geo: URIs. A marked place wins over the map's centre.",
        examples: ["https://www.openstreetmap.org/#map=15/40.4168/-3.7038"],
      },
    ],
  },
  {
    title: "Cells and codes",
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
        name: "Geohash",
        description: "Its cell, from 2 to 12 characters (or 1 with gh:).",
        examples: ["ezjmgtwu"],
      },
      {
        name: "Plus code",
        description:
          "Open Location Code, as Google Maps shows: a full one, with 8 characters before the +.",
        examples: ["8CGRC78W+PF"],
      },
      {
        name: "Prefixes",
        description:
          "Some IDs are valid in more than one grid. Start one with h3:, s2:, a5:, xyz: or gh: to say which, and a polyline with polyline6: for precision 6.",
        examples: ["a5:4c5a2698a737e82c", "gh:0d4283d"],
      },
    ],
  },
  {
    title: "Files",
    note: "Open them, drop them anywhere or paste them. They're read in your browser and never uploaded.",
    formats: [
      ...FILE_FORMATS.map(({ name, extensions }) => ({
        name,
        description: extensions.map((ext) => `.${ext}`).join(", "),
      })),
      {
        name: "CSV columns",
        description: `A geometry column, holding WKT, EWKT, WKB, EWKB or GeoJSON: ${CSV_COLUMNS.geometry.join(", ")}. Or latitude (${CSV_COLUMNS.latitude.join(", ")}) and longitude (${CSV_COLUMNS.longitude.join(", ")}) ones. Names are matched ignoring case, the first listed winning, and the other columns become properties. Commas, semicolons and tabs all separate.`,
      },
    ],
  },
];

const CAVEATS = [
  "Data in other coordinate systems is reprojected where it says which: EWKT and EWKB SRIDs, Esri JSON's spatial reference, a Shapefile's .prj, and GeoParquet, FlatGeobuf and GeoPackage metadata. Any EPSG code for a 2D system will do.",
  "Where nothing says, coordinates are taken for longitude and latitude (WGS84): pasted text, CSV, and WKB or Shapefiles without an SRID or .prj.",
  `Up to ${MAX_FEATURES.toLocaleString("en")} features or ${MAX_VERTICES.toLocaleString("en")} vertices are added at once: past that the map slows to a crawl, so the rest is left out, saying so.`,
  "M values (in WKT and WKB) are dropped, as GeoJSON has no place for them.",
  "Z values are kept: a feature's details show them, and exports and copies keep them. Tilt the map (click the compass, or Ctrl-drag) to see polygons with Z raised to their highest, in metres. Editing a feature drops its Z.",
  "An ID that fits several grids is read as the likeliest: S2 over A5 where nothing tells them apart, and any grid over a geohash. A list is read in the grid that fits all of it. A prefix settles it either way.",
  "Short plus codes, with a place after them, can't be placed without that place.",
  "A polyline that fits on the globe at precision 5 is read so: near the equator, one at precision 6 needs its prefix.",
  "A lone digit isn't taken for a quadkey (xyz:1 is), nor are TMS tile numbers, which count Y from the south.",
  "Bounding boxes can't cross the antimeridian.",
  "No need to open this dialog: pasting onto the map does the same.",
];

/**
 * A folded "What can I add?" section listing every input format, its caveats and the grid
 * prefixes. Clicking an example hands it to onExample, to fill the text box.
 */
export function buildFormatsHelp(
  onExample: (example: string) => void,
): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = "formats-help";

  const summary = document.createElement("summary");
  summary.innerHTML = ICONS.info;
  summary.append("What can I add?");
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
