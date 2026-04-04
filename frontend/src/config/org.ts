/**
 * Organization configuration — change this file to rebrand for a different club.
 * In the future this can be loaded from env vars or a backend endpoint.
 */
export interface OrgConfig {
  name: string
  shortName: string
  logoUrl: string
  primaryColor: string
  accentColor: string
  website?: string
  activeTournamentSlug: string | null
}

const config: OrgConfig = {
  name: "Rugby Livorno 1931",
  shortName: "Rugby Livorno",
  logoUrl: "https://www.rugbylivorno1931.com/wp-content/uploads/2015/06/LogoRugbyLivorno1.png",
  primaryColor: "#1a1a2e",
  accentColor: "#c0392b",
  website: "https://www.rugbylivorno1931.com",
  activeTournamentSlug: null,
}

export default config
