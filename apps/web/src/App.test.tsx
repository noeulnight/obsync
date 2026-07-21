import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vite-plus/test";
import { SidebarProvider } from "./components/ui/sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { App } from "./App";
import { FileTree } from "./features/documents/components/FileTree";
import { FileHeader } from "./features/workspace/components/FileHeader";
import { queryKeys } from "./lib/query/keys";

describe("App routes", () => {
  it("renders the account login form", () => {
    const html = render("/");

    expect(html).toContain("계정으로 로그인해 Vault를 편집하세요.");
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
  });

  it("renders the device approval form for a valid code", () => {
    const html = render("/device?user_code=ABCD-EFGH");

    expect(html).toContain("Obsidian 기기 코드 ABCD-EFGH");
    expect(html).toContain("기기 승인");
  });

  it("uses the current web session to approve a device", () => {
    const html = render("/device?user_code=ABCD-EFGH", true);

    expect(html).toContain("me@example.com 계정으로 연결합니다.");
    expect(html).toContain("이 기기 승인");
    expect(html).not.toContain('type="password"');
  });

  it("renders file actions in the tree and header", () => {
    const tree = renderToStaticMarkup(
      <TooltipProvider>
        <SidebarProvider>
          <FileTree
            entries={[{ id: "1", kind: "markdown", path: "note.md", deleted: false }]}
            active="1"
            open={() => undefined}
            rename={() => undefined}
            remove={() => undefined}
          />
        </SidebarProvider>
      </TooltipProvider>,
    );
    const header = renderToStaticMarkup(
      <FileHeader
        vaultName="Vault"
        path="note.md"
        onRename={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(tree).toContain('data-slot="context-menu-trigger"');
    expect(header).toContain('aria-label="파일 메뉴"');
  });
});

function render(path: string, session = false) {
  Object.defineProperty(globalThis, "location", {
    value: new URL(path, "http://localhost:5173"),
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: storage(),
    configurable: true,
  });
  const client = new QueryClient();
  client.setQueryData(queryKeys.session, session);
  if (session) {
    client.setQueryData(queryKeys.account, {
      id: "user-id",
      email: "me@example.com",
      displayName: null,
      createdAt: "2026-07-21T00:00:00.000Z",
    });
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}
