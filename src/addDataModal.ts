import { UnsupportedDataError } from "./errors";
import { buildFormatsHelp } from "./addDataFormats";
import { FILE_ACCEPT } from "./files";
import { isEmptyCollection, parseFeatures } from "./formats/text";
import { withProjections } from "./projection";
import { capFeatures, MAX_FEATURES, MAX_VERTICES } from "./limits";
import type { Feature } from "geojson";

export interface AddResult {
  added: number;
  rejected: number;
}

type Outcome =
  { result: "added" } | { result: "partial" | "failed"; message: string };

export class AddDataModal {
  private root: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private error: HTMLElement;
  private addButton: HTMLButtonElement;
  private fileInput: HTMLInputElement;
  private onSubmit: (features: Feature[]) => AddResult;
  /** Reading is async: what's read last wins, and earlier reads are dropped. */
  private reading = 0;

  constructor(
    container: HTMLElement,
    onSubmit: (features: Feature[]) => AddResult,
  ) {
    this.onSubmit = onSubmit;

    this.root = document.createElement("div");
    this.root.className = "modal-overlay";
    this.root.hidden = true;
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.hide();
    });

    const dialog = document.createElement("div");
    dialog.className = "modal";

    const heading = document.createElement("h2");
    heading.textContent = "Add data";
    dialog.appendChild(heading);

    const hint = document.createElement("p");
    hint.textContent =
      "Paste geometries (GeoJSON, WKT, WKB, Esri JSON, polylines), bounding boxes, coordinates, map links, cell IDs, geohashes or plus codes. Or open files, or drop them anywhere: they're read here, on your device.";
    dialog.appendChild(hint);

    this.textarea = document.createElement("textarea");
    this.textarea.rows = 8;
    this.textarea.placeholder =
      'POINT (-3 40)\n{"type":"Point","coordinates":[-3,40]}\n-3.8 40.3 -3.5 40.6\n40.4168, -3.7038';
    dialog.appendChild(this.textarea);

    dialog.appendChild(
      buildFormatsHelp((example) => {
        this.textarea.value = example;
        this.error.hidden = true;
        this.textarea.focus();
      }),
    );

    this.error = document.createElement("p");
    this.error.className = "modal-error";
    this.error.hidden = true;
    dialog.appendChild(this.error);

    const actions = document.createElement("div");
    actions.className = "modal-actions";

    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.multiple = true;
    this.fileInput.accept = FILE_ACCEPT;
    this.fileInput.hidden = true;
    this.fileInput.addEventListener("change", () => {
      const files = [...(this.fileInput.files ?? [])];
      this.fileInput.value = ""; // So picking the same file again still counts.
      if (files.length > 0) void this.addFiles(files);
    });

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "open-files";
    openButton.textContent = "Open files…";
    openButton.addEventListener("click", () => this.fileInput.click());

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => this.hide());

    this.addButton = document.createElement("button");
    this.addButton.type = "button";
    this.addButton.className = "primary";
    this.addButton.textContent = "Add";
    this.addButton.addEventListener("click", () => void this.submit());

    actions.append(this.fileInput, openButton, cancelButton, this.addButton);
    dialog.appendChild(actions);

    this.root.appendChild(dialog);
    container.appendChild(this.root);
  }

  show(): void {
    this.textarea.value = "";
    this.error.hidden = true;
    this.root.hidden = false;
    this.textarea.focus();
  }

  isHidden(): boolean {
    return Boolean(this.root.hidden);
  }

  hide(): void {
    this.reading++; // Whatever is still being read is no longer wanted.
    this.setBusy(false);
    this.root.hidden = true;
  }

  private showError(message: string): void {
    this.error.textContent = message;
    this.error.hidden = false;
  }

  private setBusy(busy: boolean): void {
    this.addButton.disabled = busy;
    this.addButton.textContent = busy ? "Reading…" : "Add";
    this.root.classList.toggle("busy", busy);
  }

  /**
   * Adds text pasted straight onto the map, as if submitted here, without opening the dialog
   * unless something went wrong: then it shows what, with the text to fix if none was added.
   */
  async addPasted(text: string): Promise<void> {
    if (!text.trim()) return;
    const outcome = await this.read(() => this.addText(text));
    if (!outcome || outcome.result === "added") return;
    this.show();
    if (outcome.result === "failed") this.textarea.value = text.trim();
    this.showError(outcome.message);
  }

  /**
   * Adds files, opened here, dropped or pasted, opening the dialog only to say what went wrong.
   * Their parsers, and proj4 where needed, are loaded the first time they're wanted.
   */
  async addFiles(files: File[]): Promise<void> {
    if (!this.isHidden()) this.setBusy(true);
    const outcome = await this.read(async () => {
      const { readFiles } = await import("./files");
      const { features, problems } = await readFiles(files);
      const names = files.map((f) => f.name).join(", ");
      return this.deliver(features, problems, `Nothing to add in ${names}.`);
    });
    if (!outcome) return;
    if (outcome.result === "added") {
      this.hide();
      return;
    }
    if (this.isHidden()) this.show();
    this.setBusy(false);
    this.showError(outcome.message);
  }

  private async submit(): Promise<void> {
    const text = this.textarea.value;
    if (!text.trim()) return;
    this.setBusy(true);
    const outcome = await this.read(() => this.addText(text));
    if (!outcome) return;
    this.setBusy(false);
    if (outcome.result === "added") {
      this.hide();
      return;
    }
    // What was added is on the map now; clear it so it isn't added twice.
    if (outcome.result === "partial") this.textarea.value = "";
    this.showError(outcome.message);
  }

  /** Runs a read, unless another starts or the dialog closes meanwhile: then its outcome is null. */
  private async read(reader: () => Promise<Outcome>): Promise<Outcome | null> {
    const id = ++this.reading;
    let outcome: Outcome;
    try {
      outcome = await reader();
    } catch (error) {
      if (!(error instanceof UnsupportedDataError)) throw error;
      outcome = { result: "failed", message: error.message };
    }
    return id === this.reading ? outcome : null;
  }

  private async addText(text: string): Promise<Outcome> {
    const features = await withProjections(() => parseFeatures(text.trim()));
    return this.deliver(
      features,
      features.length === 0 && isEmptyCollection(text)
        ? ["That's valid, but empty: there are no features in it."]
        : [],
      'Could not read that as geometries, a bounding box, coordinates, a map link or cell IDs. "What can I add?" lists every format.',
    );
  }

  /** Adds what was read, up to the caps, and words what went wrong, if anything. */
  private deliver(
    features: Feature[],
    problems: string[],
    nothingMessage: string,
  ): Outcome {
    const kept = capFeatures(features);
    const { added, rejected } =
      kept.length > 0 ? this.onSubmit(kept) : { added: 0, rejected: 0 };
    const messages = [...problems];
    if (kept.length < features.length)
      messages.push(
        `Added the first ${kept.length.toLocaleString("en")} of ${features.length.toLocaleString("en")} features: past ${MAX_FEATURES.toLocaleString("en")} features or ${MAX_VERTICES.toLocaleString("en")} vertices the map slows to a crawl.`,
      );
    if (rejected > 0)
      messages.push(
        `Skipped ${rejected} of ${kept.length} features with invalid geometry, such as coordinates off the globe: projected data without its coordinate system?`,
      );
    if (added === 0)
      return {
        result: "failed",
        message: (messages.length ? messages : [nothingMessage]).join("\n"),
      };
    return messages.length
      ? { result: "partial", message: messages.join("\n") }
      : { result: "added" };
  }
}
