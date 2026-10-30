export const locale = {
	language: "fi",
	locale: "fi-FI",
	timeZone: "Europe/Helsinki",
} as const;
export const messages = {
	home: "Etusivu",
	archive: "Arkisto",
	navigation: "Päävalikko",
	archivePages: "Arkiston sivut",
	tags: "Tunnisteet",
	empty: "Julkaisuja ei vielä ole.",
	intro: "Tutustu kokoelman julkaisuihin.",
	introLabel: "Levyjä · tarinoita · muistoja",
	postLabel: "Klamydiakokoelma / Julkaisu",
	archiveLabel: "Klamydiakokoelma",
	latest: "Uusimmat julkaisut",
	allPosts: "Kaikki julkaisut",
	coverMissing: "Kuvaa ei saatavilla",
	imageCount: (count: number) =>
		`${new Intl.NumberFormat(locale.locale).format(count)} kuvaa`,
	invalidPage: "Virheellinen sivunumero",
	invalidTitle: "Virheellinen sivu",
	goArchive: "Siirry arkistoon",
	notFound: "Ei löytynyt",
	postNotFound: "Julkaisua ei löytynyt",
	images: "Kuvat",
	backArchive: "Takaisin arkistoon",
	source: "Alkuperäinen julkaisu",
	defaultDescription: "Klamydiakokoelman julkaisuja.",
	older: "Vanhemmat",
	newer: "Uudemmat",
	page: (number: number) => `Sivu ${number}`,
} as const;
const dates = new Intl.DateTimeFormat(locale.locale, {
	timeZone: locale.timeZone,
	day: "numeric",
	month: "numeric",
	year: "numeric",
});
export const formatDate = (value: string) => dates.format(new Date(value));
