import { mount, flushPromises } from '@vue/test-utils';
import DocumentPicker from '@/ui/components/DocumentPicker.vue';
import { readPdf, type PickedDocument } from '@/ui/read-pdf';
import { loadCatalog } from './i18n-harness';

// Texte attendu : valeur du catalogue (le composant passe par errorMessage → getMessage).
const NOT_A_PDF = loadCatalog('fr')['error.NOT_A_PDF']!;

const pdfFile = (name = 'facture.pdf') => new File(['%PDF-1.7\n1 0 obj'], name, { type: 'application/pdf' });

describe('readPdf', () => {
  it('accepte un vrai PDF', async () => {
    const r = await readPdf(pdfFile());
    expect(r.ok).toBe(true);
  });

  it('refuse un PNG renommé en .pdf → NOT_A_PDF', async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'photo.pdf', { type: 'application/pdf' });
    expect(await readPdf(png)).toEqual({ ok: false, error: 'NOT_A_PDF' });
  });

  it('refuse un fichier de plus de 15 Mo → FILE_TOO_LARGE', async () => {
    const big = new Blob([new Uint8Array(15 * 1024 * 1024 + 1)]);
    expect(await readPdf(big)).toEqual({ ok: false, error: 'FILE_TOO_LARGE' });
  });
});

describe('DocumentPicker', () => {
  async function pick(wrapper: ReturnType<typeof mount>, file: File) {
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
    await input.trigger('change');
    await flushPromises();
  }

  it('émet un document manuel avec son ManualFile', async () => {
    const wrapper = mount(DocumentPicker, { props: { allowReplace: true } });
    await wrapper.find('select').setValue('order_document');
    await pick(wrapper, pdfFile('bon.pdf'));
    const [picked] = wrapper.emitted('add')?.[0] as [PickedDocument];
    expect(picked.doc).toMatchObject({ origin: 'manual', kind: 'order_document', label: 'bon.pdf', pdfValid: true });
    expect(picked.file.docId).toBe(picked.doc.id);
    expect(picked.file.filename).toBe('bon.pdf');
    expect(picked.replaceDetected).toBe(true);
  });

  it("affiche « Le fichier n'est pas un PDF » et n'émet rien", async () => {
    const wrapper = mount(DocumentPicker);
    await pick(wrapper, new File(['<html>'], 'faux.pdf'));
    expect(wrapper.emitted('add')).toBeUndefined();
    expect(wrapper.text()).toContain(NOT_A_PDF);
  });
});
