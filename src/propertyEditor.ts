import { ICONS } from "./icons";

/** A feature's own properties, which the panel lets be edited in place. */
export interface PropertyEditing {
  values: Record<string, unknown>;
  /** The properties as they now stand, in order, after one edit. */
  onChange: (values: Record<string, unknown>) => void;
  /** Names kept for something else, such as the style's gw: properties. */
  reserved?: string[];
}

/**
 * Text typed for a value, as a value: a string stays a string, so a name edited to digits
 * doesn't turn into a number. Anything else, new values included, is JSON if it reads as JSON
 * (42, true, null, {"a": 1}) and text if not.
 */
export function parseValue(text: string, previous?: unknown): unknown {
  if (typeof previous === "string") return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** A property value as text to edit or show: strings as they are, anything else as JSON. */
export function valueText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** The same properties, one renamed, in the same order. */
export function renameKey(
  values: Record<string, unknown>,
  from: string,
  to: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key === from ? to : key,
      value,
    ]),
  );
}

/** Why a name can't be used, if it can't. `current` is the property being renamed, if one is. */
export function keyProblem(
  key: string,
  { values, reserved = [] }: PropertyEditing,
  current?: string,
): string | null {
  if (key === "") return "A property needs a name";
  if (reserved.includes(key)) return `${key} is kept for the feature's style`;
  if (key !== current && Object.hasOwn(values, key))
    return `There's already a property called ${key}`;
  return null;
}

type Target = { key: string; field: "key" | "value" } | { add: true };

/**
 * Turns the property rows of a details table into ones edited in place: a click on a name or a
 * value edits it, Enter or leaving it keeps the edit, Escape drops it. Each row gets a delete
 * button, and the table an add button under it. Every change is one call to onChange.
 *
 * A change redraws the panel, taking with it the cell a click was about to land on, which
 * leaving one edit for another does: that cell is remembered, and opened in the new table.
 */
export class PropertyEditor {
  private pending?: Target;

  /** Wires up a freshly drawn table, returning the add button to place under it. */
  attach(table: HTMLTableElement, editing: PropertyEditing): HTMLElement {
    const opened = new Map<string, () => void>();
    for (const row of table.querySelectorAll<HTMLTableRowElement>(
      "tr[data-property]",
    )) {
      const key = row.dataset.property!;
      const [nameCell, valueCell, actions] = row.cells;
      row.classList.add("editable");
      const editName = () => this.editName(nameCell, key, editing);
      const editValue = () => this.editValue(valueCell, key, editing);
      this.onActivate(nameCell, { key, field: "key" }, editName, table);
      this.onActivate(valueCell, { key, field: "value" }, editValue, table);
      opened.set(`key:${key}`, editName);
      opened.set(`value:${key}`, editValue);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "property-delete";
      remove.title = `Delete ${key}`;
      remove.setAttribute("aria-label", `Delete ${key}`);
      remove.innerHTML = ICONS.trash;
      remove.addEventListener("click", () => {
        const { [key]: _, ...rest } = editing.values;
        editing.onChange(rest);
      });
      actions.appendChild(remove);
    }

    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-property";
    add.innerHTML = `${ICONS.plus}<span>Add property</span>`;
    const addRow = () => this.addRow(table, editing);
    this.onActivate(add, { add: true }, addRow, table);

    const pending = this.pending;
    this.pending = undefined;
    if (pending)
      queueMicrotask(() =>
        "add" in pending
          ? addRow()
          : opened.get(`${pending.field}:${pending.key}`)?.(),
      );
    return add;
  }

  private onActivate(
    el: HTMLElement,
    target: Target,
    open: () => void,
    table: HTMLTableElement,
  ): void {
    // Pressing here ends any edit under way, which may redraw the table before the click.
    el.addEventListener("mousedown", () => {
      if (table.querySelector(".property-input")) this.pending = target;
    });
    el.addEventListener("click", (event) => {
      // Links in values still open; the rest of the cell edits.
      if ((event.target as Element).closest("a, input")) return;
      this.pending = undefined;
      open();
    });
  }

  private editName(
    cell: HTMLElement,
    key: string,
    editing: PropertyEditing,
  ): void {
    editField(cell, key, "Property name", (text) => {
      const name = text.trim();
      if (name === key) return null;
      const problem = keyProblem(name, editing, key);
      if (problem) return problem;
      editing.onChange(renameKey(editing.values, key, name));
      return null;
    });
  }

  private editValue(
    cell: HTMLElement,
    key: string,
    editing: PropertyEditing,
  ): void {
    const previous = editing.values[key];
    const text = valueText(previous);
    editField(cell, text, `Value of ${key}`, (typed) => {
      if (typed !== text)
        editing.onChange({
          ...editing.values,
          [key]: parseValue(typed, previous),
        });
      return null;
    });
  }

  /** A blank row at the end: a name, then a value. It's kept once it has a usable name. */
  private addRow(table: HTMLTableElement, editing: PropertyEditing): void {
    const open = table.querySelector<HTMLInputElement>(
      ".new-property .property-input",
    );
    if (open) return open.focus();
    const row = table.insertRow();
    row.className = "new-property";
    const name = input("Property name", "");
    name.placeholder = "Name";
    const value = input("Value", "");
    value.placeholder = "Value";
    row.appendChild(document.createElement("th")).appendChild(name);
    row.insertCell().appendChild(value);
    row.insertCell();

    let done = false;
    const finish = (keep: boolean) => {
      if (done) return;
      const key = name.value.trim();
      const problem = keyProblem(key, editing);
      if (keep && problem) {
        // Nothing typed at all is just a change of mind.
        if (key === "" && value.value === "") return finish(false);
        invalid(name, problem);
        name.focus();
        return;
      }
      done = true;
      row.remove();
      if (keep)
        editing.onChange({ ...editing.values, [key]: parseValue(value.value) });
    };
    name.addEventListener("keydown", (event) => {
      if (event.key === "Enter") value.focus();
    });
    value.addEventListener("keydown", (event) => {
      if (event.key === "Enter") finish(true);
    });
    for (const field of [name, value]) {
      field.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        finish(false);
      });
      field.addEventListener("input", () => valid(name));
    }
    // Leaving the row, rather than moving between its two fields, ends it.
    row.addEventListener("focusout", (event) => {
      if (!row.contains(event.relatedTarget as Node | null)) {
        const key = name.value.trim();
        finish(keyProblem(key, editing) === null);
      }
    });
    name.focus();
  }
}

function input(label: string, value: string): HTMLInputElement {
  const field = document.createElement("input");
  field.type = "text";
  field.className = "property-input";
  field.value = value;
  field.setAttribute("aria-label", label);
  field.spellcheck = false;
  return field;
}

function invalid(field: HTMLInputElement, problem: string): void {
  field.setAttribute("aria-invalid", "true");
  field.title = problem;
}

function valid(field: HTMLInputElement): void {
  field.removeAttribute("aria-invalid");
  field.title = "";
}

/**
 * Swaps a cell's content for a field holding text. Enter or leaving keeps it, unless commit
 * says why it can't be kept: then Enter keeps the field open, saying so, and leaving drops it.
 */
function editField(
  cell: HTMLElement,
  text: string,
  label: string,
  commit: (text: string) => string | null,
): void {
  const shown = [...cell.childNodes];
  const field = input(label, text);
  cell.replaceChildren(field);
  cell.classList.add("editing");
  field.focus();
  field.select();

  let done = false;
  const restore = () => {
    done = true;
    cell.classList.remove("editing");
    if (cell.contains(field)) cell.replaceChildren(...shown);
  };
  const tryCommit = (orDrop: boolean) => {
    if (done) return;
    // Before committing: a kept edit redraws the table, which can blur the field again.
    done = true;
    const problem = commit(field.value);
    if (problem && !orDrop) {
      done = false;
      return invalid(field, problem);
    }
    // A kept edit has redrawn the table already; restoring the old one does no harm if not.
    restore();
  };
  field.addEventListener("input", () => valid(field));
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter") tryCommit(false);
    else if (event.key === "Escape") {
      event.stopPropagation();
      restore();
    }
  });
  field.addEventListener("blur", () => tryCommit(true));
}
