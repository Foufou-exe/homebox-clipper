import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ERROR_CODES } from '@/shared/errors';
import { IDENTICAL_OK, loadCatalog, makeGetMessage } from './i18n-harness';

const catalog = loadCatalog('fr');
const en = loadCatalog('en');

const subs = (v: string) => [...new Set(v.match(/\$[1-9]/g) ?? [])].sort();

describe('en.yml / fr.yml catalog parity (step B)', () => {
  it('same set of keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(catalog).sort());
  });

  it('same set of $n substitutions for each key', () => {
    for (const key of Object.keys(catalog)) expect(subs(en[key] ?? ''), key).toEqual(subs(catalog[key]!));
  });

  it('no empty value or identical text outside IDENTICAL_OK', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value.trim(), key).not.toBe('');
      if (!IDENTICAL_OK.includes(key)) expect(value, `${key} identical to fr`).not.toBe(catalog[key]);
    }
  });

  it('each IDENTICAL_OK entry exists and is indeed identical (up-to-date list)', () => {
    for (const key of IDENTICAL_OK) {
      expect(en, key).toHaveProperty([key]);
      expect(en[key], key).toBe(catalog[key]);
    }
  });

  it('no accented character in en.yml', () => {
    for (const [key, value] of Object.entries(en)) expect(value, key).not.toMatch(/[À-ÖØ-öø-ÿ]/);
  });

  // 006: the template gains the store ($1) before the order number ($2). The text rendered for Amazon.fr
  // is unchanged (test below); this raw-template assertion is the only one adapted (SC-007).
  it('HomeBox note: the English summary.orderNote contains $1 (store) and $2 (order number)', () => {
    expect(en['summary.orderNote']).toBe('$1 order: $2');
  });
});

describe('catalogue fr.yml (contracts/locales.md)', () => {
  it('no empty value', () => {
    for (const [key, value] of Object.entries(catalog)) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('an error.<CODE> key for each ErrorCode', () => {
    for (const code of ERROR_CODES) expect(catalog, code).toHaveProperty([`error.${code}`]);
  });

  it('the six photo and location codes have a message, all distinct (SC-007)', () => {
    const codes = [
      'PHOTO_UNAVAILABLE',
      'PHOTO_NOT_IMAGE',
      'PHOTO_TOO_LARGE',
      'PHOTO_UPLOAD_FAILED',
      'LOCATIONS_UNAVAILABLE',
      'LOCATION_NOT_FOUND',
    ];
    const messages = codes.map((code) => {
      expect(ERROR_CODES, code).toContain(code);
      expect(catalog, code).toHaveProperty([`error.${code}`]);
      return catalog[`error.${code}`];
    });
    expect(new Set(messages).size).toBe(codes.length);
  });

  it('extName and extDescription exist (manifest)', () => {
    expect(catalog).toHaveProperty('extName');
    expect(catalog).toHaveProperty('extDescription');
  });

  it('every literal key passed to t() / getMessage() in src/ exists', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|vue)$/.test(name)) files.push(path);
      }
    };
    walk(resolve(__dirname, '../../src'));
    const call = /\b(?:t|getMessage)\(\s*(['"`])([\w.]+)\1/g;
    for (const file of files) {
      for (const [, , key] of readFileSync(file, 'utf8').matchAll(call)) {
        expect(catalog, `${file} : ${key}`).toHaveProperty([key!]);
        expect(en, `en : ${file} : ${key}`).toHaveProperty([key!]);
      }
    }
  });
});

describe('project links keys (004, FR-009, FR-010, SC-005)', () => {
  const keys = ['links.support', 'links.github', 'links.supportAria', 'links.githubAria', 'options.helpTitle', 'options.helpIntro'];

  it.each(keys)('%s exists in en.yml and fr.yml', (key) => {
    expect(en).toHaveProperty([key]);
    expect(catalog).toHaveProperty([key]);
  });

  it.each([
    ['en', en, 'new tab'],
    ['fr', catalog, 'nouvel onglet'],
  ] as const)('%s: accessible names start with the visible label and mention the new tab (WCAG 2.5.3)', (_l, cat, tab) => {
    expect(cat['links.supportAria']!.startsWith(cat['links.support']!)).toBe(true);
    expect(cat['links.githubAria']!.startsWith(cat['links.github']!)).toBe(true);
    expect(cat['links.supportAria']).toContain(tab);
    expect(cat['links.githubAria']).toContain(tab);
  });
});

describe('store of origin in the HomeBox texts (006, contracts/ui-messages.md)', () => {
  const render = (cat: Record<string, string>, key: string, subs: string[]) => makeGetMessage(cat)(key, subs);

  it('Amazon.fr: rendered text identical to the former one (SC-007)', () => {
    expect(render(en, 'summary.orderNote', ['Amazon.fr', '999-0000000-0000001'])).toBe('Amazon.fr order: 999-0000000-0000001');
    expect(render(catalog, 'summary.orderNote', ['Amazon.fr', '999-0000000-0000001'])).toBe(
      'Commande Amazon.fr : 999-0000000-0000001',
    );
    expect(render(en, 'summary.defaultDescription', ['Amazon.fr', '22 October 2026'])).toBe('Purchased on Amazon.fr on 22 October 2026');
    expect(render(catalog, 'summary.defaultDescription', ['Amazon.fr', '22/10/2026'])).toBe('Acheté sur Amazon.fr le 22/10/2026');
    expect(render(en, 'summary.defaultDescriptionNoDate', ['Amazon.fr'])).toBe('Purchased on Amazon.fr');
    expect(render(catalog, 'summary.defaultDescriptionNoDate', ['Amazon.fr'])).toBe('Acheté sur Amazon.fr');
  });

  it('exact templates', () => {
    expect([en['summary.orderNote'], catalog['summary.orderNote']]).toEqual(['$1 order: $2', 'Commande $1 : $2']);
    expect([en['summary.defaultDescription'], catalog['summary.defaultDescription']]).toEqual([
      'Purchased on $1 on $2',
      'Acheté sur $1 le $2',
    ]);
    expect([en['summary.defaultDescriptionNoDate'], catalog['summary.defaultDescriptionNoDate']]).toEqual([
      'Purchased on $1',
      'Acheté sur $1',
    ]);
    expect([en['summary.orderNoteNoStore'], catalog['summary.orderNoteNoStore']]).toEqual(['Order: $1', 'Commande : $1']);
  });
});

describe('currency warning without conversion (006, US2, FR-006)', () => {
  it('exact texts', () => {
    expect(en['fields.currencyWarning']).toBe('Detected currency: $1. HomeBox will store the amount as is, without conversion.');
    expect(catalog['fields.currencyWarning']).toBe(
      'Devise détectée : $1. HomeBox enregistrera le montant tel quel, sans conversion.',
    );
  });

  it('same substitution in both languages', () => {
    expect(subs(en['fields.currencyWarning']!)).toEqual(['$1']);
    expect(subs(catalog['fields.currencyWarning']!)).toEqual(['$1']);
  });
});

describe('list of the stores (006, US3, FR-012, FR-016)', () => {
  it.each(['summary.supportedStores', 'summary.storeTesting', 'summary.reportHint'])('%s in both catalogs', (key) => {
    expect(en).toHaveProperty([key]);
    expect(catalog).toHaveProperty([key]);
    expect(subs(en[key]!)).toEqual(subs(catalog[key]!));
  });

  it('exact texts (contracts/ui-messages.md)', () => {
    expect(en['summary.supportedStores']).toBe('The import works on the order details page of these Amazon stores: $1.');
    expect(catalog['summary.supportedStores']).toBe(
      "L'import fonctionne sur la page de détails d'une commande de ces boutiques Amazon : $1.",
    );
    expect([en['summary.storeTesting'], catalog['summary.storeTesting']]).toEqual(['$1 (testing)', '$1 (en test)']);
    expect(en['summary.reportHint']).toBe(
      'Page not detected correctly? Report it with the Support link below. Do not attach the page: it contains your personal data.',
    );
    expect(catalog['summary.reportHint']).toBe(
      'Page mal détectée ? Signalez-la avec le lien Support ci-dessous. Ne joignez pas la page : elle contient vos données personnelles.',
    );
  });

  it('no store list written in the catalogs (adding a store needs no translation)', () => {
    for (const cat of [en, catalog]) {
      for (const [key, value] of Object.entries(cat)) {
        expect(value, key).not.toMatch(/Amazon\.(?:de|es|it|nl|co\.uk|com)\b/);
      }
    }
  });
});

describe('import history keys (012, contracts/ui.md, Q-U24)', () => {
  const US1 = [
    'history.openAria',
    'history.openTitle',
    'history.title',
    'history.back',
    'history.intro',
    'history.empty',
    'history.disabledNotice',
    'history.loadError',
    'history.orderGroup',
    'history.manualStore',
    'history.importedOn',
    'history.purchasedOn',
    'history.otherInstance',
    'history.status.running',
    'history.status.complete',
    'history.status.partial',
    'history.status.failed',
    'history.openItemAria',
    'history.locked',
    'history.lockedHint',
    'history.unlock',
    'history.lockedOptionsHint',
    'history.unavailable',
  ];

  it('the 23 keys of US1 exist in en.yml and fr.yml with the same $n', () => {
    expect(US1).toHaveLength(23);
    for (const key of US1) {
      expect(en, key).toHaveProperty([key]);
      expect(catalog, key).toHaveProperty([key]);
      expect(subs(en[key]!), key).toEqual(subs(catalog[key]!));
    }
  });

  it('exact texts of contracts/ui.md (sample, substitutions)', () => {
    expect([en['history.orderGroup'], catalog['history.orderGroup']]).toEqual(['Order $1 · $2', 'Commande $1 · $2']);
    expect([en['history.openItemAria'], catalog['history.openItemAria']]).toEqual([
      'Open $1 in HomeBox (new tab)',
      'Ouvrir $1 dans HomeBox (nouvel onglet)',
    ]);
    expect([en['history.locked'], catalog['history.locked']]).toEqual(['History locked', 'Historique verrouillé']);
    expect([en['history.status.failed'], catalog['history.status.failed']]).toEqual(['Failed', 'Échoué']);
    expect([en['history.importedOn'], catalog['history.importedOn']]).toEqual(['Imported on $1', 'Importé le $1']);
    expect([en['history.otherInstance'], catalog['history.otherInstance']]).toEqual([
      'Imported to another HomeBox instance ($1): no link.',
      'Importé vers une autre instance HomeBox ($1) : pas de lien.',
    ]);
  });
});

describe('import history keys, incomplete imports (012, US2)', () => {
  const US2 = [
    'history.missingPrefix',
    'history.missing.details',
    'history.missing.invoice',
    'history.missing.documents',
    'history.missing.photo',
    'history.listSeparator',
    'history.reason',
    'history.resumable',
  ];

  it('the 8 keys exist in en.yml and fr.yml with the same $n', () => {
    for (const key of US2) {
      expect(en, key).toHaveProperty([key]);
      expect(catalog, key).toHaveProperty([key]);
      expect(subs(en[key]!), key).toEqual(subs(catalog[key]!));
    }
  });

  it('exact texts of contracts/ui.md', () => {
    expect([en['history.missingPrefix'], catalog['history.missingPrefix']]).toEqual(['Missing: $1', 'Manquant : $1']);
    expect([en['history.missing.invoice'], catalog['history.missing.invoice']]).toEqual(['invoice not sent', 'facture non envoyée']);
    expect([en['history.listSeparator'], catalog['history.listSeparator']]).toEqual([', ', ', ']);
    expect([en['history.reason'], catalog['history.reason']]).toEqual(['Reason: $1', 'Raison : $1']);
    expect(IDENTICAL_OK).toContain('history.listSeparator');
  });
});

describe('import history keys, controlling the data (012, US3)', () => {
  const US3 = [
    'history.delete',
    'history.deleteAria',
    'history.deleted',
    'history.clearAll',
    'history.clearConfirm',
    'history.clearConfirmYes',
    'history.cancel',
    'history.cleared',
    'options.historyTitle',
    'options.historyEnable',
    'options.historyHelp',
    'options.historyResetNotice',
    'options.historyDisableConfirm',
    'options.historyDisableYes',
    'options.historyKeep',
    'options.historyDisabled',
  ];

  it('the 16 keys exist in en.yml and fr.yml with the same $n', () => {
    expect(US3).toHaveLength(16);
    for (const key of US3) {
      expect(en, key).toHaveProperty([key]);
      expect(catalog, key).toHaveProperty([key]);
      expect(subs(en[key]!), key).toEqual(subs(catalog[key]!));
    }
  });

  it('the 2 modified keys mention the import history', () => {
    expect(en['options.passphraseHelpNew']).toMatch(/delete the settings and start over \(the import history will be erased too\)\.$/);
    expect(catalog['options.passphraseHelpNew']).toMatch(/supprimez la configuration et recommencez \(l’historique des imports sera aussi effacé\)\.$/);
    expect(en['options.confirmDelete']).toBe("Delete this extension's HomeBox settings (address and API key) and the import history?");
    expect(catalog['options.confirmDelete']).toBe(
      'Supprimer la configuration HomeBox (adresse et clé API) de cette extension et l’historique des imports ?',
    );
  });

  // ADAPTED (007): +3 `history.missing.*` keys (manual, warranty, deliveryNote) required by the spec: 47 → 50.
  it('50 history keys added in total (23 + 8 + 16 + 3 of spec 007)', () => {
    const added = Object.keys(en).filter((k) => k.startsWith('history.') || /^options\.history/.test(k));
    expect(added).toHaveLength(50);
    expect(Object.keys(catalog).filter((k) => k.startsWith('history.') || /^options\.history/.test(k))).toHaveLength(50);
  });
});

describe('generic error texts (007, FR-009, FR-012, R3)', () => {
  const keys = ['error.ATTACHMENT_FAILED', 'error.DOWNLOAD_REFUSED', 'error.INVOICE_UNAVAILABLE'];

  it('no mention of the invoice in the three texts', () => {
    for (const k of keys) {
      expect(catalog[k], k).not.toMatch(/facture/i);
      expect(en[k], k).not.toMatch(/invoice/i);
    }
  });

  it('exact texts', () => {
    expect(catalog['error.ATTACHMENT_FAILED']).toBe("L'objet a été créé mais l'envoi d'un document a échoué.");
    expect(catalog['error.DOWNLOAD_REFUSED']).toBe('Le téléchargement du document a été refusé (session Amazon expirée ?).');
    expect(catalog['error.INVOICE_UNAVAILABLE']).toBe("Le document n'est pas encore disponible pour cette commande.");
    expect(en['error.ATTACHMENT_FAILED']).toBe('The item was created but sending a document failed.');
    expect(en['error.DOWNLOAD_REFUSED']).toBe('The document download was refused (Amazon session expired?).');
    expect(en['error.INVOICE_UNAVAILABLE']).toBe('The document is not available yet for this order.');
  });

  it('NOT_A_PDF and FILE_TOO_LARGE are unchanged and do not mention the invoice', () => {
    for (const k of ['error.NOT_A_PDF', 'error.FILE_TOO_LARGE']) {
      expect(catalog[k], k).not.toMatch(/facture/i);
      expect(en[k], k).not.toMatch(/invoice/i);
    }
  });
});

describe('document types keys (007, Q-U18, FR-012)', () => {
  const ADDED = [
    'documents.manual',
    'documents.warranty',
    'documents.deliveryNote',
    'documents.kindFor',
    'documents.deliveryNotePrefix',
    'documents.storedAsAttachment',
    'documents.sendFailed.invoice',
    'documents.sendFailed.manual',
    'documents.sendFailed.warranty',
    'documents.sendFailed.deliveryNote',
    'documents.sendFailed.orderDocument',
    'result.withDocument.invoice',
    'result.withDocument.manual',
    'result.withDocument.warranty',
    'result.withDocument.deliveryNote',
    'result.withDocument.orderDocument',
    'history.missing.manual',
    'history.missing.warranty',
    'history.missing.deliveryNote',
  ];

  it('the 19 added keys exist in en and fr with the same substitutions, no accent in en', () => {
    expect(ADDED).toHaveLength(19);
    for (const key of ADDED) {
      expect(catalog, key).toHaveProperty([key]);
      expect(en, key).toHaveProperty([key]);
      expect(subs(en[key]!), key).toEqual(subs(catalog[key]!));
      expect(en[key], key).not.toMatch(/[À-ÖØ-öø-ÿ]/);
    }
  });

  it('exact texts of the main keys', () => {
    expect(catalog['documents.manual']).toBe('Manuel');
    expect(catalog['documents.warranty']).toBe('Garantie');
    expect(catalog['documents.deliveryNote']).toBe('Bon de livraison');
    expect(en['documents.deliveryNote']).toBe('Delivery note');
    expect(catalog['documents.deliveryNotePrefix']).toBe('bon-de-livraison-');
    expect(en['documents.deliveryNotePrefix']).toBe('delivery-note-');
    expect(catalog['documents.sendFailed.manual']).toBe("Le manuel n'a pas pu être envoyé.");
    expect(en['documents.sendFailed.manual']).toBe('The manual could not be sent.');
    expect(catalog['documents.storedAsAttachment']).toBe(
      "« $1 » : votre instance HomeBox n'a pas pris en charge le type « $2 », le document a été joint comme pièce jointe simple.",
    );
    expect(catalog['history.missing.manual']).toBe('manuel non envoyé');
    expect(en['history.missing.deliveryNote']).toBe('delivery note not sent');
  });

  it('modified keys', () => {
    expect(catalog['recovery.retryInvoice']).toBe("Réessayer l'envoi des documents");
    expect(en['recovery.retryInvoice']).toBe('Retry the document upload');
    expect(catalog['result.stepDocument']).toBe('$1 ($2) : $3');
    expect(en['result.stepDocument']).toBe('$1 ($2): $3');
  });

  it('result.withInvoice is removed; documents.orderDocument is unchanged (clarification 1)', () => {
    expect(catalog).not.toHaveProperty(['result.withInvoice']);
    expect(en).not.toHaveProperty(['result.withInvoice']);
    expect(catalog['documents.orderDocument']).toBe('Bon de commande');
    expect(en['documents.orderDocument']).toBe('Order document');
  });
});

describe('warranty keys (011, Q-U19, FR-009)', () => {
  const KEYS = [
    'title',
    'origin.legal',
    'origin.page',
    'origin.user',
    'edited',
    'expires',
    'expiresFor',
    'lifetime',
    'lifetimeFor',
    'lifetimeDetails',
    'details',
    'detailsFor',
    'noPurchaseDate',
    'expired',
    'help',
    'none',
    'reason.seller',
    'reason.country',
    'reason.disabled',
    'add',
    'addFor',
    'remove',
    'removeFor',
    'added',
    'removed',
    'duration.one',
    'duration.other',
    'detail.legal',
    'detail.fallback',
    'detail.withPage',
    'errors.dateInvalid',
    'errors.detailsTooLong',
    'settings.title',
    'settings.intro',
    'settings.enable',
    'settings.years',
    'settings.help',
    'settings.saved',
    'settings.yearsInvalid',
    'settings.saveFailed',
  ].map((k) => `warranty.${k}`);

  it('the 40 keys exist in en and fr with the same substitutions, no accent in en', () => {
    expect(KEYS).toHaveLength(40);
    expect(Object.keys(catalog).filter((k) => k.startsWith('warranty.'))).toHaveLength(40);
    for (const key of KEYS) {
      expect(catalog, key).toHaveProperty([key]);
      expect(en, key).toHaveProperty([key]);
      expect(subs(en[key]!), key).toEqual(subs(catalog[key]!));
      expect(en[key], key).not.toMatch(/[À-ÖØ-öø-ÿ]/);
    }
  });

  it('no warranty key is declared identical in both languages', () => {
    expect(IDENTICAL_OK.filter((k) => k.startsWith('warranty.'))).toEqual([]);
    for (const key of KEYS) expect(en[key], key).not.toBe(catalog[key]);
  });

  it('exact texts of the main keys', () => {
    const render = (cat: Record<string, string>, key: string, s: string[]) => makeGetMessage(cat)(key, s);
    expect(catalog['warranty.detail.legal']).toBe('Garantie légale de conformité ($1)');
    expect(en['warranty.detail.legal']).toBe('Legal guarantee of conformity ($1)');
    expect(render(catalog, 'warranty.detail.legal', [render(catalog, 'warranty.duration.other', ['2'])])).toBe(
      'Garantie légale de conformité (2 ans)',
    );
    expect(catalog['warranty.none']).toBe('Aucune garantie ne sera enregistrée.');
    expect(catalog['warranty.add']).toBe('Ajouter une garantie');
    expect(catalog['warranty.remove']).toBe('Retirer la garantie');
    expect(catalog['warranty.reason.seller']).toBe('Aucune garantie légale proposée : le vendeur n’est pas la boutique elle-même (place de marché).');
    expect(catalog['warranty.reason.country']).toBe('Aucune garantie légale proposée : la durée légale du pays de cette boutique n’est pas vérifiée dans l’extension.');
    expect(catalog['warranty.reason.disabled']).toBe('Aucune garantie par défaut : elle est désactivée dans la configuration.');
    expect(en['warranty.reason.disabled']).toBe('No default warranty: it is turned off in the settings.');
  });

  it('the help texts say "indicative" and "without legal force"', () => {
    for (const key of ['warranty.help', 'warranty.settings.help']) {
      expect(catalog[key], key).toMatch(/indicati/);
      expect(catalog[key], key).toContain('sans valeur juridique');
      expect(en[key], key).toMatch(/ndicative/);
      expect(en[key], key).toContain('no legal force');
    }
  });
});

describe('automatic lock keys (013, contracts/ui.md, FR-020, T021)', () => {
  const LOCK: Record<string, [string, string]> = {
    'lock.settings.title': ['Automatic lock', 'Verrouillage automatique'],
    'lock.settings.intro': [
      'Choose when the extension asks for your passphrase again.',
      'Choisissez quand l’extension vous redemande votre phrase de passe.',
    ],
    'lock.settings.legend': ['Lock the extension', 'Verrouiller l’extension'],
    'lock.policy.browserClose': ['When the browser closes (default)', 'À la fermeture du navigateur (par défaut)'],
    'lock.policy.idle15m': ['After 15 minutes of inactivity', 'Après 15 minutes d’inactivité'],
    'lock.policy.idle1h': ['After 1 hour of inactivity', 'Après 1 heure d’inactivité'],
    'lock.policy.idle4h': ['After 4 hours of inactivity', 'Après 4 heures d’inactivité'],
    'lock.policy.everyOpen': ['Every time the extension is opened', 'À chaque ouverture de l’extension'],
    'lock.settings.whyNoNever': [
      'There is no “never” option: the decrypted key would then be readable by anyone or any software with access to your browser profile. Whatever you choose, the key is forgotten when the browser closes, and you can lock the extension at any time with the lock button.',
      'Il n’y a pas d’option « jamais » : la clé déchiffrée serait alors lisible par toute personne ou tout logiciel ayant accès à votre profil de navigateur. Quel que soit votre choix, la clé est oubliée à la fermeture du navigateur, et vous pouvez verrouiller l’extension à tout moment avec le bouton cadenas.',
    ],
    'lock.settings.inactivityHelp': [
      'Inactivity means not using the extension (popup, settings, import). An import in progress is never interrupted: the lock applies once it ends.',
      'L’inactivité correspond à l’absence d’utilisation de l’extension (popup, configuration, import). Un import en cours n’est jamais interrompu : le verrouillage s’applique à sa fin.',
    ],
    'lock.settings.saved': ['Lock setting saved.', 'Réglage de verrouillage enregistré.'],
    'lock.settings.saveFailed': ['The lock setting could not be saved.', 'Le réglage de verrouillage n’a pas pu être enregistré.'],
  };

  it('the 12 lock.* keys have the exact texts of contracts/ui.md', () => {
    expect(Object.keys(LOCK)).toHaveLength(12);
    for (const [key, [enText, frText]] of Object.entries(LOCK)) {
      expect(en[key], key).toBe(enText);
      expect(catalog[key], key).toBe(frText);
    }
  });

  it('exactly 12 lock.* keys in each catalog', () => {
    expect(Object.keys(en).filter((k) => k.startsWith('lock.'))).toHaveLength(12);
    expect(Object.keys(catalog).filter((k) => k.startsWith('lock.'))).toHaveLength(12);
  });

  it('options.unlockedHint no longer says "for this browser session"', () => {
    expect(en['options.unlockedHint']).toBe('until it locks (see “Automatic lock”).');
    expect(catalog['options.unlockedHint']).toBe('jusqu’au prochain verrouillage (voir « Verrouillage automatique »).');
  });

  it('options.passphraseHelpNew says the passphrase is requested at each lock, not once per session', () => {
    expect(en['options.passphraseHelpNew']).toContain(
      'requested again each time the extension locks (when the browser closes, by default)',
    );
    expect(catalog['options.passphraseHelpNew']).toContain(
      'vous sera redemandée à chaque verrouillage (à la fermeture du navigateur, par défaut)',
    );
    expect(en['options.passphraseHelpNew']).not.toContain('once per browser session');
    expect(catalog['options.passphraseHelpNew']).not.toContain('une fois par session du navigateur');
  });
});

describe('update keys (013, contracts/ui.md, FR-020, T040)', () => {
  const UPDATE: Record<string, [string, string]> = {
    'update.notice': ['Updated to v$1.', 'Mise à jour vers v$1.'],
    'update.notesLink': ['See what’s new', 'Voir les nouveautés'],
    'update.notesAria': ['See what’s new in v$1 on GitHub (new tab)', 'Voir les nouveautés de la v$1 sur GitHub (nouvel onglet)'],
    'update.dismissAria': ['Close the update notice', 'Fermer l’annonce de mise à jour'],
    'update.ready': ['Version $1 is ready to install.', 'La version $1 est prête à être installée.'],
    'update.applyButton': ['Update now', 'Mettre à jour maintenant'],
    'update.applyHelp': [
      'The extension restarts, then asks for your passphrase again.',
      'L’extension redémarre, puis vous redemande votre phrase de passe.',
    ],
    'update.blocked': [
      'Available once the current import is finished, resumed or abandoned.',
      'Disponible une fois l’import en cours terminé, repris ou abandonné.',
    ],
  };

  it('the 8 update.* keys have the exact texts of contracts/ui.md and the same substitutions', () => {
    expect(Object.keys(UPDATE)).toHaveLength(8);
    for (const [key, [enText, frText]] of Object.entries(UPDATE)) {
      expect(en[key], key).toBe(enText);
      expect(catalog[key], key).toBe(frText);
      expect(subs(en[key]!), key).toEqual(subs(catalog[key]!));
    }
  });

  it('exactly 8 update.* keys in each catalog', () => {
    expect(Object.keys(en).filter((k) => k.startsWith('update.'))).toHaveLength(8);
    expect(Object.keys(catalog).filter((k) => k.startsWith('update.'))).toHaveLength(8);
  });
});

describe('version label and final count (013, contracts/ui.md, FR-020, T055)', () => {
  it('links.version = "Version $1" in en and fr', () => {
    expect(en['links.version']).toBe('Version $1');
    expect(catalog['links.version']).toBe('Version $1');
  });

  it('21 keys added by the feature (12 lock + 8 update + 1 version), parity of the whole catalog', () => {
    const added = Object.keys(en).filter((k) => k.startsWith('lock.') || k.startsWith('update.') || k === 'links.version');
    expect(added).toHaveLength(21);
    expect(Object.keys(catalog).filter((k) => k.startsWith('lock.') || k.startsWith('update.') || k === 'links.version')).toHaveLength(21);
    expect(Object.keys(en).sort()).toEqual(Object.keys(catalog).sort());
  });
});
