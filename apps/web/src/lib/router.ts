import { useEffect, useState } from "react";

export type Route = { page: "map" | "grid" | "alerts" | "reports" | "methodology" | "eval" | "whatif"; company?: string };

export function parse(hash = location.hash): Route {
  const [, page = "map", company] = hash.replace(/^#/, "").split("/");
  const p = (["map", "grid", "alerts", "reports", "methodology", "eval", "whatif"].includes(page) ? page : "map") as Route["page"];
  return { page: p, company: company?.toUpperCase() };
}

export function go(page: Route["page"], company?: string) {
  location.hash = `/${page}${company ? `/${company}` : ""}`;
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
