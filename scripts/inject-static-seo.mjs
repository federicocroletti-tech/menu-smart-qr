import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const assetsRoot = join(root, 'src', 'assets');
const outputPath = join(root, 'dist', 'menu-smart-qr', 'browser', 'index.html');
const config = JSON.parse(
  await readFile(join(assetsRoot, 'app-config.json'), 'utf8'),
);

if (!/^[a-z0-9-]+$/i.test(config.activeClient ?? '')) {
  throw new Error('app-config.json must contain a valid activeClient id.');
}

const client = JSON.parse(
  await readFile(
    join(assetsRoot, 'clients', config.activeClient, 'client.json'),
    'utf8',
  ),
);
const language = client.settings?.defaultLanguage ?? 'it';

function localized(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return '';
  }

  return value[language]
    ?? value.it
    ?? value.en
    ?? Object.values(value).find((entry) => typeof entry === 'string')
    ?? '';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function safeWebUrl(value, field) {
  if (!value) {
    return '';
  }

  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${field} must use HTTP or HTTPS.`);
  }
  return parsed.href;
}

function replaceMeta(html, attribute, name, content) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<meta\\b(?=[^>]*\\b${attribute}=["']${escapedName}["'])[^>]*\\/?>`,
    'gi',
  );
  const replacement = `<meta ${attribute}="${escapeHtml(name)}" content="${escapeHtml(content)}">`;
  return pattern.test(html)
    ? html.replace(pattern, replacement)
    : html.replace('</head>', `    ${replacement}\n  </head>`);
}

let html = await readFile(outputPath, 'utf8');
const title = localized(client.seo?.title) || client.name || 'Menu Smart QR';
const description = localized(client.seo?.description);
const canonicalUrl = safeWebUrl(client.seo?.canonicalUrl, 'seo.canonicalUrl');
const imageUrl = safeWebUrl(
  client.seo?.ogImage ?? client.seo?.imageUrl,
  'seo.ogImage',
);
const locale = { it: 'it_IT', en: 'en_US', fr: 'fr_FR', de: 'de_DE' }[language]
  ?? language;
const pageType = client.type === 'restaurant' || client.type === 'pizzeria'
  ? 'restaurant.restaurant'
  : 'website';

html = html.replace(/<html\b([^>]*)\blang="[^"]*"/i, `<html$1lang="${escapeHtml(language)}"`);
html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
html = replaceMeta(html, 'name', 'description', description);
html = replaceMeta(html, 'name', 'robots', 'index,follow,max-image-preview:large');
html = replaceMeta(html, 'property', 'og:type', pageType);
html = replaceMeta(html, 'property', 'og:locale', locale);
html = replaceMeta(html, 'property', 'og:title', title);
html = replaceMeta(html, 'property', 'og:description', description);
html = replaceMeta(
  html,
  'name',
  'twitter:card',
  imageUrl ? 'summary_large_image' : 'summary',
);
html = replaceMeta(html, 'name', 'twitter:title', title);
html = replaceMeta(html, 'name', 'twitter:description', description);

html = html.replace(
  /<meta\b(?=[^>]*\bproperty=["']og:image["'])[^>]*\/?>/gi,
  '',
);
if (imageUrl) {
  html = replaceMeta(html, 'property', 'og:image', imageUrl);
  html = replaceMeta(html, 'name', 'twitter:image', imageUrl);
} else {
  html = html.replace(
    /<meta\b(?=[^>]*\bname=["']twitter:image["'])[^>]*\/?>/gi,
    '',
  );
}

html = html.replace(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*\/?>/gi, '');
html = html.replace(
  /<meta\b(?=[^>]*\bproperty=["']og:url["'])[^>]*\/?>/gi,
  '',
);
if (canonicalUrl) {
  html = replaceMeta(html, 'property', 'og:url', canonicalUrl);
  html = html.replace(
    '</head>',
    `    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">\n  </head>`,
  );
}

if (client.name && client.contacts?.address) {
  const schemaType = client.type === 'restaurant' || client.type === 'pizzeria'
    ? 'Restaurant'
    : client.type === 'bar'
      ? 'BarOrPub'
      : 'LocalBusiness';
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: client.name,
    description,
    telephone: client.contacts.phone,
    email: client.contacts.email,
    url: canonicalUrl || undefined,
    image: imageUrl || undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: localized(client.contacts.address),
    },
    hasMap: client.contacts.mapsUrl,
    openingHoursSpecification: (client.openingHours ?? []).flatMap((day) =>
      (day.slots ?? []).map((slot) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: day.day,
        opens: slot.open,
        closes: slot.close,
      })),
    ),
    inLanguage: language,
  };
  const jsonLd = JSON.stringify(structuredData)
    .replaceAll('<', '\\u003c');
  html = html.replace(
    /<script\b(?=[^>]*\bid=["']menu-smart-qr-structured-data["'])[^>]*>[\s\S]*?<\/script>/gi,
    '',
  );
  html = html.replace(
    '</head>',
    `    <script id="menu-smart-qr-structured-data" type="application/ld+json">${jsonLd}</script>\n  </head>`,
  );
}

await writeFile(outputPath, html);
console.log(`Static SEO metadata generated for "${config.activeClient}" (${language}).`);
