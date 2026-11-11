import {
  LINK_ONLY_EXAMPLE,
  addLink,
  closeReader,
  expect,
  expectReaderOpen,
  listRowFor,
  makeParagraphs,
  openApp,
  originalLink,
  pasteField,
  primaryAction,
  readerBody,
  readerOf,
  reloadApp,
  rowTitle,
  showList,
  stageOf,
  test,
} from './fixtures';

const URL_ONLY = 'https://example.org/only-a-link';
/** Long enough that it does not fit on one screen, so opening it is not the same as having read it. */
const PASTED = `# A pasted heading

First pasted paragraph.

- one
- two

${makeParagraphs(40)}`;

test.describe('a link with no text', () => {
  test('the action under the row is "Add text", beside a safe link to the original', async ({ page }) => {
    await openApp(page);
    await addLink(page, { url: URL_ONLY, title: 'Only a link' });

    await expect(primaryAction(page)).toHaveText('Add text');
    await expect(stageOf(page).getByRole('button', { name: 'Read', exact: true })).toHaveCount(0);

    const original = originalLink(page);
    await expect(original).toHaveAccessibleName('Open original, opens in a new tab');
    await expect(original).toHaveAttribute('href', URL_ONLY);
    await expect(original).toHaveAttribute('target', '_blank');
    await expect(original).toHaveAttribute('rel', /noopener/);
    await expect(original).toHaveAttribute('rel', /noreferrer/);
  });

  test('"Add text" opens the reader on its field; saving shows the text and it survives a reload', async ({ page }) => {
    await openApp(page);
    await addLink(page, { url: URL_ONLY, title: 'Only a link' });

    await primaryAction(page).click();
    await expectReaderOpen(page);
    const reader = readerOf(page);
    await expect(pasteField(page)).toBeFocused();
    await expect(readerBody(page).getByRole('heading', { name: 'No text saved yet' })).toBeVisible();
    await expect(readerBody(page)).toContainText('Paste the part of the page you want to read.');
    // The field is already open, so no button offers to open it.
    await expect(reader.getByRole('button', { name: 'Edit text' })).toHaveCount(0);
    const original = reader.getByRole('link', { name: /^Open original/ });
    await expect(original).toHaveAttribute('href', URL_ONLY);
    await expect(original).toHaveAttribute('rel', /noopener/);
    await expect(original).toContainText('example.org');

    await pasteField(page).fill(PASTED);
    await reader.getByRole('button', { name: 'Save text' }).click();

    await expect(readerBody(page).getByRole('heading', { level: 2 })).toHaveText('A pasted heading');
    await expect(readerBody(page).getByRole('paragraph').first()).toHaveText('First pasted paragraph.');
    await expect(readerBody(page).getByRole('paragraph')).toHaveCount(41);
    await expect(readerBody(page).getByRole('listitem')).toHaveCount(2);
    await expect(readerBody(page).getByRole('heading', { name: 'No text saved yet' })).toHaveCount(0);
    await expect(pasteField(page)).toHaveCount(0);
    await expect(reader.getByRole('button', { name: 'Edit text' })).toBeVisible();

    await closeReader(page);
    await expect(stageOf(page).getByRole('button', { name: 'Add text' })).toHaveCount(0);

    await reloadApp(page);
    await expect(stageOf(page).getByRole('button', { name: 'Add text' })).toHaveCount(0);
    await primaryAction(page).click();
    await expectReaderOpen(page);
    await expect(readerBody(page).getByRole('heading', { level: 2 })).toHaveText('A pasted heading');
    await expect(readerBody(page).getByRole('heading', { name: 'No text saved yet' })).toHaveCount(0);
  });

  test('a text that was only pasted, not read, is offered as "Read"', async ({ page }) => {
    await openApp(page);
    await addLink(page, { url: URL_ONLY, title: 'Only a link' });
    await primaryAction(page).click();
    await expectReaderOpen(page);
    await pasteField(page).fill(PASTED);
    await readerOf(page).getByRole('button', { name: 'Save text' }).click();
    await expect(readerBody(page).getByRole('paragraph')).toHaveCount(41);

    await closeReader(page);
    await expect(primaryAction(page)).toHaveText('Read');
    await reloadApp(page);
    await expect(primaryAction(page)).toHaveText('Read');
  });

  test('a text can be pasted as it comes: line breaks stay, bullets become a list, extra blank lines collapse', async ({ page }) => {
    await openApp(page);
    await addLink(page, { url: 'https://example.org/pasted-as-it-comes', title: 'Pasted as it comes' });
    await primaryAction(page).click();
    await expectReaderOpen(page);

    await pasteField(page).fill('First line\nsecond line of the same paragraph\n\n\n\n\nA paragraph after many blank lines.\n\n• one\n• two\n• three');
    await readerOf(page).getByRole('button', { name: 'Save text' }).click();

    const paragraphs = readerBody(page).getByRole('paragraph');
    await expect(paragraphs).toHaveCount(2);
    await expect(paragraphs.first().locator('br')).toHaveCount(1);
    await expect(paragraphs.nth(1)).toHaveText('A paragraph after many blank lines.');
    await expect(readerBody(page).getByRole('listitem')).toHaveText(['one', 'two', 'three']);
  });

  test('an example with no text behaves the same way from the list', async ({ page }) => {
    await openApp(page);
    await showList(page);
    const title = rowTitle(listRowFor(page, LINK_ONLY_EXAMPLE.id));
    await expect(title).toHaveAccessibleName(`${LINK_ONLY_EXAMPLE.title}. Add text`);
    await title.click();
    await expectReaderOpen(page);
    await expect(pasteField(page)).toBeFocused();
    await expect(readerBody(page).getByRole('heading', { name: 'No text saved yet' })).toBeVisible();
    // Nothing was written for this link, so no line speaks of an example text.
    await expect(readerOf(page).getByText('Example text written for this app.')).toHaveCount(0);
  });
});
