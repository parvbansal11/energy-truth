import { useEffect, useState } from "react";
import { ConsoleBar } from "./components/ConsoleBar";
import { EvidenceDrawer } from "./components/EvidenceDrawer";
import { readSession, signOut, type Session } from "./lib/auth";
import { go, parse, useRoute } from "./lib/router";
import { AppProvider, useApp } from "./lib/store";
import { AlertsPage } from "./pages/AlertsPage";
import { ChronosEval } from "./pages/ChronosEval";
import { GridDesk } from "./pages/GridDesk";
import { Landing } from "./pages/Landing";
import { MapPage } from "./pages/MapPage";
import { MethodologyPage } from "./pages/MethodologyPage";
import { ReportStudio } from "./pages/ReportStudio";
import { WhatIf } from "./pages/WhatIf";

function Console({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const route = useRoute();
  const { openEvidence, selected, select, companies } = useApp();
  useEffect(() => { openEvidence(null); window.scrollTo(0, 0); }, [route.page, openEvidence]);
  useEffect(() => {
    if (route.company && route.company !== selected && companies.some((c) => c.symbol === route.company)) select(route.company);
  }, [route.company, companies]);
  return (
    <>
      <ConsoleBar route={route} session={session} onSignOut={onSignOut} />
      {route.page === "map" && <MapPage />}
      {route.page === "grid" && <GridDesk />}
      {route.page === "whatif" && <WhatIf company={route.company} />}
      {route.page === "alerts" && <AlertsPage />}
      {route.page === "reports" && <ReportStudio />}
      {route.page === "eval" && <ChronosEval />}
      {route.page === "methodology" && <MethodologyPage />}
      <EvidenceDrawer />
    </>
  );
}

export default function App() {
  const route = useRoute();
  const [session, setSession] = useState<Session | null>(readSession);
  // signed-out users always see the landing page; signed-in users skip it
  useEffect(() => {
    if (!session && route.page !== "landing") go("landing");
    if (session && route.page === "landing") go("map");
  }, [session, route.page]);
  if (!session || route.page === "landing") return <Landing onSignedIn={(s) => { setSession(s); go("map"); }} />;
  return (
    <AppProvider initialCompany={parse().company}>
      <Console session={session} onSignOut={() => { signOut(); setSession(null); }} />
    </AppProvider>
  );
}
