import { describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";
import { replaceText } from "@obsync/sync-core";

describe("replaceText", () => {
  it("changes only the differing range and converges through Yjs", () => {
    const first = new Y.Doc();
    const second = new Y.Doc();
    const firstText = first.getText("canvas-node:test:text");
    const secondText = second.getText("canvas-node:test:text");

    firstText.insert(0, "hello canvas");
    Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
    replaceText(secondText, "hello shared canvas");
    Y.applyUpdate(first, Y.encodeStateAsUpdate(second));

    expect(firstText.toJSON()).toBe("hello shared canvas");
    expect(firstText.toJSON()).toBe(secondText.toJSON());
  });
});
