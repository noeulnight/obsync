import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccount } from "@/features/auth/queries/use-account";
import { errorMessage } from "@/lib/error";
import { CredentialsPage } from "./CredentialsPage";
import { useApproveDevice, useSession } from "../queries/use-session";

export function DeviceApprovalPage() {
  const [search] = useSearchParams();
  const userCode = search.get("user_code") ?? "";
  const { session, authenticate } = useSession();
  const account = useAccount(session.data === true);
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
  if (session.isPending) {
    return <main className="grid min-h-svh place-items-center">로그인 확인 중…</main>;
  }
  if (!session.data) {
    return (
      <CredentialsPage
        title="기기 승인"
        description={`Obsidian 기기 코드 ${userCode}`}
        error={errorMessage(authenticate.error)}
        onSubmit={(credentials) => authenticate.mutateAsync(credentials)}
      />
    );
  }
  if (account.isPending) {
    return <main className="grid min-h-svh place-items-center">계정 불러오는 중…</main>;
  }
  return (
    <main className="grid min-h-svh place-items-center p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>기기 승인</CardTitle>
          <CardDescription>Obsidian 기기 코드 {userCode}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            {account.data?.displayName || account.data?.email} 계정으로 연결합니다.
          </p>
          <Button disabled={approval.isPending} onClick={() => approval.mutate()}>
            이 기기 승인
          </Button>
          {approval.error && (
            <p className="text-sm text-destructive">{errorMessage(approval.error)}</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
