import {
  analyzeVariantCopyTweaks,
  applyVariantCopyTweak,
} from "../tweak-text";

describe("deterministic copy tweaks", () => {
  it("indexes visible JSX text and common string props", () => {
    const source = `
      export default function HeroCard() {
        return (
          <section aria-label="Hero card" title="Premium card">
            <h2>Move faster with better signals</h2>
            <p>Ship cleaner copy changes.</p>
          </section>
        );
      }
    `;

    const entries = analyzeVariantCopyTweaks(source);
    expect(entries).toEqual([
      expect.objectContaining({
        kind: "string-prop",
        label: "aria-label prop",
        currentValue: "Hero card",
      }),
      expect.objectContaining({
        kind: "string-prop",
        label: "title prop",
        currentValue: "Premium card",
      }),
      expect.objectContaining({
        kind: "jsx-text",
        currentValue: "Move faster with better signals",
      }),
      expect.objectContaining({
        kind: "jsx-text",
        currentValue: "Ship cleaner copy changes.",
      }),
    ]);
  });

  it("applies a targeted JSX text replacement without touching neighbors", () => {
    const source = `
      export default function Callout() {
        return <button aria-label="Approve">Approve order</button>;
      }
    `;
    const entry = analyzeVariantCopyTweaks(source).find((candidate) => candidate.currentValue === "Approve order");
    expect(entry).toBeDefined();

    const result = applyVariantCopyTweak(source, {
      id: entry!.id,
      nextValue: "Approve invoice",
    });

    expect(result.code).toContain(">Approve invoice<");
    expect(result.code).toContain('aria-label="Approve"');
  });

  it("rejects JSX replacements that would inject expressions", () => {
    const source = `export default function Callout(){ return <button>Approve order</button>; }`;
    const entry = analyzeVariantCopyTweaks(source)[0];

    expect(() =>
      applyVariantCopyTweak(source, {
        id: entry!.id,
        nextValue: "{danger}",
      })
    ).toThrow(/cannot introduce JSX/i);
  });
});
