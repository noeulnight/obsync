import { Navigate, Route, Routes } from "react-router-dom";
import { DeviceApprovalPage } from "@/features/auth/components/DeviceApprovalPage";
import { WorkspaceApp } from "@/features/workspace/components/WorkspaceApp";

export function App() {
  return (
    <Routes>
      <Route path="/device" element={<DeviceApprovalPage />} />
      <Route path="/" element={<WorkspaceApp />} />
      <Route path="/vaults/:vaultId" element={<WorkspaceApp />} />
      <Route path="/vaults/:vaultId/files/:fileId" element={<WorkspaceApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
