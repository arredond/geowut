import { describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";

function stubClipboard(writeText: (text: string) => Promise<void>) {
  vi.stubGlobal("navigator", { clipboard: { writeText } });
}

describe("copyText", () => {
  it("writes to the clipboard", async () => {
    const writeText = vi.fn(async () => {});
    stubClipboard(writeText);
    expect(await copyText("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("reports failure rather than throwing", async () => {
    stubClipboard(async () => {
      throw new Error("denied");
    });
    expect(await copyText("hello")).toBe(false);
  });
});
