type Phrase = { id: string; text: string; type: string };

// Seeded with the kind of opener the bar exists for, so the chips have
// something in them the first time a demo composer is opened.
const phrases: Phrase[] = [
	{ id: "phrase-1", text: "Hey, how's it going?", type: "user" },
	{ id: "phrase-2", text: "What are you up to tonight?", type: "user" },
];

let nextId = phrases.length + 1;

export function demoSavedPhrases(): Phrase[] {
	return phrases;
}

export function demoCreateSavedPhrase(text: string): Phrase {
	const phrase: Phrase = {
		id: `phrase-${(nextId += 1)}`,
		text,
		type: "user",
	};
	phrases.push(phrase);
	return phrase;
}

export function demoDeleteSavedPhrase(id: string): void {
	const index = phrases.findIndex((phrase) => phrase.id === id);
	if (index !== -1) phrases.splice(index, 1);
}
