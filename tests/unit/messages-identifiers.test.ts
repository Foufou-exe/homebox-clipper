import { isMessage } from '@/shared/messages';
import type { ImportDraft } from '@/shared/types';
import { draft } from '../contract/orchestrator-harness';

/** Spec 027 (contracts/runtime-messages.md): validation of `ImportDraft.identifiers`. Fixed values only. */
const start = (d: unknown) => ({
  type: 'import/start',
  instanceId: 'inst-a',
  tabId: 1,
  manualFiles: [],
  drafts: [d],
});
const template = {
  id: 'tpl-1',
  name: 'Modèle fictif',
  fingerprint: 'a'.repeat(64),
  insured: false,
  manufacturer: '',
  modelNumber: '',
  fields: [],
};
const location = { id: 'loc-1', path: ['Maison'] };

describe('import/start: identifiers (spec 027, FR-010)', () => {
  it('absent is valid (unchanged draft)', () => {
    expect(isMessage(start(draft()))).toBe(true);
  });

  it('clean values are valid', () => {
    const identifiers = {
      manufacturer: 'Fabricant Fictif',
      modelNumber: 'MOD-0001',
      serialNumber: 'SN-FICTIF-01',
    };
    expect(isMessage(start(draft({ identifiers })))).toBe(true);
  });

  it.each([null, {}, [], 'x', { manufacturer: '' }, { brand: 'x' }, { serialNumber: ' SN' }])(
    '%j is refused',
    (identifiers) => {
      expect(isMessage(start({ ...draft(), identifiers }))).toBe(false);
    },
  );

  it('a completed item (spec 021) never carries identifiers', () => {
    const complete = { entityId: 'item-1', itemName: 'Clavier', keys: ['photo'] };
    expect(
      isMessage(
        start(
          draft({ identifiers: { serialNumber: 'SN-FICTIF-01' }, complete: complete as never }),
        ),
      ),
    ).toBe(false);
  });

  it('with a template: the serial number only (D3)', () => {
    const base: Partial<ImportDraft> = { template, location };
    expect(
      isMessage(start(draft({ ...base, identifiers: { serialNumber: 'SN-FICTIF-01' } }))),
    ).toBe(true);
    expect(
      isMessage(start(draft({ ...base, identifiers: { manufacturer: 'Fabricant Fictif' } }))),
    ).toBe(false);
  });
});

describe('import/complete-preview: identifiers (spec 027, FR-013)', () => {
  const preview = (d: unknown) => ({
    type: 'import/complete-preview',
    instanceId: 'inst-a',
    entityId: 'item-1',
    draft: d,
  });

  it('a previewed draft without identifiers stays valid', () => {
    expect(isMessage(preview(draft()))).toBe(true);
  });

  it('a previewed draft with identifiers is refused', () => {
    expect(isMessage(preview(draft({ identifiers: { serialNumber: 'SN-FICTIF-01' } })))).toBe(
      false,
    );
  });
});
