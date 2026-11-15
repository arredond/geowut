import { describe, expect, it, vi } from "vitest";
import { buildDetailsTable } from "./panel";
import type { DetailRow } from "./panel";
import {
  keyProblem,
  parseValue,
  PropertyEditor,
  renameKey,
  valueText,
} from "./propertyEditor";
import type { PropertyEditing } from "./propertyEditor";

describe("parseValue", () => {
  it("keeps strings strings", () => {
    expect(parseValue("123", "Main St")).toBe("123");
  });

  it("reads anything else as JSON where it can", () => {
    expect(parseValue("42", 7)).toBe(42);
    expect(parseValue("true")).toBe(true);
    expect(parseValue("null")).toBeNull();
    expect(parseValue('{"a":1}')).toEqual({ a: 1 });
    expect(parseValue("hello", 7)).toBe("hello");
    expect(parseValue("007")).toBe("007");
  });

  it("round-trips with valueText", () => {
    for (const value of ["x", 1.5, false, null, [1, "a"], { b: { c: 2 } }])
      expect(parseValue(valueText(value), value)).toEqual(value);
  });
});

describe("renameKey", () => {
  it("keeps the order", () => {
    expect(Object.keys(renameKey({ a: 1, b: 2, c: 3 }, "b", "x"))).toEqual([
      "a",
      "x",
      "c",
    ]);
  });
});

describe("keyProblem", () => {
  const editing = {
    values: { name: 1 },
    onChange: () => {},
    reserved: ["gw:color"],
  };

  it("refuses blank, taken and reserved names", () => {
    expect(keyProblem("", editing)).toMatch(/needs a name/);
    expect(keyProblem("name", editing)).toMatch(/already/);
    expect(keyProblem("gw:color", editing)).toMatch(/style/);
    expect(keyProblem("other", editing)).toBeNull();
  });

  it("lets a property keep its own name", () => {
    expect(keyProblem("name", editing, "name")).toBeNull();
  });
});

describe("PropertyEditor", () => {
  const rows: DetailRow[] = [
    { label: "Area (km²)", value: "3" },
    { label: "name", value: "Centro", property: "name" },
    { label: "pop", value: "42", property: "pop" },
  ];

  function setUp(
    values: Record<string, unknown> = { name: "Centro", pop: 42 },
  ) {
    const editing: PropertyEditing = {
      values,
      onChange: vi.fn(),
      reserved: ["gw:color"],
    };
    const table = buildDetailsTable(rows)!;
    const add = new PropertyEditor().attach(table, editing);
    document.body.replaceChildren(table, add);
    const row = (label: string) =>
      [...table.rows].find((r) => r.cells[0].textContent === label)!;
    return { editing, table, add, row };
  }

  const type = (field: HTMLInputElement, text: string, key = "Enter") => {
    field.value = text;
    field.dispatchEvent(new Event("input"));
    field.dispatchEvent(new KeyboardEvent("keydown", { key }));
  };
  const field = () =>
    document.querySelector<HTMLInputElement>(".property-input")!;

  it("leaves measured rows alone", () => {
    const { row } = setUp();
    expect(row("Area (km²)").classList.contains("editable")).toBe(false);
    expect(row("Area (km²)").querySelector(".property-delete")).toBeNull();
    row("Area (km²)").cells[1].click();
    expect(document.querySelector(".property-input")).toBeNull();
  });

  it("edits a value in place, keeping its type", () => {
    const { editing, row } = setUp();
    row("pop").cells[1].click();
    expect(field().value).toBe("42");
    type(field(), "43");
    expect(editing.onChange).toHaveBeenCalledWith({ name: "Centro", pop: 43 });
  });

  it("drops an edit on Escape, or one that changes nothing", () => {
    const { editing, row } = setUp();
    row("name").cells[1].click();
    type(field(), "Other", "Escape");
    expect(row("name").cells[1].textContent).toBe("Centro");
    row("name").cells[1].click();
    type(field(), "Centro");
    expect(editing.onChange).not.toHaveBeenCalled();
  });

  it("renames in place, refusing a name that's taken", () => {
    const { editing, row } = setUp();
    row("name").cells[0].click();
    type(field(), "pop");
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(editing.onChange).not.toHaveBeenCalled();
    type(field(), "title");
    expect(editing.onChange).toHaveBeenCalledWith({ title: "Centro", pop: 42 });
  });

  it("keeps a blurred edit", () => {
    const { editing, row } = setUp();
    row("name").cells[1].click();
    field().value = "Sol";
    field().blur();
    expect(editing.onChange).toHaveBeenCalledWith({ name: "Sol", pop: 42 });
  });

  it("deletes a property", () => {
    const { editing, row } = setUp();
    row("name").querySelector<HTMLButtonElement>(".property-delete")!.click();
    expect(editing.onChange).toHaveBeenCalledWith({ pop: 42 });
  });

  it("adds a property, name then value", () => {
    const { editing, add, table } = setUp();
    add.click();
    const [name, value] = table.querySelectorAll<HTMLInputElement>(
      ".new-property .property-input",
    );
    expect(document.activeElement).toBe(name);
    type(name, "gw:color");
    type(value, "1");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    type(name, "height");
    type(value, "12.5");
    expect(editing.onChange).toHaveBeenCalledWith({
      name: "Centro",
      pop: 42,
      height: 12.5,
    });
    expect(table.querySelector(".new-property")).toBeNull();
  });

  it("drops a new row on Escape", () => {
    const { editing, add, table } = setUp();
    add.click();
    type(field(), "x", "Escape");
    expect(table.querySelector(".new-property")).toBeNull();
    expect(editing.onChange).not.toHaveBeenCalled();
  });

  it("opens the cell pressed while another edit was under way, once redrawn", async () => {
    const editor = new PropertyEditor();
    const editing: PropertyEditing = {
      values: { name: "Centro", pop: 42 },
      onChange: vi.fn(),
    };
    const first = buildDetailsTable(rows)!;
    editor.attach(first, editing);
    document.body.replaceChildren(first);
    first.rows[1].cells[1].click();
    // Pressing on another value: the edit ends, and the panel redraws.
    first.rows[2].cells[1].dispatchEvent(new MouseEvent("mousedown"));
    const redrawn = buildDetailsTable(rows)!;
    editor.attach(redrawn, editing);
    document.body.replaceChildren(redrawn);
    await Promise.resolve();
    expect(redrawn.rows[2].cells[1].querySelector("input")?.value).toBe("42");
  });
});
