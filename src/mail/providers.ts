// IMAP settings of the common mail providers, found from the address's domain.

export type AuthKind =
  /** The account password works over IMAP. */
  | 'password'
  /** An app password is required (two-step verification on the account). */
  | 'app-password'
  /** OAuth 2 only: basic authentication is disabled by the provider (not supported yet). */
  | 'oauth';

export interface Provider {
  id: string;
  name: string;
  host: string;
  port: number;
  /** TLS from the start (993). */
  secure: boolean;
  auth: AuthKind;
  /** Where the user creates an app password or enables IMAP. */
  help?: string;
  domains: string[];
}

export const PROVIDERS: Provider[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: 'app-password',
    help: 'https://myaccount.google.com/apppasswords',
    domains: ['gmail.com', 'googlemail.com'],
  },
  {
    id: 'outlook',
    name: 'Outlook.com / Microsoft 365',
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
    auth: 'oauth',
    domains: ['outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr', 'live.com', 'live.fr', 'msn.com'],
  },
  {
    id: 'yahoo',
    name: 'Yahoo',
    host: 'imap.mail.yahoo.com',
    port: 993,
    secure: true,
    auth: 'app-password',
    help: 'https://login.yahoo.com/account/security',
    domains: ['yahoo.com', 'yahoo.fr', 'ymail.com'],
  },
  {
    id: 'icloud',
    name: 'iCloud',
    host: 'imap.mail.me.com',
    port: 993,
    secure: true,
    auth: 'app-password',
    help: 'https://account.apple.com',
    domains: ['icloud.com', 'me.com', 'mac.com'],
  },
  { id: 'orange', name: 'Orange', host: 'imap.orange.fr', port: 993, secure: true, auth: 'password', domains: ['orange.fr', 'wanadoo.fr'] },
  { id: 'free', name: 'Free', host: 'imap.free.fr', port: 993, secure: true, auth: 'password', domains: ['free.fr'] },
  { id: 'sfr', name: 'SFR', host: 'imap.sfr.fr', port: 993, secure: true, auth: 'password', domains: ['sfr.fr', 'neuf.fr'] },
  { id: 'laposte', name: 'La Poste', host: 'imap.laposte.net', port: 993, secure: true, auth: 'password', domains: ['laposte.net'] },
  { id: 'gmx', name: 'GMX', host: 'imap.gmx.net', port: 993, secure: true, auth: 'password', domains: ['gmx.fr', 'gmx.com', 'gmx.net', 'gmx.de'] },
];

/** Provider of an e-mail address, from its domain (null: unknown, settings to enter by hand). */
export function providerOf(address: string): Provider | null {
  const domain = address.trim().toLowerCase().split('@')[1];
  if (!domain) return null;
  return PROVIDERS.find((p) => p.domains.includes(domain)) ?? null;
}
