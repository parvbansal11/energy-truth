import { useEffect } from "react";
import { EvidenceDrawer } from "./components/EvidenceDrawer";
import { TopBar } from "./components/TopBar";
import { AppProvider, useApp } from "./lib/store";
import { parse, useRoute } from "./lib/router";
import { AlertsPage } from "./pages/AlertsPage";
import { ChronosEval } from "./pages/ChronosEval";
import { GridDesk } from "./pages/GridDesk";
import { MapPage } from "./pages/MapPage";
import { MethodologyPage } from "./pages/MethodologyPage";
import { ReportStudio } from "./pages/ReportStudio";
import { WhatIf } from "./pages/WhatIf";

function Shell() {
  const route = useRoute();
  const { openEvidence, selected, select, companies } = useApp();
  useEffect(() => { openEvidence(null); window.scrollTo(0, 0); }, [route.page, openEvidence]);
  useEffect(() => {
    if (route.company && route.company !== selected && companies.some((c) => c.symbol === route.company)) select(route.company);
  }, [route.company, companies]);
  return (
    <>
      <TopBar route={route} />
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
  return (
    <AppProvider initialCompany={parse().company}>
      <Shell />
    </AppProvider>
  );
}
