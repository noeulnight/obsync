import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { DeviceApprovalPage } from "@/features/auth/components/DeviceApprovalPage";
import { McpAuthorizationPage } from "@/features/auth/components/McpAuthorizationPage";
import { WorkspaceApp } from "@/features/workspace/components/WorkspaceApp";

const PublicSharePage = lazy(() =>
  import("@/features/sharing/components/PublicSharePage").then((module) => ({
    default: module.PublicSharePage,
  })),
);

export function App() {
  return (
    <Routes>
      <Route path="/device" element={<DeviceApprovalPage />} />
      <Route path="/oauth/authorize" element={<McpAuthorizationPage />} />
      <Route
        path="/s/:slug"
        element={
          <Suspense fallback={<PublicLoading />}>
            <PublicSharePage />
          </Suspense>
        }
      />
      <Route path="/" element={<WorkspaceApp />} />
      <Route path="/vaults/:vaultId" element={<WorkspaceApp />} />
      <Route path="/vaults/:vaultId/graph" element={<WorkspaceApp />} />
      <Route path="/vaults/:vaultId/trash" element={<WorkspaceApp />} />
      <Route path="/vaults/:vaultId/files/:fileId" element={<WorkspaceApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function PublicLoading() {
  return (
    <main className="grid min-h-svh place-items-center text-sm text-muted-foreground">
      Loading shared page…
    </main>
  );
}
