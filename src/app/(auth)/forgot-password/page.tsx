import { ForgotPasswordForm } from "@/components/layout/forgot-password-form";

export const metadata = { title: "パスワード再設定" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <ForgotPasswordForm />
    </div>
  );
}
