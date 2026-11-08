import { mount, flushPromises } from '@vue/test-utils';
import DocumentPicker from '@/ui/components/DocumentPicker.vue';
import { readPdf, type PickedDocument } from '@/ui/read-pdf';
import { loadCatalog, setTestLanguage } from './i18n-harness';

// Expected text: catalog value (the component goes through errorMessage → getMessage).
const NOT_A_PDF = loadCatalog('fr')['error.NOT_A_PDF']!;

const pdfFile = (name = 'facture.pdf') => new File(['%PDF-1.7\n1 0 obj'], name, { type: 'application/pdf' });

describe('readPdf', () => {
  it('accepts a real PDF', async () => {
    const r = await readPdf(pdfFile());
    expect(r.ok).toBe(true);
  });

  it('rejects a PNG renamed to .pdf → NOT_A_PDF', async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'photo.pdf', { type: 'application/pdf' });
    expect(await readPdf(png)).toEqual({ ok: false, error: 'NOT_A_PDF' });
  });

  it('rejects a file larger than 15 MB → FILE_TOO_LARGE', async () => {
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

  it('emits a manual document with its ManualFile', async () => {
    const wrapper = mount(DocumentPicker, { props: { allowReplace: true } });
    await wrapper.find('select').setValue('order_document');
    await pick(wrapper, pdfFile('bon.pdf'));
    const [picked] = wrapper.emitted('add')?.[0] as [PickedDocument];
    expect(picked.doc).toMatchObject({ origin: 'manual', kind: 'order_document', label: 'bon.pdf', pdfValid: true });
    expect(picked.file.docId).toBe(picked.doc.id);
    expect(picked.file.filename).toBe('bon.pdf');
    expect(picked.replaceDetected).toBe(true);
  });

  it("displays 'Le fichier n'est pas un PDF' and emits nothing", async () => {
    const wrapper = mount(DocumentPicker);
    await pick(wrapper, new File(['<html>'], 'faux.pdf'));
    expect(wrapper.emitted('add')).toBeUndefined();
    expect(wrapper.text()).toContain(NOT_A_PDF);
  });

  it('in English: displays the NOT_A_PDF message from the en.yml catalog', async () => {
    setTestLanguage('en');
    const wrapper = mount(DocumentPicker);
    await pick(wrapper, new File(['<html>'], 'fake.pdf'));
    expect(wrapper.emitted('add')).toBeUndefined();
    expect(wrapper.text()).toContain(loadCatalog('en')['error.NOT_A_PDF']!);
    expect(wrapper.text()).toContain('The file is not a PDF.');
  });
});
