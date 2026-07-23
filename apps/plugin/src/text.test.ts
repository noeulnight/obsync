import { describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";
import { replaceText } from "@obsync/sync-core";
import { type CanvasItemController, observeCanvas, renderCanvas } from "./canvas-controller";
import { parseCanvas } from "./canvas-data";
import { readCanvasPresence } from "./canvas-presence";
import { changesCanvasStructure, syncNodes } from "./canvas-yjs";
import { mimeType } from "./mime";
import { fileId, isWithin, moveWithin, parentPath, pathKey } from "./path";
import { editorBindingKey } from "./sync-types";

describe("parentPath", () => {
  it("does not turn the last character of a root file into a folder", () => {
    expect(parentPath("wow.png")).toBeUndefined();
    expect(parentPath("assets/wow.png")).toBe("assets");
  });

  it("moves a folder and every descendant without matching similar names", () => {
    expect(isWithin("notes/a.md", "notes")).toBe(true);
    expect(isWithin("notes-old/a.md", "notes")).toBe(false);
    expect(moveWithin("notes/a.md", "notes", "archive/notes")).toBe("archive/notes/a.md");
  });

  it("treats case and Unicode composition as the same Vault path", () => {
    expect(pathKey("NOTES/한글.md")).toBe(pathKey("notes/한글.md"));
    expect(isWithin("NOTES/A.md", "notes")).toBe(true);
  });
});

describe("mimeType", () => {
  it("uploads unknown file types as generic binary", () => {
    expect(mimeType("report.docx")).toBe("application/octet-stream");
    expect(mimeType("image.png")).toBe("image/png");
  });
});

describe("parseCanvas", () => {
  it("keeps nodes, edges, and top-level metadata separate", () => {
    expect(parseCanvas('{"nodes":[{"id":"n1","x":1}],"edges":[],"viewport":{"x":0}}')).toEqual({
      nodes: [{ id: "n1", x: 1 }],
      edges: [],
      meta: { viewport: { x: 0 } },
    });
  });

  it("rejects Canvas items without ids", () => {
    expect(() => parseCanvas('{"nodes":[{"x":1}]}')).toThrow("Invalid Canvas node format.");
  });
});

describe("canvas text synchronization", () => {
  it("does not rerender the canvas for direct node text updates", () => {
    const document = new Y.Doc();
    const nodes = document.getMap<Y.Map<unknown>>("nodes");
    const text = document.getText("canvas-node:node:text");
    let structural = true;
    document.on("afterTransaction", (transaction) => {
      structural = changesCanvasStructure(transaction, [nodes]);
    });

    text.insert(0, "remote text");

    expect(structural).toBe(false);
  });

  it("rerenders the canvas for nested node metadata updates", () => {
    const document = new Y.Doc();
    const nodes = document.getMap<Y.Map<unknown>>("nodes");
    const node = new Y.Map<unknown>();
    nodes.set("node", node);
    let structural = false;
    document.on("afterTransaction", (transaction) => {
      structural = changesCanvasStructure(transaction, [nodes]);
    });

    node.set("x", 100);

    expect(structural).toBe(true);
  });

  it("seeds new notes but leaves existing text to the CodeMirror binding", () => {
    const document = new Y.Doc();
    const nodes = document.getMap<Y.Map<unknown>>("nodes");
    const note = { id: "note", type: "text", text: "새 노트" };

    syncNodes(document, nodes, [note], false);
    const text = document.getText("canvas-node:note:text");
    expect(text.toJSON()).toBe("새 노트");

    replaceText(text, "한글");
    syncNodes(document, nodes, [{ ...note, text: "ㅎㅏㄴㄱㅡㄹ" }], false);
    expect(text.toJSON()).toBe("한글");
  });
});

describe("canvas controller", () => {
  it("publishes saves immediately and renders remote data", () => {
    let data: unknown = { nodes: [], edges: [] };
    let saves = 0;
    let moves = 0;
    const controller = {
      getData: () => data,
      importData: (next: unknown) => {
        data = next;
      },
      requestSave: () => {
        saves += 1;
      },
      markMoved: () => {
        moves += 1;
      },
      data,
    };
    const changes: unknown[] = [];
    const unbind = observeCanvas(controller, (next) => changes.push(next));

    controller.requestSave();
    expect(saves).toBe(1);
    expect(changes).toEqual([data]);
    controller.markMoved();
    expect(moves).toBe(1);
    expect(changes).toEqual([data, data]);

    const remote = { nodes: [{ id: "remote" }], edges: [] };
    renderCanvas(controller, remote);
    expect(data).toBe(remote);
    expect(controller.data).toBe(remote);

    unbind();
    controller.requestSave();
    controller.markMoved();
    expect(changes).toHaveLength(2);
  });

  it("patches existing nodes without reloading the canvas", () => {
    let patched: unknown;
    let imports = 0;
    let renders = 0;
    const node: CanvasItemController = {
      setData: (data: unknown) => (patched = data),
      renderZIndex: () => {
        renders += 1;
      },
    };
    const controller = {
      nodes: new Map([["node", node]]),
      edges: new Map(),
      getData: () => ({ nodes: [], edges: [] }),
      importData: () => {
        imports += 1;
      },
      requestSave: () => undefined,
    };
    const remote = { nodes: [{ id: "node", x: 10 }], edges: [] };

    renderCanvas(controller, remote);

    expect(patched).toEqual(remote.nodes[0]);
    expect(imports).toBe(0);
    expect(node.zIndex).toBe(0);
    expect(renders).toBe(1);
  });

  it("leaves a focused text node to its CodeMirror binding", () => {
    const activeElement = {};
    const nodeEl = {
      ownerDocument: { activeElement, hasFocus: () => true },
      contains: (element: unknown) => element === activeElement,
    } as unknown as HTMLElement;
    const setData = vi.fn();
    const controller = {
      nodes: new Map([["node", { nodeEl, setData }]]),
      edges: new Map(),
      getData: () => ({ nodes: [], edges: [] }),
      importData: () => undefined,
      requestSave: () => undefined,
    };

    renderCanvas(controller, { nodes: [{ id: "node", text: "remote" }], edges: [] });

    expect(setData).not.toHaveBeenCalled();
  });

  it("updates a text node when the Obsidian window is not focused", () => {
    const activeElement = {};
    const nodeEl = {
      ownerDocument: { activeElement, hasFocus: () => false },
      contains: (element: unknown) => element === activeElement,
    } as unknown as HTMLElement;
    const setData = vi.fn();
    const controller = {
      nodes: new Map([["node", { nodeEl, setData }]]),
      edges: new Map(),
      getData: () => ({ nodes: [], edges: [] }),
      importData: () => undefined,
      requestSave: () => undefined,
    };

    renderCanvas(controller, { nodes: [{ id: "node", text: "remote" }], edges: [] });

    expect(setData).toHaveBeenCalledOnce();
  });
});

describe("canvas presence", () => {
  it("accepts presence only for the open canvas", () => {
    const state = {
      user: { name: "Peer", color: "#fff" },
      canvas: { path: "board.canvas", x: 10, y: 20, focusId: "node" },
    };

    expect(readCanvasPresence(state, "board.canvas")).toEqual({
      name: "Peer",
      color: "#fff",
      x: 10,
      y: 20,
      focusId: "node",
    });
    expect(readCanvasPresence(state, "other.canvas")).toBeUndefined();
  });
});

describe("replaceText", () => {
  it("replaces only the changed middle range", () => {
    const document = new Y.Doc();
    const text = document.getText("content");
    text.insert(0, "hello world");
    const changes: Array<{ delta: unknown }> = [];
    text.observe((event) => changes.push({ delta: event.delta }));

    replaceText(text, "hello sync world");

    expect(text.toJSON()).toBe("hello sync world");
    expect(changes).toHaveLength(1);
  });

  it("converges concurrent character edits", () => {
    const first = new Y.Doc();
    const second = new Y.Doc();
    const firstText = first.getText("content");
    const secondText = second.getText("content");
    firstText.insert(0, "abc");
    Y.applyUpdate(second, Y.encodeStateAsUpdate(first));

    firstText.insert(1, "1");
    secondText.insert(2, "2");
    Y.applyUpdate(first, Y.encodeStateAsUpdate(second));
    Y.applyUpdate(second, Y.encodeStateAsUpdate(first));

    expect(firstText.toJSON()).toBe(secondText.toJSON());
  });
});

describe("editorBindingKey", () => {
  it("changes when a path is reused by a different file", () => {
    expect(editorBindingKey("first")).not.toBe(editorBindingKey("second"));
    expect(editorBindingKey("canvas", "node")).toBe("canvas#node");
  });
});

describe("fileId", () => {
  it("matches the deterministic id shared with the web client", () => {
    expect(fileId("434fca61-f9de-461c-8b93-40d3be30b5f7", "notes/a.md")).toBe(
      "5d896a48-5284-563c-af0d-0c74b00dd084",
    );
  });
});
