import { useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { applyVisitorCountry } from "@/lib/locale";
import { MarcaLogo } from "@/design/storefront/marca-logo";

type VisitorGeo = { country: string; city: string; region: string };

const PRIVATE_PATH = /^\/(admin|pos|b2b|auth|reset-password|cuenta|api)(\/|$)/;
const FLORIDA_CITIES = new Set(["st petersburg", "saint petersburg", "tampa", "sarasota", "clearwater", "bradenton", "lakeland"]);

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

type RegionKey = "ve" | "pr" | "do" | "florida" | "seattle";

const DISTRIBUTORS: Record<"ve" | "pr" | "do" | "florida", { label: string; stores: { name: string; handle: string }[] }> = {
  ve: { label: "Venezuela", stores: [{ name: "Le Mot", handle: "lemotclothing" }, { name: "Zena", handle: "zenaconceptsore" }] },
  pr: { label: "Puerto Rico", stores: [{ name: "Miraé", handle: "miraeconcept" }] },
  do: { label: "República Dominicana", stores: [{ name: "Pineapple Concepts", handle: "pineappleconcepts" }] },
  florida: { label: "St. Petersburg", stores: [{ name: "Zaa Dress Up Studio", handle: "zaadressupstudio" }] },
};

export function restrictedRegionKey({ country, city, region }: VisitorGeo): RegionKey | null {
  const nation = normalize(country);
  if (["ve", "venezuela", "venezuela bolivarian republic of"].includes(nation)) return "ve";
  if (["pr", "puerto rico"].includes(nation)) return "pr";
  if (["do", "dom", "dominican republic", "republica dominicana"].includes(nation)) return "do";
  if (nation !== "us" && nation !== "united states" && nation !== "united states of america") return null;
  const place = normalize(city);
  const state = normalize(region);
  if (place === "seattle") return !state || ["wa", "washington"].includes(state) ? "seattle" : null;
  return FLORIDA_CITIES.has(place) && (!state || ["fl", "florida"].includes(state)) ? "florida" : null;
}

export function isRestrictedRegion(geo: VisitorGeo) {
  return restrictedRegionKey(geo) !== null;
}

export function RegionAccessGate({ children, geo }: { children: ReactNode; geo: VisitorGeo | null }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPublic = !PRIVATE_PATH.test(pathname);

  useEffect(() => {
    if (geo?.country && !["XX", "T1"].includes(geo.country.toUpperCase())) applyVisitorCountry(geo.country);
  }, [geo?.country]);

  const key = geo ? restrictedRegionKey(geo) : null;
  if (isPublic && key) return <RegionAccessPage region={key} />;
  return <>{children}</>;
}

function RegionAccessPage({ region }: { region: RegionKey }) {
  const groups = region === "seattle" ? Object.values(DISTRIBUTORS) : [DISTRIBUTORS[region]];
  return (
    <main className="flex min-h-[100svh] flex-col items-center justify-between bg-ivory px-6 py-10 text-ink">
      <MarcaLogo className="h-10 w-auto text-foreground md:h-12" />
      <div className="w-full max-w-xl text-center">
        <p className="font-nm text-xs uppercase text-moss">Tu Marca</p>
        <h1 className="mt-5 font-nm text-4xl font-medium leading-tight md:text-6xl">Not here, but very close.</h1>
        <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-ink/70">
          In your country, Tu Marca has a home of its own: our official distributors bring you the same collection and the same care, without the international shipping.
        </p>
        <p className="mt-8 font-nm text-xs uppercase tracking-widest text-moss">Find us at:</p>
        <div className="mt-4 space-y-5">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="font-nm text-sm text-ink">{g.label}</p>
              <ul className="mt-1 space-y-1">
                {g.stores.map((st) => (
                  <li key={st.handle} className="text-sm text-ink/70">
                    {st.name} (<a href={`https://instagram.com/${st.handle}`} target="_blank" rel="noreferrer" className="underline hover:text-moss">@{st.handle}</a>)
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col items-center gap-3">
        <a href="/auth?redirect=/b2b" className="font-nm text-xs text-ink/60 underline hover:text-ink">Distributor access</a>
      </div>
    </main>
  );
}
