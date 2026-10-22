import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createHomeBoxClient } from '@/background/homebox/client';
import { createOrchestrator } from '@/background/import/orchestrator';
import { pendingStore } from '@/background/import/pending-store';
import { ok } from '@/shared/errors';
import { PDF_B64, draft } from '../contract/orchestrator-harness';
import { json, mockFetch } from '../contract/fetch-mock';

const KEY = 'hb_super_secret_key_9876';
const SENSITIVE = [KEY, 'Clavier sans fil Exemple Pro', '999-0000000-0000001', '99.99', '99,99'];

describe('confidentialité des journaux (SC-004, principe I)', () => {
  it("aucune sortie console ne contient la clé ni les données d'achat", async () => {
    fakeBrowser.reset();
    const spies = (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => undefined),
    );
    const m = mockFetch(
      json(201, { id: 'e1', name: 'Clavier sans fil Exemple Pro' }),
      json(500, { error: 'Clavier sans fil Exemple Pro 999-0000000-0000001' }),
      json(500, {}),
    );
    const orchestrator = createOrchestrator({
      client: createHomeBoxClient({ baseUrl: 'https://homebox.example.com', apiKey: KEY, fetchImpl: m.fetch }),
      store: pendingStore,
      downloadDetected: async () => ok({ base64: PDF_B64 }),
      notify: () => undefined,
      newId: () => 'p1',
    });

    const r = await orchestrator.startImport(1, [draft()], []);
    expect(r.ok && r.value[0]?.status).toBe('partial');

    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(output.length).toBeGreaterThan(2); // le logger a bien été appelé
    for (const value of SENSITIVE) expect(output).not.toContain(value);
  });

  it("l'en-tête Authorization n'est envoyé qu'à l'instance HomeBox", async () => {
    const m = mockFetch(json(201, { id: 'e1', name: 'x' }));
    await createHomeBoxClient({ baseUrl: 'https://homebox.example.com', apiKey: KEY, fetchImpl: m.fetch }).createEntity({
      name: 'x',
    });
    for (const call of m.calls) {
      expect(call.url.startsWith('https://homebox.example.com/')).toBe(true);
    }
  });
});
