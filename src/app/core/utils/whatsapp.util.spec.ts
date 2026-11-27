import { createWhatsAppUrl } from './whatsapp.util';

describe('createWhatsAppUrl', () => {
  it('uses the same WhatsApp-first, phone-fallback recipient policy', () => {
    expect(
      createWhatsAppUrl(
        { whatsapp: '+39 333 1234567', phone: '+39 02 1234567' },
        'Hello there',
      ),
    ).toBe('https://wa.me/393331234567?text=Hello%20there');
    expect(
      createWhatsAppUrl({ phone: '+39 02 1234567' }, 'Hello there'),
    ).toBe('https://wa.me/39021234567?text=Hello%20there');
    expect(
      createWhatsAppUrl(
        { whatsapp: '123', phone: '+39 02 1234567' },
        'Hello there',
      ),
    ).toBe('https://wa.me/39021234567?text=Hello%20there');
    expect(createWhatsAppUrl({ whatsapp: '123' }, 'Hello there')).toBeNull();
  });
});
