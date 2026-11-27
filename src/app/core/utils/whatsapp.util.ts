import type { ClientContacts } from '../models/client.model';

export function createWhatsAppUrl(
  contacts: ClientContacts,
  message: string,
): string | null {
  const phone = [contacts.whatsapp, contacts.phone]
    .map((candidate) => (candidate ?? '').replace(/\D/g, ''))
    .find((candidate) => candidate.length >= 6);
  if (!phone) {
    return null;
  }

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
