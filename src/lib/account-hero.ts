export const ACCOUNT_HERO_KEY = "account_hero";

export type AccountHero = {
  image_url: string;
  line1: string;
  line2: string;
  cta_label: string;
  cta_to: string;
};

export const DEFAULT_ACCOUNT_HERO: AccountHero = {
  image_url: "",
  line1: "La ropa pasa,",
  line2: "el estilo permanece.",
  cta_label: "Ver editorial",
  cta_to: "/cuenta/inspiraciones",
};
