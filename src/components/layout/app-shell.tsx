import { Sidebar } from "./sidebar";
import { BottomNav } from "./bottom-nav";
import { TopHeader } from "./top-header";
import { MedicalDisclaimerBanner, MedicalDisclaimerFooter } from "./medical-disclaimer";
import { ChildModeNotice } from "@/components/health/child-mode-notice";
import type { ProfileKind } from "@/types/domain";

/**
 * Authenticated application shell: disclaimer banner, desktop sidebar, mobile
 * header + bottom navigation, and the persistent footer reminder.
 */
export function AppShell({
  children,
  userName,
  emergencyNumber,
  profileKind,
}: {
  children: React.ReactNode;
  userName: string;
  emergencyNumber: string;
  profileKind: ProfileKind;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-4 focus:py-2 focus:text-brand-800 focus:shadow-lg"
      >
        Skip to main content
      </a>
      <MedicalDisclaimerBanner />
      <div className="mx-auto flex w-full max-w-[110rem] gap-0">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopHeader userName={userName} emergencyNumber={emergencyNumber} />
          <main
            id="main-content"
            className="mx-auto w-full max-w-7xl flex-1 px-3 pb-28 pt-5 sm:px-5 md:pb-12 lg:px-8"
          >
            {profileKind === "CHILD" && <ChildModeNotice />}
            {children}
            <MedicalDisclaimerFooter />
          </main>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
