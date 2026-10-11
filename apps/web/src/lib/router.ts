import { useEffect, useState } from "react";

export type Page = "landing" | "map" | "compare" | "grid" | "alerts" | "reports" | "methodology" | "eval" | "whatif";
export type Route = { page: Page; company?: string };
const PAGES: Page[] = ["map", "compare", "grid", "alerts", "reports", "methodology", "eval", "whatif"];

export function parse(hash = location.hash): Route {
  const [, page = "", company] = hash.replace(/^#/, "").split("/");
  return { page: (PAGES as string[]).includes(page) ? (page as Page) : "landing", company: company?.toUpperCase() };
}

export function go(page: Page, company?: string) {
  location.hash = page === "landing" ? "/" : `/${page}${company ? `/${company}` : ""}`;
}

export function useRoute(): Route {
  const [r, setR] = useState(parse());
  useEffect(() => {
    const on = () => setR(parse());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return r;
}
