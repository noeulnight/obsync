import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CredentialsPage } from "./CredentialsPage";
import { useApproveDevice } from "../queries/use-session";

export function DeviceApprovalPage() {
  const [search] = useSearchParams();
  const userCode = search.get("user_code") ?? "";
  const approval = useApproveDevice(userCode);

  if (!/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(userCode)) {
    return (
      <main className="grid min-h-svh place-items-center p-4 text-sm text-destructive">
        유효한 기기 코드가 없습니다.
      </main>
    );
  }
  if (approval.isSuccess) {
    return (
      <main className="grid min-h-svh place-items-center p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle>승인 완료</CardTitle>
            <CardDescription>이 창을 닫고 Obsidian으로 돌아가세요.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }
  return (
    <CredentialsPage
      title="기기 승인"
      description={`Obsidian 기기 코드 ${userCode}`}
      error={message(approval.error)}
      onSubmit={(credentials) => approval.mutateAsync(credentials)}
    />
  );
}

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : "";
}
import { useSearchParams } from "react-router-dom";
