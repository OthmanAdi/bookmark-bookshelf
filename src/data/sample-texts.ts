/**
 * Texts for the example links, keyed by link id. Each is original writing for this app in the markdown-lite
 * subset the reader understands, never an excerpt of the linked page. Backticks are escaped because the strings
 * are template literals.
 */
export const SAMPLE_TEXTS: Record<string, string> = {
  'example-what-is-a-url': `A web address has at most five parts, and they always come in the same order: scheme, authority, path, query, fragment. Labelling them on an example is the most likely test question.

## The example I practise on

\`https://library.example.org:8443/catalogue/search?q=maps&page=2#results\`

Scheme \`https\`. Authority \`library.example.org:8443\`, which is a host and then a port. Path \`/catalogue/search\`. Query \`q=maps&page=2\`, between the question mark and the hash sign. Fragment \`results\`, everything after the hash sign.

## Scheme

Everything before the first colon. It says how to fetch the thing. On the web that is nearly always \`https\` or \`http\`, and the s means the connection is encrypted. Other schemes exist: \`mailto:\` opens a new email instead of loading a page. Upper or lower case makes no difference, and it is normally written in lower case.

## Authority (host, sometimes a port)

It starts after the two slashes. Usually it is only a host name such as \`www.example.com\`, which I read from right to left: \`com\` is the top-level domain, \`example\` is the name someone registered under it, and \`www\` is a subdomain the owner chose. Case doesn’t matter in the host either.

A port appears only when the server listens on an unusual one. Without it the browser uses the default for the scheme, 443 for https and 80 for http, so \`https://example.com\` and \`https://example.com:443\` are the same address. Good trick question, write it down.

The authority can also start with a user name and an @ sign. In \`https://bank.example@evil.example\` the host is \`evil.example\`, and \`bank.example\` is only the user name. Some browsers ask before they follow an address like that.

## Path

From the first single slash after the host up to the \`?\` or \`#\`. It looks like folders on a computer, and sometimes it is, but the server decides what it means. The path can be case sensitive, so \`/Maps\` and \`/maps\` might be different pages, or one of them might not exist.

## Query

Starts at \`?\`. Most sites put pairs like \`key=value\` in it, joined with \`&\`, and that is how a search form sends what you typed. The pairs are a convention. The standard only says the query runs from the \`?\` to the \`#\` or the end.

## Fragment

The part after \`#\` points to a place inside the page, usually a heading. The browser keeps it to itself and never sends it to the server. That’s why jumping to another \`#section\` on the same page doesn’t reload anything.

## Characters that get encoded

Some characters can’t appear as they are, so they’re written as \`%\` followed by two hexadecimal digits. A space becomes \`%20\`. In search queries a \`+\` often stands for a space too, which comes from the way forms are encoded. An address full of percent signs usually works fine.

## URL or URI

A URI is any string that identifies something. A URL is a URI that also says where to find it. So every URL is a URI, and a book’s ISBN written as \`urn:isbn:\` plus the number is a URI that isn’t a URL. In the test, “URL” is fine everywhere except in a question about exactly this.

## Relative addresses

A link inside a page can leave out the start. On \`https://example.com/atlas/index.html\`, a link to \`images/map.png\` goes to \`https://example.com/atlas/images/map.png\`. With a slash in front, \`/images/map.png\` starts again from the host and goes to \`https://example.com/images/map.png\`.

## To ask in class

Do any sites still need the \`www\`? Every one I tried works without it.
`,

  'example-web-storage-api': `\`localStorage\` keeps strings under string keys, per origin, until something deletes them. \`sessionStorage\` has the same methods but belongs to one tab, and each tab gets its own. It survives a reload and ends when the tab closes.

Origin means scheme, host and port together. \`https://example.com\` and \`http://example.com\` don’t share storage, and neither do \`example.com\` and \`www.example.com\`.

Four calls cover nearly everything: \`setItem(key, value)\`, \`getItem(key)\`, \`removeItem(key)\` and \`clear()\`. \`getItem\` returns \`null\` for a key that was never set. To walk everything, \`length\` gives the count and \`key(index)\` the name at each position.

When a person has blocked site data, even reading \`window.localStorage\` throws a \`SecurityError\`, so the first access belongs in a \`try\` as well. Web workers have no Web Storage at all; it exists only on the window.

Values are always strings. \`setItem('count', 5)\` comes back as \`'5'\`. For anything structured, \`JSON.stringify\` going in and \`JSON.parse\` coming out, with the parse inside \`try\`, since an older version of the page may have written something else under the same key.

Every call is synchronous and blocks the page while it runs. Keep values small. Don’t write on every keystroke; wait until the typing pauses.

Space is a few megabytes per origin in current browsers. When it runs out, \`setItem\` throws a \`QuotaExceededError\`. Catch it and tell the person the save failed.

When one tab changes \`localStorage\`, the \`storage\` event fires in the other open tabs of the same origin. The tab that made the change gets no event. That is enough to keep two open tabs in step.

Private windows get their own storage, and the browser throws it away when the last private window closes. Clearing a site’s data in the browser settings deletes it as well. Keep anything that matters somewhere else too.

No secrets either. Every script on the page can read every key, including scripts the page loads from other sites. A login token is safer in a cookie marked \`HttpOnly\`, which scripts can’t read at all.

To look inside, open the developer tools: Application, then Local storage in Chrome, or the Storage tab in Firefox. Entries can be edited and deleted there by hand, which is the quickest way to see what a page does with an empty or broken value.

Quick check in the console: \`localStorage.setItem('hello', 'world')\`, reload, then \`localStorage.getItem('hello')\`. Try the same in a private window, close every private window, open a new one, and the key is gone.
`,

  'example-commonplace-book': `I copy sentences into a notebook by hand, and over the last two years I have come to think the copying matters more than the notebook. That is an awkward thing to believe while reading apps offer to collect every highlight for me and email a few back each week. I tried one of those services for most of a year. I opened the emails less and less, and by the end I was deleting them unread.

The notebook is a school exercise book with squared paper, the kind with a plain card cover that goes soft at the corners. I write the date, then the sentence, then where it came from. Under it I sometimes add a line of my own, and sometimes nothing. The pages are numbered at the top in pencil, and the last six are kept free for an index: a word and a page number.

A highlight costs nothing. One drag of a finger and the line turns yellow, and the reading carries on. Because it was free I highlighted generously, and a year of it produced several thousand lines that I had marked and never thought about again. A copied sentence costs about a minute, more if it is long or my hand is tired. That price does the sorting for me. Before I start writing I have to decide that this sentence is worth a minute, and most sentences are not, even good ones. The notebook ends up holding perhaps one line for every fifty I would once have highlighted, and I can say why each one is there.

Copying also slows the reading down to the speed of a pen, and at that speed I see things I missed. A comma I had read straight past turns out to be holding the whole sentence up. A word I took for a loose synonym is the exact one. More often than I like to admit, I get halfway through copying something and realise it is less good than I thought: the rhythm carried me along, and the claim underneath is ordinary. Those half-copied lines stay in the book with a line through them. I used to tear such pages out. Now I think they are some of the most useful entries, because they show me what kind of sentence fools me.

Here is one that survived:

> Newspapers are produced with rapidity, to be read with rapidity.

Arnold Bennett wrote it in a short book about how to use the hours that work leaves over, and he meant it as a reason to keep the morning train for something slower than the news. I copied it into my phone on a train, in the middle of scrolling through the news, and into the book that evening. Underneath I wrote the date and “the same goes for most of what I read on this phone”. I still think that is true, and I still read the news on the train. The entry has not changed the habit, though I notice the habit more.

The obvious objection is that a paper notebook cannot be searched. That is true, and I mind it less than I expected. I rarely need to find a particular sentence. When I do, I usually remember roughly when I read it, and between the dates and the index at the back I find it. Copying also helps me remember. A sentence I have written out by hand is one I can often recite a month later, and I could not recite a single one of my old highlights.

Most of what I copy now comes from a screen, and in my handwriting a line from an unsigned web page looks exactly like a line from a famous essay. I read them back with the same eyes. More than once the unsigned one has held up better. I like that the book has no way of knowing which sentences came with a reputation.

I keep the book in the order I read, with no headings and no sections for topics. I tried topics once, with a page each for work, for cooking, for the garden and for whatever did not fit, and I spent more time deciding where a sentence belonged than thinking about what it said. A chronological book looks messy. It also keeps a line about grief next to a line about bread because I read them in the same week, and sometimes the two of them start a conversation I would never have arranged on purpose.

Once a year, usually in the slow days between Christmas and the new year, I read the whole book from the first page. The early entries embarrass me a little. Some of what I copied two years ago now seems obvious, and a few lines I copied with real excitement I no longer understand at all. That embarrassment is the best record I have of how my reading has changed. A list of finished books only tells me what I got through, while the notebook keeps the places where I stopped.

I copy exactly, including punctuation I would not have chosen, and put my own words on a separate line underneath. For a book I note the page, and for anything online I write out the full address, because a title on its own is often not enough to find a page a few years later. The pen is deliberate too: it means I can’t tidy the book later into something I wish I had read.

The current book has ninety-six pages and I am on page seventy-one. The next one is already in the drawer, the same squared kind, because the squares keep my lines straight when I write on my knee.
`,

  'example-paper-size': `Before a worksheet goes to the copier:

1. Check which page size the file was made in. A4 is 210 × 297 mm. US Letter is 8.5 × 11 inches, about 216 × 279 mm.
2. If it came from someone in the US or Canada, assume Letter until I have looked.
3. An A4 file printed on Letter without scaling loses about 18 mm at the bottom. A Letter file on A4 is about 6 mm too wide. Either way, tick “fit to printable area” or the copier’s nearest setting.
4. Keep at least 10 mm of margin all round, because the office printer can’t print to the edge.
5. Count the sheets before starting: pages × students, plus three spares.

Scaling on the copier:

- A4 to A5, or A3 to A4: 71%.
- A5 to A4, or A4 to A3: 141%.
- Every A size is the one above it cut in half across the long side, and the sides keep the ratio 1 to √2. Halving the area divides each side by √2, which is where the 71% comes from.

Booklets and halves:

- An A5 booklet is A4 sheets folded in half. Each sheet holds four pages, two on each side, so the page count has to be a multiple of four. Fill any gap at the end with blank pages or a page for notes.
- Two A5 handouts on one A4 sheet: print two pages per sheet, then cut it in half so each piece is 148 × 210 mm.
- A3 is two A4 sheets side by side, which helps when a poster has to be printed in two halves and taped together.
- A0 is one square metre, and A4 is a sixteenth of it.
`,
};
