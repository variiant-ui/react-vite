export type VariantCopyTweakEntry = {
  id: string;
  kind: "jsx-text" | "string-prop";
  label: string;
  currentValue: string;
  start: number;
  end: number;
};

const preferredStringPropNames = new Set([
  "title",
  "subtitle",
  "label",
  "aria-label",
  "placeholder",
  "alt",
  "caption",
  "description",
  "helperText",
  "helper",
  "message",
]);

export function analyzeVariantCopyTweaks(source: string): VariantCopyTweakEntry[] {
  const entries: VariantCopyTweakEntry[] = [];
  const occupiedRanges: Array<{ start: number; end: number }> = [];

  const jsxTextPattern = />([^<>{]+)</g;
  let jsxTextMatch: RegExpExecArray | null;
  while ((jsxTextMatch = jsxTextPattern.exec(source)) !== null) {
    const rawValue = jsxTextMatch[1] ?? "";
    const normalizedValue = normalizeWhitespace(rawValue);
    if (!shouldIndexCopyValue(normalizedValue)) {
      continue;
    }

    const leadingWhitespaceLength = rawValue.length - rawValue.trimStart().length;
    const trailingWhitespaceLength = rawValue.length - rawValue.trimEnd().length;
    const start = jsxTextMatch.index + 1 + leadingWhitespaceLength;
    const end = jsxTextMatch.index + 1 + rawValue.length - trailingWhitespaceLength;
    if (hasOverlappingRange(occupiedRanges, start, end)) {
      continue;
    }

    occupiedRanges.push({ start, end });
    entries.push({
      id: `jsx-text:${start}:${end}`,
      kind: "jsx-text",
      label: "Visible text",
      currentValue: source.slice(start, end),
      start,
      end,
    });
  }

  const stringPropPattern = /\b([A-Za-z_:-][A-Za-z0-9_:-]*)\s*=\s*"([^"\n{}<>]*)"/g;
  let stringPropMatch: RegExpExecArray | null;
  while ((stringPropMatch = stringPropPattern.exec(source)) !== null) {
    const propName = stringPropMatch[1] ?? "";
    const rawValue = stringPropMatch[2] ?? "";
    const normalizedValue = normalizeWhitespace(rawValue);
    if (!shouldIndexStringProp(propName, normalizedValue)) {
      continue;
    }

    const matchText = stringPropMatch[0];
    const quoteOffset = matchText.indexOf(`"${rawValue}"`);
    if (quoteOffset === -1) {
      continue;
    }

    const start = stringPropMatch.index + quoteOffset + 1;
    const end = start + rawValue.length;
    if (hasOverlappingRange(occupiedRanges, start, end)) {
      continue;
    }

    occupiedRanges.push({ start, end });
    entries.push({
      id: `string-prop:${propName}:${start}:${end}`,
      kind: "string-prop",
      label: `${propName} prop`,
      currentValue: rawValue,
      start,
      end,
    });
  }

  return entries.sort((left, right) => left.start - right.start);
}

export function applyVariantCopyTweak(
  source: string,
  input: {
    id: string;
    nextValue: string;
  },
): {
  code: string;
  entry: VariantCopyTweakEntry;
} {
  const entry = analyzeVariantCopyTweaks(source).find((candidate) => candidate.id === input.id);
  if (!entry) {
    throw new Error("The requested tweak entry no longer exists in the target file.");
  }

  const nextValue = input.nextValue;
  if (entry.kind === "jsx-text") {
    if (/[{}<>]/.test(nextValue)) {
      throw new Error("JSX text tweaks cannot introduce JSX or expression delimiters.");
    }
  } else if (/[\r\n]/.test(nextValue)) {
    throw new Error("String-prop tweaks must stay on one line.");
  }

  const serializedValue = entry.kind === "string-prop"
    ? escapeStringLiteral(nextValue)
    : nextValue;

  return {
    code: `${source.slice(0, entry.start)}${serializedValue}${source.slice(entry.end)}`,
    entry,
  };
}

function shouldIndexCopyValue(value: string): boolean {
  return value.length > 0 && /[A-Za-z0-9]/.test(value);
}

function shouldIndexStringProp(propName: string, value: string): boolean {
  if (!shouldIndexCopyValue(value)) {
    return false;
  }

  const normalizedProp = propName.trim();
  if (preferredStringPropNames.has(normalizedProp)) {
    return true;
  }

  return /label|title|copy|text|placeholder|message|caption|description|helper|alt/i.test(normalizedProp);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hasOverlappingRange(
  ranges: Array<{ start: number; end: number }>,
  start: number,
  end: number,
): boolean {
  return ranges.some((range) => start < range.end && end > range.start);
}

function escapeStringLiteral(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"');
}
