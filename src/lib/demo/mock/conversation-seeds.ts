export type DemoMessage = {
	fromMe: boolean;
	reactions?: number;
	// Quoted line shown above the bubble, as if replying to that message.
	replyToText?: string;
} & (
	| { kind?: "text"; text: string }
	| { kind: "image" }
	| { kind: "expiringImage"; expired?: boolean }
	| { kind: "video"; expired?: boolean; needsLoad?: boolean }
	| {
			kind: "album";
			albumId: number;
			expiring?: "v1" | "v2";
			locked?: boolean;
			unseen?: boolean;
			coverUrl?: null;
	  }
	| {
			kind: "albumContent";
			albumId: number;
			reply?: string;
			locked?: boolean;
			expired?: boolean;
	  }
	| { kind: "unsent" }
);

export type DemoConversation = {
	withId: number;
	unread: number;
	pinned: boolean;
	favorite: boolean;
	muted: boolean;
	lastActivityAgo: number;
	messages: DemoMessage[];
};

export const demoConversationSeeds: DemoConversation[] = [
	{
		withId: 100001,
		unread: 2,
		pinned: false,
		favorite: true,
		muted: false,
		lastActivityAgo: 4,
		messages: [
			{ fromMe: false, text: "Hey! Lorem ipsum dolor sit amet." },
			{
				fromMe: true,
				text: "Hello — consectetur adipiscing elit.",
				reactions: 1,
			},
			{ fromMe: false, text: "Sed do eiusmod tempor incididunt?" },
			{ fromMe: false, kind: "album", albumId: 5001, unseen: true },
			{
				fromMe: true,
				kind: "albumContent",
				albumId: 5001,
				reply: "this one's great",
			},
			{ fromMe: false, kind: "albumContent", albumId: 5001 },
			{
				fromMe: false,
				kind: "albumContent",
				albumId: 5001,
				reply: "can't see it anymore",
				expired: true,
			},
			{
				fromMe: false,
				kind: "albumContent",
				albumId: 5001,
				locked: true,
			},
			// Kept last so this conversation's preview stays an Album, which
			// demo.test.ts asserts.
			{
				fromMe: false,
				kind: "album",
				albumId: 5001,
				coverUrl: null,
				unseen: true,
			},
		],
	},
	{
		withId: 100006,
		unread: 1,
		pinned: false,
		favorite: false,
		muted: false,
		lastActivityAgo: 1,
		messages: [
			{ fromMe: false, text: "👀" },
			{ fromMe: true, text: "Lorem ipsum?" },
			{ fromMe: true, kind: "expiringImage" },
			{ fromMe: false, kind: "expiringImage", expired: true },
			{ fromMe: false, text: "Did you catch it? 🔥" },
			{
				fromMe: true,
				text: "https://example.com/a/very/long/link/with/no/spaces/in/it/at/all?utm_source=demo&utm_campaign=wrapping",
			},
			{
				fromMe: false,
				replyToText:
					"A quoted line long enough that it has to be truncated rather than widen the conversation past the screen",
				text: "Sed ut perspiciatis unde omnis.",
			},
			{ fromMe: false, kind: "video" },
			{ fromMe: true, kind: "video", needsLoad: true },
			{ fromMe: false, kind: "video", expired: true },
			// Kept last so this conversation's preview stays an Image, which
			// demo.test.ts asserts.
			{ fromMe: false, kind: "image", reactions: 1 },
		],
	},
	{
		withId: 100009,
		unread: 0,
		pinned: true,
		favorite: false,
		muted: false,
		lastActivityAgo: 52,
		messages: [
			{ fromMe: true, text: "Quis nostrud exercitation." },
			{ fromMe: false, text: "Ullamco laboris nisi." },
			{ fromMe: true, kind: "unsent" },
			{
				fromMe: false,
				kind: "album",
				albumId: 5002,
				expiring: "v1",
				locked: true,
			},
			{ fromMe: true, text: "Ut aliquip ex ea commodo." },
		],
	},
	{
		withId: 100250,
		unread: 0,
		pinned: false,
		favorite: false,
		muted: true,
		lastActivityAgo: 18,
		messages: [
			{ fromMe: false, text: "Lorem ipsum" },
			{ fromMe: false, kind: "album", albumId: 5003, expiring: "v2" },
			{ fromMe: true, text: "ok 👍" },
		],
	},
	{
		withId: 100777,
		unread: 3,
		pinned: false,
		favorite: false,
		muted: false,
		lastActivityAgo: 7,
		messages: [
			{ fromMe: false, text: "Lorem ipsum dolor sit amet consectetur." },
			{ fromMe: false, text: "Lorem ipsum dolor sit amet." },
			{ fromMe: false, text: "Lorem ipsum dolor sit." },
		],
	},
	{
		withId: 100002,
		unread: 0,
		pinned: false,
		favorite: false,
		muted: false,
		lastActivityAgo: 320,
		messages: [
			{ fromMe: true, text: "Duis aute irure dolor." },
			{ fromMe: false, kind: "expiringImage" },
			{ fromMe: false, text: "🐻 lorem ipsum", reactions: 2 },
		],
	},
];

export function localDateTime(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 19);
}
