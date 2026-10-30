import { describe, expect, it } from "vitest";
import { formatDate } from "#i18n/fi";
import { presentDescription } from "#presentation/description";

describe("post reading presentation", () => {
	it("removes only a matching normalized leading title and cleans hashtag blocks", () => {
		expect(
			presentDescription(
				" Ääni   levy ",
				"\nA\u0308äni levy\n\nTässä #punk, ja #rock!\n\n#Punk #Rock\nHinta # 1",
			),
		).toEqual({
			text: "Tässä punk, ja rock!\n\nHinta # 1",
			omittedTitle: true,
		});
	});
	it("preserves a different first line and ordinary hashes", () => {
		expect(
			presentDescription("Oma otsikko", "Uusi otsikko\n\n#1 ja C#"),
		).toEqual({ text: "Uusi otsikko\n\n1 ja C#", omittedTitle: false });
		expect(presentDescription("X", "")).toEqual({
			text: "",
			omittedTitle: false,
		});
	});
	it("formats dates in Helsinki independently of server timezone", () => {
		expect(formatDate("2026-09-01T22:00:00Z")).toBe("2.9.2026");
	});
});
